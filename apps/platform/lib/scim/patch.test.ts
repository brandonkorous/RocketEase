import { describe, expect, it } from "vitest";
import { applyScimPatch, parsePatchOps } from "./patch";
import { ScimError } from "./errors";
import { SCIM_SCHEMA } from "./constants";

const envelope = (ops: unknown[]) => ({ schemas: [SCIM_SCHEMA.patchOp], Operations: ops });
const patch = (resource: Record<string, unknown>, ops: unknown[]) => applyScimPatch(resource, parsePatchOps(envelope(ops)));

describe("PatchOp parsing", () => {
  it("accepts lowercase `operations` (Entra) and mixed-case ops", () => {
    const ops = parsePatchOps({ schemas: [SCIM_SCHEMA.patchOp], operations: [{ op: "Replace", path: "active", value: false }] });
    expect(ops).toEqual([{ op: "replace", path: "active", value: false }]);
  });

  it("accepts an envelope with no schemas array", () => {
    expect(parsePatchOps({ Operations: [{ op: "add", path: "x", value: 1 }] })).toHaveLength(1);
  });

  it("rejects a non-PatchOp schema, an empty list, and unknown ops", () => {
    expect(() => parsePatchOps({ schemas: [SCIM_SCHEMA.user], Operations: [] })).toThrow(ScimError);
    expect(() => parsePatchOps(envelope([]))).toThrow(ScimError);
    expect(() => parsePatchOps(envelope([{ op: "merge", path: "a", value: 1 }]))).toThrow(ScimError);
    expect(() => parsePatchOps(null)).toThrow(ScimError);
  });
});

describe("applying a PATCH", () => {
  it("deactivates a user — the Okta/Entra deprovision call", () => {
    expect(patch({ active: true }, [{ op: "replace", path: "active", value: false }]).active).toBe(false);
  });

  it("accepts the pathless replace form", () => {
    const out = patch({ active: true, userName: "a@b.co" }, [{ op: "replace", value: { active: false } }]);
    expect(out).toEqual({ active: false, userName: "a@b.co" });
  });

  it("writes a nested path without clobbering its siblings", () => {
    const out = patch({ name: { givenName: "Ada", familyName: "L" } }, [{ op: "replace", path: "name.familyName", value: "Lovelace" }]);
    expect(out.name).toEqual({ givenName: "Ada", familyName: "Lovelace" });
  });

  it("drops the stale formatted name so a rename actually lands", () => {
    const out = patch({ name: { formatted: "Ada Lovelace", givenName: "Ada", familyName: "Lovelace" } }, [
      { op: "replace", path: "name.givenName", value: "Augusta" },
    ]);
    expect(out.name).toEqual({ givenName: "Augusta", familyName: "Lovelace" });
  });

  it("keeps a formatted name the same patch set", () => {
    const out = patch({ name: { formatted: "Ada Lovelace" } }, [
      { op: "replace", path: "name.givenName", value: "Augusta" },
      { op: "replace", path: "name.formatted", value: "Augusta Lovelace" },
    ]);
    expect(out.name).toEqual({ formatted: "Augusta Lovelace", givenName: "Augusta" });
  });

  it("leaves formatted alone when the patch never touched the name", () => {
    const out = patch({ name: { formatted: "Ada Lovelace" }, active: true }, [{ op: "replace", path: "active", value: false }]);
    expect(out.name).toEqual({ formatted: "Ada Lovelace" });
  });

  it("creates intermediate objects for a new nested path", () => {
    expect(patch({}, [{ op: "add", path: "name.givenName", value: "Ada" }]).name).toEqual({ givenName: "Ada" });
  });

  it("appends to a multi-valued attribute instead of replacing it", () => {
    const out = patch({ members: [{ value: "u1" }] }, [{ op: "add", path: "members", value: [{ value: "u2" }] }]);
    expect(out.members).toEqual([{ value: "u1" }, { value: "u2" }]);
  });

  it("replaces a multi-valued attribute outright when told to", () => {
    const out = patch({ members: [{ value: "u1" }] }, [{ op: "replace", path: "members", value: [{ value: "u2" }] }]);
    expect(out.members).toEqual([{ value: "u2" }]);
  });

  it("removes one member via the filtered path form", () => {
    const out = patch({ members: [{ value: "u1" }, { value: "u2" }] }, [{ op: "remove", path: 'members[value eq "u1"]' }]);
    expect(out.members).toEqual([{ value: "u2" }]);
  });

  it("removing an absent member is a no-op, not an error", () => {
    const out = patch({ members: [{ value: "u1" }] }, [{ op: "remove", path: 'members[value eq "nope"]' }]);
    expect(out.members).toEqual([{ value: "u1" }]);
  });

  it("removes a plain attribute", () => {
    expect(patch({ externalId: "x", userName: "a" }, [{ op: "remove", path: "externalId" }])).toEqual({ userName: "a" });
  });

  it("applies operations in order", () => {
    const out = patch({ active: true }, [
      { op: "replace", path: "active", value: false },
      { op: "replace", path: "active", value: true },
    ]);
    expect(out.active).toBe(true);
  });

  it("never mutates the input resource", () => {
    const original = { active: true, members: [{ value: "u1" }] };
    patch(original, [{ op: "replace", path: "active", value: false }, { op: "add", path: "members", value: { value: "u2" } }]);
    expect(original).toEqual({ active: true, members: [{ value: "u1" }] });
  });

  it("rejects a remove with no path and an unsupported filtered path", () => {
    expect(() => patch({}, [{ op: "remove" }])).toThrow(ScimError);
    expect(() => patch({}, [{ op: "replace", path: 'members[value eq "u1"]', value: 1 }])).toThrow(ScimError);
    expect(() => patch({}, [{ op: "replace", path: 'emails[type eq "work"].value', value: "a" }])).toThrow(ScimError);
  });

  it("rejects a pathless patch whose value is not an object", () => {
    expect(() => patch({}, [{ op: "replace", value: "nope" }])).toThrow(ScimError);
  });
});
