"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/session";
import { db } from "@/db";
import { workspace, workspaceMembership } from "@/db/schema/app";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "workspace";

const schema = z.object({
  organizationId: z.string().min(1, "Choose an organization"),
  name: z.string().trim().min(2, "Give the workspace a name").max(80),
  timezone: z.string().trim().min(1).max(64),
});

export type CreateWorkspaceState = { error?: string };

/** Add a workspace (client/brand) to an organization the user is owner/admin of. */
export async function createWorkspace(_prev: CreateWorkspaceState, formData: FormData): Promise<CreateWorkspaceState> {
  const session = await requireUser();
  const parsed = schema.safeParse({
    organizationId: formData.get("organizationId"),
    name: formData.get("name"),
    timezone: formData.get("timezone"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const { organizationId, name, timezone } = parsed.data;

  // Organization-level authorization via Better Auth membership (owner/admin only).
  const h = await headers();
  const member = await auth.api.getActiveMember({ headers: h, query: { organizationId } }).catch(() => null);
  const role = member?.role ?? "";
  if (!["owner", "admin"].includes(role)) {
    await audit({ action: "workspace.create", actorUserId: session.user.id, organizationId, result: "denied" });
    return { error: "Only organization owners and admins can create workspaces." };
  }

  let slug = slugify(name);
  const clash = await db.query.workspace.findFirst({
    where: (w, { and, eq }) => and(eq(w.organizationId, organizationId), eq(w.slug, slug)),
  });
  if (clash) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

  const [ws] = await db.insert(workspace).values({ organizationId, name, slug, timezone }).returning();
  await db.insert(workspaceMembership).values({
    organizationId,
    workspaceId: ws.id,
    userId: session.user.id,
    role: "owner",
    lastOpenedAt: new Date(),
  });
  await audit({
    action: "workspace.create",
    actorUserId: session.user.id,
    organizationId,
    workspaceId: ws.id,
    targetType: "workspace",
    targetId: ws.id,
    summary: { after: { name, timezone } },
  });
  redirect(`/app/${ws.id}/home`);
}
