import { describe, expect, it } from "vitest";
import type { ConditionGroup } from "@/db/schema/automations";
import { evaluateConditions, explain, testCondition, triggerAllows } from "./evaluate";
import { inBusinessHours } from "./hours";
import { fieldsFor } from "./fields";

const inbox = { network: "instagram", kind: "comment", text: "I want a refund for order 12", contact_tags: ["vip", "wholesale"], priority: "normal", business_hours: true, first_message: true, rating: null };
const group = (match: "all" | "any", ...conditions: ConditionGroup["conditions"]): ConditionGroup => ({ match, conditions });

describe("testCondition", () => {
  it("compares strings case-insensitively with eq/neq", () => {
    expect(testCondition({ field: "network", op: "eq", value: "Instagram" }, inbox).matched).toBe(true);
    expect(testCondition({ field: "network", op: "neq", value: "instagram" }, inbox).matched).toBe(false);
    expect(testCondition({ field: "network", op: "neq", value: "tiktok" }, inbox).matched).toBe(true);
  });

  it("matches substrings with contains and rejects an empty needle", () => {
    expect(testCondition({ field: "text", op: "contains", value: "REFUND" }, inbox).matched).toBe(true);
    expect(testCondition({ field: "text", op: "contains", value: "chargeback" }, inbox).matched).toBe(false);
    expect(testCondition({ field: "text", op: "contains", value: "  " }, inbox).matched).toBe(false);
  });

  it("treats array facts as membership for eq/in and substring for contains", () => {
    expect(testCondition({ field: "contact_tags", op: "eq", value: "vip" }, inbox).matched).toBe(true);
    expect(testCondition({ field: "contact_tags", op: "eq", value: "vi" }, inbox).matched).toBe(false);
    expect(testCondition({ field: "contact_tags", op: "contains", value: "hole" }, inbox).matched).toBe(true);
    expect(testCondition({ field: "contact_tags", op: "in", value: "press, vip" }, inbox).matched).toBe(true);
    expect(testCondition({ field: "contact_tags", op: "neq", value: "vip" }, inbox).matched).toBe(false);
  });

  it("applies regular expressions case-insensitively and reports bad ones", () => {
    expect(testCondition({ field: "text", op: "matches", value: "order \\d+" }, inbox).matched).toBe(true);
    const bad = testCondition({ field: "text", op: "matches", value: "([" }, inbox);
    expect(bad.matched).toBe(false);
    expect(bad.note).toBe("invalid regular expression");
    expect(testCondition({ field: "text", op: "matches", value: "a".repeat(201) }, inbox).note).toBe("pattern is too long");
  });

  it("coerces numbers for gt/lt and refuses non-numeric values", () => {
    const facts = { spend_percent: 82.5, budget: "1000", objective: "leads" };
    expect(testCondition({ field: "spend_percent", op: "gt", value: "80" }, facts).matched).toBe(true);
    expect(testCondition({ field: "spend_percent", op: "lt", value: "80" }, facts).matched).toBe(false);
    expect(testCondition({ field: "budget", op: "gt", value: "999" }, facts).matched).toBe(true);
    expect(testCondition({ field: "objective", op: "gt", value: "3" }, facts)).toMatchObject({ matched: false, note: "not a number" });
  });

  it("compares booleans as text", () => {
    expect(testCondition({ field: "business_hours", op: "eq", value: "true" }, inbox).matched).toBe(true);
    expect(testCondition({ field: "business_hours", op: "eq", value: "false" }, inbox).matched).toBe(false);
  });

  it("never matches a field the trigger does not publish", () => {
    const r = testCondition({ field: "spend_percent", op: "gt", value: "1" }, inbox);
    expect(r).toMatchObject({ matched: false, note: "unknown field for this trigger" });
  });

  it("treats a null fact as empty rather than throwing", () => {
    expect(testCondition({ field: "rating", op: "lt", value: "3" }, inbox).matched).toBe(false);
    expect(testCondition({ field: "rating", op: "eq", value: "" }, inbox).matched).toBe(true);
  });
});

describe("evaluateConditions", () => {
  it("requires every condition under all", () => {
    const g = group("all", { field: "network", op: "eq", value: "instagram" }, { field: "text", op: "contains", value: "refund" });
    expect(evaluateConditions(g, inbox).matched).toBe(true);
    expect(evaluateConditions(group("all", ...g.conditions, { field: "priority", op: "eq", value: "urgent" }), inbox).matched).toBe(false);
  });

  it("requires only one condition under any", () => {
    const g = group("any", { field: "network", op: "eq", value: "tiktok" }, { field: "text", op: "contains", value: "refund" });
    expect(evaluateConditions(g, inbox).matched).toBe(true);
    expect(evaluateConditions(group("any", { field: "network", op: "eq", value: "tiktok" }), inbox).matched).toBe(false);
  });

  it("matches everything when there are no conditions", () => {
    const e = evaluateConditions(group("all"), inbox);
    expect(e.matched).toBe(true);
    expect(e.explanation).toContain("no conditions");
  });

  it("records every condition with the value it saw", () => {
    const e = evaluateConditions(group("all", { field: "priority", op: "eq", value: "urgent" }), inbox);
    expect(e.results).toEqual([{ field: "priority", op: "eq", value: "urgent", actual: "normal", matched: false }]);
  });

  it("defaults an unknown match mode to all", () => {
    const g = { match: "every", conditions: [{ field: "network", op: "eq", value: "tiktok" }] } as unknown as ConditionGroup;
    expect(evaluateConditions(g, inbox)).toMatchObject({ match: "all", matched: false });
  });
});

