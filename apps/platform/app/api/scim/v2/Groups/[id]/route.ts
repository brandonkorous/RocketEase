import { authenticateScim } from "@/lib/scim/auth";
import { scimBody } from "@/lib/scim/auth";
import { ScimError, scimHandler, scimJson } from "@/lib/scim/errors";
import { getGroup, memberIdsOf, setGroupMembers } from "@/lib/scim/group-store";
import { applyScimPatch, parsePatchOps } from "@/lib/scim/patch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  return scimHandler(async () => {
    const ctx = await authenticateScim(req);
    return scimJson(await getGroup(ctx.organizationId, decodeURIComponent((await params).id)));
  });
}

/** PUT — the IdP's list is the whole membership of this workspace role. */
export async function PUT(req: Request, { params }: Params) {
  return scimHandler(async () => {
    const ctx = await authenticateScim(req);
    const id = decodeURIComponent((await params).id);
    const payload = (await scimBody(req)) as Record<string, unknown>;
    return scimJson(await setGroupMembers(ctx, id, memberIdsOf(payload)));
  });
}

/** PATCH — add/remove members, the form Okta and Entra both use. */
export async function PATCH(req: Request, { params }: Params) {
  return scimHandler(async () => {
    const ctx = await authenticateScim(req);
    const id = decodeURIComponent((await params).id);
    const current = await getGroup(ctx.organizationId, id);
    const merged = applyScimPatch(current as unknown as Record<string, unknown>, parsePatchOps(await scimBody(req)));
    return scimJson(await setGroupMembers(ctx, id, memberIdsOf(merged)));
  });
}

/** Role presets belong to the workspace, not the directory — they can't be deleted. */
export async function DELETE(req: Request, { params }: Params) {
  return scimHandler(async () => {
    const ctx = await authenticateScim(req);
    const id = decodeURIComponent((await params).id);
    await getGroup(ctx.organizationId, id);
    throw new ScimError(400, "Role groups are defined by the workspace and cannot be deleted", "mutability");
  });
}
