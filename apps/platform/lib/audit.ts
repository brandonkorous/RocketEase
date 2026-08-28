import { db } from "@/db";
import { auditEvent } from "@/db/schema/app";

type AuditInput = {
  action: string;
  actorUserId?: string | null;
  organizationId?: string | null;
  workspaceId?: string | null;
  targetType?: string;
  targetId?: string;
  summary?: { before?: unknown; after?: unknown; note?: string };
  result?: "ok" | "denied" | "error";
};

/** Request headers when running inside a Next.js request; empty in the worker. */
async function requestHeaders(): Promise<Headers> {
  try {
    const mod = await import("next/headers");
    return await mod.headers();
  } catch {
    return new Headers();
  }
}

/** Append-only. Never throws into the caller's flow — an audit write failure is logged, not surfaced. */
export async function audit(input: AuditInput) {
  try {
    const h = await requestHeaders();
    await db.insert(auditEvent).values({
      action: input.action,
      actorUserId: input.actorUserId ?? null,
      organizationId: input.organizationId ?? null,
      workspaceId: input.workspaceId ?? null,
      targetType: input.targetType,
      targetId: input.targetId,
      summary: input.summary,
      result: input.result ?? "ok",
      requestId: h.get("x-request-id"),
      ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: h.get("user-agent"),
    });
  } catch (err) {
    console.error("[audit] write failed", input.action, err);
  }
}
