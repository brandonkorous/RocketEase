import { describe, expect, it } from "vitest";
import { buildAuditCsv, csvCell } from "./csv";
import type { AuditRow } from "./queries";

const row = (over: Partial<AuditRow> = {}): AuditRow => ({
  id: "e1",
  createdAt: new Date("2026-08-30T10:21:00.000Z"),
  action: "content.publish",
  actorUserId: "u1",
  actorName: "Brandon Korous",
  targetType: "content_item",
  targetId: "i1",
  result: "ok",
  note: "channels: 1",
  ...over,
});

describe("csvCell", () => {
  it("leaves ordinary values alone", () => {
    expect(csvCell("content.publish")).toBe("content.publish");
  });

  it("quotes a value containing a comma", () => {
    expect(csvCell("role: admin, owner")).toBe('"role: admin, owner"');
  });

  it("doubles embedded quotes", () => {
    expect(csvCell('he said "no"')).toBe('"he said ""no"""');
  });

  it("quotes newlines so a row cannot be split", () => {
    expect(csvCell("line one\nline two")).toBe('"line one\nline two"');
  });

  it("renders null and undefined as empty", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });
});

describe("buildAuditCsv", () => {
  it("stamps who exported it, when, and how many rows", () => {
    const csv = buildAuditCsv([row()], { workspaceName: "jotacular", generatedBy: "b@example.com", generatedAt: new Date("2026-08-30T11:00:00.000Z") });
    expect(csv).toContain("# RocketEase audit log,jotacular");
    expect(csv).toContain("# generated,2026-08-30T11:00:00.000Z,by,b@example.com");
    expect(csv).toContain("# rows,1");
  });

  it("writes one line per event, in UTC", () => {
    const csv = buildAuditCsv([row(), row({ id: "e2", action: "membership.role_change", note: null, targetType: null, targetId: null })], {
      workspaceName: "w",
      generatedBy: "b@example.com",
      generatedAt: new Date("2026-08-30T11:00:00.000Z"),
    });
    const lines = csv.trim().split("\n");
    expect(lines[3]).toBe("timestamp_utc,action,actor,actor_user_id,target_type,target_id,result,detail");
    expect(lines[4]).toBe("2026-08-30T10:21:00.000Z,content.publish,Brandon Korous,u1,content_item,i1,ok,channels: 1");
    expect(lines[5]).toBe("2026-08-30T10:21:00.000Z,membership.role_change,Brandon Korous,u1,,,ok,");
  });

  it("survives a detail that contains a comma", () => {
    const csv = buildAuditCsv([row({ note: "before: editor, after: admin" })], { workspaceName: "w", generatedBy: "b", generatedAt: new Date() });
    expect(csv).toContain('"before: editor, after: admin"');
    expect(csv.trim().split("\n")).toHaveLength(5);
  });

  it("still produces a valid file with no rows", () => {
    const csv = buildAuditCsv([], { workspaceName: "w", generatedBy: "b", generatedAt: new Date() });
    expect(csv).toContain("# rows,0");
    expect(csv.trim().split("\n")).toHaveLength(4);
  });
});
