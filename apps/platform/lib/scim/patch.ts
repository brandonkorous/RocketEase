import { ScimError } from "./errors";
import { SCIM_SCHEMA } from "./constants";

export type ScimPatchOp = { op: "add" | "replace" | "remove"; path?: string; value?: unknown };
export type ScimResource = Record<string, unknown>;

const OPS = new Set(["add", "replace", "remove"]);
/** `members[value eq "abc"]` — the only filtered path IdPs actually send. */
const FILTERED = /^([A-Za-z][A-Za-z0-9_.]*)\[\s*value\s+eq\s+"([^"]*)"\s*\]$/i;

/** Validates the PatchOp envelope and normalizes op names to lower case. */
export function parsePatchOps(body: unknown): ScimPatchOp[] {
  const envelope = body as { schemas?: unknown; Operations?: unknown; operations?: unknown } | null;
  if (!envelope || typeof envelope !== "object") throw new ScimError(400, "Body must be a PatchOp", "invalidSyntax");
  const schemas = Array.isArray(envelope.schemas) ? envelope.schemas : [];
  if (schemas.length && !schemas.includes(SCIM_SCHEMA.patchOp)) {
    throw new ScimError(400, "Body must declare the PatchOp schema", "invalidSyntax");
  }
  const raw = envelope.Operations ?? envelope.operations;
  if (!Array.isArray(raw) || raw.length === 0) throw new ScimError(400, "Operations must be a non-empty array", "invalidSyntax");
  return raw.map((entry) => {
    const o = entry as { op?: unknown; path?: unknown; value?: unknown };
    const op = String(o?.op ?? "").toLowerCase();
    if (!OPS.has(op)) throw new ScimError(400, `Unsupported op "${String(o?.op)}"`, "invalidSyntax");
    if (o.path !== undefined && typeof o.path !== "string") throw new ScimError(400, "path must be a string", "invalidPath");
    return { op: op as ScimPatchOp["op"], path: o.path as string | undefined, value: o.value };
  });
}

function assertPlainObject(value: unknown, message: string): ScimResource {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ScimError(400, message, "invalidValue");
  return value as ScimResource;
}

/** Sets `a.b.c`, creating intermediate objects. Paths are at most two deep here. */
function setPath(target: ScimResource, path: string, value: unknown) {
  const segments = path.split(".");
  let node = target;
  for (const key of segments.slice(0, -1)) {
    const next = node[key];
    node[key] = next && typeof next === "object" && !Array.isArray(next) ? { ...(next as ScimResource) } : {};
    node = node[key] as ScimResource;
  }
  node[segments[segments.length - 1]] = value;
}

function unsetPath(target: ScimResource, path: string) {
  const segments = path.split(".");
  let node: ScimResource | undefined = target;
  for (const key of segments.slice(0, -1)) {
    const next: unknown = node?.[key];
    node = next && typeof next === "object" ? (next as ScimResource) : undefined;
  }
  if (node) delete node[segments[segments.length - 1]];
}

/** `add` on a multi-valued attribute appends; anything else replaces. */
function applyAdd(out: ScimResource, path: string, value: unknown) {
  const current = out[path];
  if (Array.isArray(current) || Array.isArray(value)) {
    const existing = Array.isArray(current) ? current : [];
    out[path] = [...existing, ...(Array.isArray(value) ? value : [value])];
    return;
  }
  setPath(out, path, value);
}

/** Drops entries of a multi-valued attribute whose `value` matches. */
function removeFiltered(out: ScimResource, attr: string, match: string) {
  const current = out[attr];
  if (!Array.isArray(current)) return;
  out[attr] = current.filter((item) => (item as { value?: unknown } | null)?.value !== match);
}

/**
 * Applies a PATCH (RFC 7644 §3.5.2) to a resource copy and returns the result.
 * Supports pathless add/replace, dotted paths, multi-valued add/remove, and the
 * `attr[value eq "x"]` remove form. Anything else is rejected, not ignored.
 */
export function applyScimPatch(resource: ScimResource, ops: ScimPatchOp[]): ScimResource {
  const out: ScimResource = structuredClone(resource);
  for (const { op, path, value } of ops) {
    if (!path) {
      if (op === "remove") throw new ScimError(400, "remove requires a path", "noTarget");
      for (const [k, v] of Object.entries(assertPlainObject(value, "Pathless patch needs an object value"))) setPath(out, k, v);
      continue;
    }
    const filtered = FILTERED.exec(path);
    if (filtered) {
      if (op !== "remove") throw new ScimError(400, "Filtered paths only support remove", "invalidPath");
      removeFiltered(out, filtered[1], filtered[2]);
      continue;
    }
    if (/[[\]]/.test(path)) throw new ScimError(400, `Unsupported path ${path}`, "invalidPath");
    if (op === "remove") unsetPath(out, path);
    else if (op === "add") applyAdd(out, path, value);
    else setPath(out, path, value);
  }
  return out;
}
