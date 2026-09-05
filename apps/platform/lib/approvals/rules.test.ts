import { describe, expect, it } from "vitest";
import { canDecide, concernsMe, dueAtFor, isOverdue, reminderRecipients } from "./rules";

const req = { assigneeUserId: null, approverRoles: ["owner", "admin", "manager"] as ("owner" | "admin" | "manager")[], separationOfDuty: true, requestedByUserId: "author" };
const owner = { userId: "boss", role: "owner" as const, grants: [] };
const author = { userId: "author", role: "manager" as const, grants: [] };
const creator = { userId: "kid", role: "creator" as const, grants: [] };
const at = (iso: string) => new Date(iso);

describe("overdue", () => {
  it("means pending and past due — a decided request is never overdue", () => {
    const now = at("2026-09-05T12:00:00Z");
    expect(isOverdue({ state: "pending", dueAt: at("2026-09-05T11:59:00Z") }, now)).toBe(true);
    expect(isOverdue({ state: "pending", dueAt: at("2026-09-05T12:01:00Z") }, now)).toBe(false);
    expect(isOverdue({ state: "approved", dueAt: at("2026-09-01T00:00:00Z") }, now)).toBe(false);
    expect(isOverdue({ state: "pending", dueAt: null }, now)).toBe(false);
  });

  it("concerns the people who can decide it, and the person who asked", () => {
    expect(concernsMe(owner, req)).toBe(true);
    expect(concernsMe(author, req)).toBe(true);
    expect(concernsMe(creator, req)).toBe(false);
    expect(canDecide(author, req).ok).toBe(false);
  });
});

describe("reminder recipients", () => {
  const members = [
    { userId: "boss", role: "owner" as const },
    { userId: "author", role: "manager" as const },
    { userId: "kid", role: "creator" as const },
    { userId: "client", role: "client_approver" as const },
  ];

  it("goes to the assignee alone when there is one", () => {
    expect(reminderRecipients({ ...req, assigneeUserId: "client" }, members)).toEqual(["client"]);
  });

  it("otherwise reaches every approver role, minus the requester under separation of duty", () => {
    expect(reminderRecipients(req, members)).toEqual(["boss"]);
    expect(reminderRecipients({ ...req, separationOfDuty: false }, members)).toEqual(["boss", "author"]);
  });
});

describe("due time", () => {
  const now = at("2026-09-05T12:00:00Z");

  it("takes the requester's time when it is ahead of now", () => {
    expect(dueAtFor({ requested: at("2026-09-06T09:00:00Z"), policyHours: 4, now })).toEqual({ dueAt: at("2026-09-06T09:00:00Z") });
  });

  it("refuses a time that is already past, or less than a minute ahead", () => {
    expect(dueAtFor({ requested: at("2026-09-05T11:00:00Z"), now })).toEqual({ error: "The due time must be in the future." });
    expect(dueAtFor({ requested: at("2026-09-05T12:00:30Z"), now })).toEqual({ error: "The due time must be in the future." });
    expect(dueAtFor({ requested: new Date("nonsense"), now })).toEqual({ error: "That due time is not a valid date." });
  });

  it("falls back to the policy window, and to 24 hours without a policy", () => {
    expect(dueAtFor({ policyHours: 4, now })).toEqual({ dueAt: at("2026-09-05T16:00:00Z") });
    expect(dueAtFor({ now })).toEqual({ dueAt: at("2026-09-06T12:00:00Z") });
  });
});
