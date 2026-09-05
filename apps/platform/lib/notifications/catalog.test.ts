import { describe, expect, it } from "vitest";
import { KINDS, PREFS, PREF_KEYS, TABS, emailWanted, inAppWanted, kindsForTab, readPrefs, specFor } from "./catalog";

describe("notification catalog", () => {
  it("gives every kind exactly one preference row and a tab", () => {
    for (const k of KINDS) {
      expect(PREF_KEYS).toContain(k.pref);
      expect(k.tabs.length).toBeGreaterThan(0);
    }
    expect(new Set(KINDS.map((k) => k.kind)).size).toBe(KINDS.length);
    expect(new Set(TABS.map((t) => t.key)).size).toBe(TABS.length);
  });

  it("applies defaults, then stored choices, then locks", () => {
    const d = readPrefs({});
    expect(d.publish).toEqual({ inApp: true, email: true });
    expect(d.comments).toEqual({ inApp: true, email: false });
    const chosen = readPrefs({ comments: { email: true, inApp: false }, publish: { inApp: false, email: false } });
    expect(chosen.comments).toEqual({ inApp: false, email: true });
    // A locked in-app channel cannot be switched off, whatever was stored.
    expect(chosen.publish.inApp).toBe(true);
    expect(chosen.publish.email).toBe(false);
  });

  it("reads the pre-M14.2 shape: a boolean keyed by kind is the email choice", () => {
    const legacy = readPrefs({ "approval.decided": true, "comment.added": false, "report.ready": true });
    expect(legacy.approval_decisions.email).toBe(true);
    expect(legacy.comments.email).toBe(false);
    expect(legacy.reports.email).toBe(true);
    expect(legacy.reports.inApp).toBe(true);
    expect(emailWanted({ "approval.decided": true }, "approval.decided", false)).toBe(true);
  });

  it("answers per kind through its preference", () => {
    expect(inAppWanted({ automations: { inApp: false } }, "automation.triggered")).toBe(false);
    expect(inAppWanted({ automations: { inApp: false } }, "automation.decided")).toBe(false);
    expect(inAppWanted({}, "publish.failed")).toBe(true);
    expect(emailWanted({}, "publish.failed", false)).toBe(true);
    expect(emailWanted({ publish: { email: false } }, "publish.failed", true)).toBe(false);
  });

  it("defines Needs action as the kinds that stay wrong until someone acts", () => {
    const action = kindsForTab("action")!;
    expect(action).toEqual(expect.arrayContaining(["publish.failed", "connection.health", "approval.requested", "approval.overdue", "inbox.reply_failed", "rights.expiring"]));
    // An overdue review shares the request preference: switching requests off switches reminders off too.
    expect(specFor("approval.overdue")?.pref).toBe("approval_requests");
    expect(specFor("approval.overdue")?.chip).toEqual({ icon: "alert", label: "Overdue", tone: "error" });
    expect(action).not.toContain("comment.added");
    expect(action).not.toContain("report.ready");
    expect(kindsForTab("all")).toBeUndefined();
    expect(kindsForTab("unread")).toBeUndefined();
    for (const k of KINDS) expect(k.needsAction).toBe(k.tabs.includes("action"));
  });

  it("marks failures with an error tone paired with a label, never colour alone", () => {
    for (const k of KINDS.filter((x) => x.chip.tone === "error")) expect(k.chip.label.length).toBeGreaterThan(0);
    expect(specFor("publish.failed")?.action).toBe("Fix post");
    expect(PREFS.find((p) => p.key === "publish")?.lock?.inApp).toBe(true);
  });
});
