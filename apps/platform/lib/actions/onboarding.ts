"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { track } from "@/lib/telemetry";
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
  organizationName: z.string().trim().min(2, "Give your organization a name").max(80),
  workspaceName: z.string().trim().min(2, "Give your workspace a name").max(80),
  timezone: z.string().trim().min(1).max(64),
  isAgency: z.boolean().default(false),
  workspaceType: z.enum(["brand", "client"]).default("brand"),
  industry: z.string().trim().max(60).optional(),
});

export type OnboardingState = { error?: string; fieldErrors?: Partial<Record<keyof z.infer<typeof schema>, string>> };

/**
 * Onboarding steps 2–3 (onboarding.md): create or join an organization, then
 * the first workspace. Invited users never reach this — they land in the task
 * they were invited to.
 */
export async function createOrganizationAndWorkspace(_prev: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const session = await requireUser();
  const parsed = schema.safeParse({
    organizationName: formData.get("organizationName"),
    workspaceName: formData.get("workspaceName"),
    timezone: formData.get("timezone"),
    isAgency: formData.get("isAgency") === "on",
    workspaceType: formData.get("workspaceType") || "brand",
    industry: formData.get("industry") || undefined,
  });
  if (!parsed.success) {
    const fieldErrors: OnboardingState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof z.infer<typeof schema>;
      fieldErrors[key] ??= issue.message;
    }
    return { fieldErrors };
  }
  const { organizationName, workspaceName, timezone, isAgency, workspaceType, industry } = parsed.data;
  const h = await headers();

  // Organization via Better Auth so membership/roles stay in its tables.
  const slugBase = slugify(organizationName);
  const org = await auth.api.createOrganization({
    headers: h,
    body: {
      name: organizationName,
      slug: `${slugBase}-${Math.random().toString(36).slice(2, 7)}`,
      metadata: { isAgency },
    },
  });
  if (!org) return { error: "Could not create the organization. Try again." };

  const [ws] = await db
    .insert(workspace)
    .values({
      organizationId: org.id,
      name: workspaceName,
      slug: slugify(workspaceName),
      timezone,
      settings: { workspaceType, ...(industry ? { industry } : {}) },
    })
    .returning();

  await db.insert(workspaceMembership).values({
    organizationId: org.id,
    workspaceId: ws.id,
    userId: session.user.id,
    role: "owner",
    lastOpenedAt: new Date(),
  });

  await auth.api.setActiveOrganization({ headers: h, body: { organizationId: org.id } });

  await audit({
    action: "organization.create",
    actorUserId: session.user.id,
    organizationId: org.id,
    targetType: "organization",
    targetId: org.id,
    summary: { after: { name: organizationName, isAgency } },
  });
  await audit({
    action: "workspace.create",
    actorUserId: session.user.id,
    organizationId: org.id,
    workspaceId: ws.id,
    targetType: "workspace",
    targetId: ws.id,
    summary: { after: { name: workspaceName, timezone } },
  });
  await Promise.all([track("workspace_created", { userId: session.user.id, organizationId: org.id, workspaceId: ws.id, surface: "action:onboarding" }), track("onboarding_step_completed", { userId: session.user.id, organizationId: org.id, workspaceId: ws.id, surface: "action:onboarding", props: { step: "create_workspace", isAgency } })]);

  redirect(`/onboarding?step=connect&workspace=${ws.id}`);
}
