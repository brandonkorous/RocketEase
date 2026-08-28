/*
 * Scratch: prepares the local dev database for a SCIM curl proof and prints a
 * bearer token. Creates the M7 tables directly (the migration is the lead's to
 * generate) so they can be dropped again by scim-proof-teardown.ts.
 * DELETE THIS FILE once the proof is recorded.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { mintScimToken } from "@/lib/scim/token";

const PROOF_ORG = "scim-proof-org";

async function ddl() {
  await db.execute(sql`
    create table if not exists scim_token (
      id text primary key default gen_random_uuid(),
      organization_id text not null references organization(id) on delete cascade,
      token_hash text not null,
      prefix text not null,
      created_by_user_id text references "user"(id) on delete set null,
      last_used_at timestamptz,
      revoked_at timestamptz,
      created_at timestamptz not null default now()
    )`);
  await db.execute(sql`create unique index if not exists scim_token_hash_idx on scim_token (token_hash)`);
  await db.execute(sql`
    create table if not exists scim_identity (
      id text primary key default gen_random_uuid(),
      organization_id text not null references organization(id) on delete cascade,
      user_id text not null references "user"(id) on delete cascade,
      external_id text,
      user_name text not null,
      active boolean not null default true,
      last_synced_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`);
  await db.execute(sql`create unique index if not exists scim_identity_org_user_idx on scim_identity (organization_id, user_id)`);
  await db.execute(sql`create unique index if not exists scim_identity_org_username_idx on scim_identity (organization_id, user_name)`);
  await db.execute(sql`alter table workspace_membership add column if not exists deactivated_at timestamptz`);
  await db.execute(sql`
    create table if not exists sso_provider (
      id text primary key,
      issuer text not null,
      oidc_config text,
      saml_config text,
      user_id text not null references "user"(id) on delete cascade,
      provider_id text not null unique,
      organization_id text,
      domain text not null,
      enforced boolean default false
    )`);
}

/** A throwaway organization + workspace so the proof never touches real data. */
async function fixture() {
  const orgId = `${PROOF_ORG}-id`;
  await db.execute(sql`
    insert into organization (id, name, slug, created_at)
    values (${orgId}, 'SCIM Proof Org', ${PROOF_ORG}, now())
    on conflict (id) do nothing`);
  const adminId = `${PROOF_ORG}-admin`;
  await db.execute(sql`
    insert into "user" (id, name, email, email_verified, created_at, updated_at)
    values (${adminId}, 'Proof Admin', ${`${PROOF_ORG}-admin@example.test`}, true, now(), now())
    on conflict (id) do nothing`);
  await db.execute(sql`
    insert into member (id, organization_id, user_id, role, created_at)
    values (${randomUUID()}, ${orgId}, ${adminId}, 'owner', now())
    on conflict do nothing`);
  await db.execute(sql`
    insert into workspace (id, organization_id, name, slug, timezone)
    values (${`${PROOF_ORG}-ws`}, ${orgId}, 'Proof Workspace', 'proofws', 'UTC')
    on conflict (id) do nothing`);
  return { orgId, adminId };
}

async function main() {
  await ddl();
  const { orgId, adminId } = await fixture();
  const { raw, hash, prefix } = mintScimToken();
  await db.execute(sql`
    insert into scim_token (id, organization_id, token_hash, prefix, created_by_user_id, created_at)
    values (${randomUUID()}, ${orgId}, ${hash}, ${prefix}, ${adminId}, now())`);
  console.log(JSON.stringify({ token: raw, organizationId: orgId, workspaceSlug: "proofws" }));
  process.exit(0);
}

void main();
