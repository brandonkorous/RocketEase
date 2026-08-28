import { authenticateScim, scimBody } from "@/lib/scim/auth";
import { SCIM_DEFAULT_PAGE, SCIM_MAX_PAGE, SCIM_SCHEMA, scimBaseUrl } from "@/lib/scim/constants";
import { ScimError, scimHandler, scimJson } from "@/lib/scim/errors";
import { parsePaging, parseScimFilter } from "@/lib/scim/filter";
import { getGroup, memberIdsOf, resolveGroup, setGroupMembers } from "@/lib/scim/group-store";
import { listGroups } from "@/lib/scim/group-store";
import { groupIdFor } from "@/lib/scim/groups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:5001";

/** GET /Groups — one group per workspace per role preset. */
export async function GET(req: Request) {
  return scimHandler(async () => {
    const ctx = await authenticateScim(req);
    const params = new URL(req.url).searchParams;
    const terms = parseScimFilter(params.get("filter"));
    const paging = parsePaging(params, SCIM_MAX_PAGE, SCIM_DEFAULT_PAGE);
    const { total, groups } = await listGroups(ctx.organizationId, terms, paging);
    return scimJson({
      schemas: [SCIM_SCHEMA.listResponse],
      totalResults: total,
      startIndex: paging.startIndex,
      itemsPerPage: groups.length,
      Resources: groups,
    });
  });
}

/**
 * POST /Groups — groups are derived from workspaces and role presets, so this
 * binds an IdP push to an existing one rather than creating anything. Members
 * sent with the push are applied.
 */
export async function POST(req: Request) {
  return scimHandler(async () => {
    const ctx = await authenticateScim(req);
    const payload = (await scimBody(req)) as Record<string, unknown>;
    const displayName = typeof payload.displayName === "string" ? payload.displayName : "";
    if (!displayName) throw new ScimError(400, "displayName is required", "invalidValue");
    const id = groupIdFor(displayName);
    await resolveGroup(ctx.organizationId, id);
    const members = memberIdsOf(payload);
    const group = members.length ? await setGroupMembers(ctx, id, members) : await getGroup(ctx.organizationId, id);
    return scimJson(group, 201, { location: `${scimBaseUrl(appUrl())}/Groups/${encodeURIComponent(id)}` });
  });
}