describe("explain", () => {
  it("names the conditions that carried the match", () => {
    const e = evaluateConditions(group("all", { field: "network", op: "eq", value: "instagram" }, { field: "text", op: "contains", value: "refund" }), inbox);
    expect(e.explanation).toBe('matched because network = "instagram" and text contains "refund"');
  });

  it("names only the satisfied condition under any", () => {
    const e = evaluateConditions(group("any", { field: "network", op: "eq", value: "tiktok" }, { field: "text", op: "contains", value: "refund" }), inbox);
    expect(e.explanation).toBe('matched because text contains "refund"');
  });

  it("shows the blocking condition and the value it saw when it fails", () => {
    const e = evaluateConditions(group("all", { field: "priority", op: "eq", value: "urgent" }), inbox);
    expect(e.explanation).toBe('did not match: priority = "urgent" (was "normal")');
  });

  it("is a pure function of its inputs", () => {
    const results = [{ field: "kind", op: "eq" as const, value: "review", actual: "comment", matched: false }];
    expect(explain("all", results, false)).toContain("did not match");
    expect(explain("all", results, true)).toContain("matched because");
  });
});

describe("field catalog", () => {
  it("offers only operators that make sense for the field type", () => {
    const rating = fieldsFor("inbox.message_received").find((f) => f.key === "rating")!;
    expect(rating.ops).toContain("gt");
    expect(rating.ops).not.toContain("contains");
  });

  it("publishes a field for every fact the inbox trigger supplies", () => {
    const keys = fieldsFor("inbox.message_received").map((f) => f.key);
    for (const key of Object.keys(inbox)) expect(keys).toContain(key);
  });
});

describe("triggerAllows", () => {
  const budget = { trigger: "campaign.budget_threshold" as const, triggerConfig: { thresholdPercent: 80 } };
  const subject = (facts: Record<string, unknown>, channelId?: string) => ({ facts: facts as never, ctx: { channelId } });

  it("holds a budget rule back until the threshold is reached", () => {
    expect(triggerAllows(budget, subject({ spend_percent: 79.9 }))).toBe(false);
    expect(triggerAllows(budget, subject({ spend_percent: 80 }))).toBe(true);
    expect(triggerAllows(budget, subject({ spend_percent: 140 }))).toBe(true);
  });

  it("defaults the budget threshold to 80 percent", () => {
    const noConfig = { trigger: "campaign.budget_threshold" as const, triggerConfig: {} };
    expect(triggerAllows(noConfig, subject({ spend_percent: 79 }))).toBe(false);
    expect(triggerAllows(noConfig, subject({ spend_percent: 81 }))).toBe(true);
  });

  it("limits a rule to its chosen channels", () => {
    const scoped = { trigger: "inbox.message_received" as const, triggerConfig: { channelIds: ["ch-1"] } };
    expect(triggerAllows(scoped, subject({}, "ch-1"))).toBe(true);
    expect(triggerAllows(scoped, subject({}, "ch-2"))).toBe(false);
  });

  it("treats an empty channel list as every channel", () => {
    const open = { trigger: "inbox.message_received" as const, triggerConfig: {} };
    expect(triggerAllows(open, subject({}, "ch-9"))).toBe(true);
  });
});

describe("inBusinessHours", () => {
  // 2026-08-27 is a Thursday; 2026-08-29 is a Saturday.
  it("is true inside Mon-Fri 09:00-17:00 in the workspace timezone", () => {
    expect(inBusinessHours(new Date("2026-08-27T14:00:00Z"), "UTC")).toBe(true);
    expect(inBusinessHours(new Date("2026-08-27T09:00:00Z"), "UTC")).toBe(true);
  });

  it("is false before nine, at five, and on weekends", () => {
    expect(inBusinessHours(new Date("2026-08-27T08:59:00Z"), "UTC")).toBe(false);
    expect(inBusinessHours(new Date("2026-08-27T17:00:00Z"), "UTC")).toBe(false);
    expect(inBusinessHours(new Date("2026-08-29T12:00:00Z"), "UTC")).toBe(false);
  });

  it("reads the clock in the workspace timezone, not UTC", () => {
    const at = new Date("2026-08-27T14:00:00Z"); // 07:00 in Los Angeles, 23:00 in Tokyo
    expect(inBusinessHours(at, "UTC")).toBe(true);
    expect(inBusinessHours(at, "America/Los_Angeles")).toBe(false);
    expect(inBusinessHours(at, "Asia/Tokyo")).toBe(false);
    expect(inBusinessHours(at, "Europe/Berlin")).toBe(true);
  });

  it("can roll a weekday into the weekend across timezones", () => {
    // Friday 23:00 UTC is already Saturday in Tokyo.
    expect(inBusinessHours(new Date("2026-08-28T23:00:00Z"), "Asia/Tokyo")).toBe(false);
  });
});
