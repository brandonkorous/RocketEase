import { authenticateScim, scimBody } from "@/lib/scim/auth";
import { SCIM_DEFAULT_PAGE, SCIM_MAX_PAGE, scimBaseUrl } from "@/lib/scim/constants";
import { scimHandler, scimJson } from "@/lib/scim/errors";
import { parsePaging, parseScimFilter } from "@/lib/scim/filter";
import { createScimUser } from "@/lib/scim/provision";
import { listResponse, listUsers, toScimUser } from "@/lib/scim/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:5001";

/** GET /Users — ListResponse with `filter` and 1-based `startIndex`/`count`. */
export async function GET(req: Request) {
  return scimHandler(async () => {
    const ctx = await authenticateScim(req);
    const params = new URL(req.url).searchParams;
    const terms = parseScimFilter(params.get("filter"));
    const paging = parsePaging(params, SCIM_MAX_PAGE, SCIM_DEFAULT_PAGE);
    const { total, rows } = await listUsers(ctx.organizationId, terms, paging);
    return scimJson(listResponse(rows.map(toScimUser), total, paging.startIndex));
  });
}

/** POST /Users — provision a member of the token's organization. */
export async function POST(req: Request) {
  return scimHandler(async () => {
    const ctx = await authenticateScim(req);
    const payload = (await scimBody(req)) as Record<string, unknown>;
    const row = await createScimUser(ctx, payload);
    const body = toScimUser(row);
    return scimJson(body, 201, { location: `${scimBaseUrl(appUrl())}/Users/${row.userId}` });
  });
}
