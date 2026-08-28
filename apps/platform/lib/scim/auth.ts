import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { scimToken } from "@/db/schema/app";
import { ScimError } from "./errors";
import { bearerFrom, hashScimToken } from "./token";

/** Everything a SCIM route is allowed to act on: exactly one organization. */
export type ScimContext = { organizationId: string; tokenId: string };

/**
 * Per-organization bearer authentication. The token is looked up by hash, so a
 * database read never exposes a usable credential. Tenancy for every SCIM
 * operation comes from the returned organizationId and nothing else.
 */
export async function authenticateScim(req: Request): Promise<ScimContext> {
  const raw = bearerFrom(req.headers.get("authorization"));
  if (!raw) throw new ScimError(401, "Provisioning requires a bearer token");
  const row = await db.query.scimToken.findFirst({
    where: and(eq(scimToken.tokenHash, hashScimToken(raw)), isNull(scimToken.revokedAt)),
  });
  if (!row) throw new ScimError(401, "Invalid or revoked provisioning token");
  await db.update(scimToken).set({ lastUsedAt: new Date() }).where(eq(scimToken.id, row.id));
  return { organizationId: row.organizationId, tokenId: row.id };
}

/** Rejects a body that isn't JSON before any of it is trusted. */
export async function scimBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ScimError(400, "Body must be JSON", "invalidSyntax");
  }
}
