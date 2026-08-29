/*
 * Scopes a public API key can carry. Deliberately a subset of the capability
 * matrix: only capabilities /api/v1 actually uses are offered, and
 * `approvals.decide` is not among them — an agent may ask for approval, never
 * grant it.
 */
import type { Capability } from "@/lib/authz";

export const API_SCOPES: { scope: Capability; label: string; desc: string }[] = [
  { scope: "content.create", label: "Create drafts", desc: "POST /drafts — write drafts. Nothing is published." },
  { scope: "content.edit", label: "Submit for approval", desc: "POST /drafts/{id}/submit — open an approval request a person decides." },
  { scope: "content.publish", label: "Schedule approved posts", desc: "Schedule a post that needs no approval. Subject to the same policies as the UI." },
  { scope: "conversations.handle", label: "Read inbox and draft replies", desc: "GET /conversations and POST /conversations/{id}/reply-draft. Replies stay drafts until a person sends them." },
  { scope: "analytics.view_scoped", label: "Read metrics", desc: "GET /metrics — values with definitions, caveats and availability reasons." },
];

export const API_SCOPE_KEYS = API_SCOPES.map((s) => s.scope);
export const scopeLabel = (scope: string) => API_SCOPES.find((s) => s.scope === scope)?.label ?? scope;
