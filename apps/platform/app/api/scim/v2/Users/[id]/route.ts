import { authenticateScim, scimBody } from "@/lib/scim/auth";
import { ScimError, scimHandler, scimJson } from "@/lib/scim/errors";
import { applyScimPatch, parsePatchOps } from "@/lib/scim/patch";
import { applyScimUser, deactivateScimUser } from "@/lib/scim/provision";
import { findUser, toScimUser, type UserRow } from "@/lib/scim/users";
import type { ScimContext } from "@/lib/scim/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Loads the resource or raises the SCIM 404 — never leaks another tenant's user. */
async function load(req: Request, params: Params["params"]): Promise<{ ctx: ScimContext; row: UserRow }> {
  const ctx = await authenticateScim(req);
  const { id } = await params;
  const row = await findUser(ctx.organizationId, id);
  if (!row) throw new ScimError(404, `No user ${id}`);
  return { ctx, row };
}

export async function GET(req: Request, { params }: Params) {
  return scimHandler(async () => {
    const { row } = await load(req, params);
    return scimJson(toScimUser(row));
  });
}

/** PUT — full replace with the IdP's view of the resource. */
export async function PUT(req: Request, { params }: Params) {
  return scimHandler(async () => {
    const { ctx, row } = await load(req, params);
    const payload = (await scimBody(req)) as Record<string, unknown>;
    return scimJson(toScimUser(await applyScimUser(ctx, row, payload)));
  });
}

/** PATCH — apply the ops to the current resource, then persist the result. */
export async function PATCH(req: Request, { params }: Params) {
  return scimHandler(async () => {
    const { ctx, row } = await load(req, params);
    const ops = parsePatchOps(await scimBody(req));
    const merged = applyScimPatch(toScimUser(row), ops);
    return scimJson(toScimUser(await applyScimUser(ctx, row, merged)));
  });
}

/** DELETE — deprovision (deactivate). The user record and audit trail survive. */
export async function DELETE(req: Request, { params }: Params) {
  return scimHandler(async () => {
    const { ctx, row } = await load(req, params);
    await deactivateScimUser(ctx, row);
    return new Response(null, { status: 204 });
  });
}
