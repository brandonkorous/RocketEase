# Deploy

RocketEase runs on the shared **sparx AKS cluster** (`aks-sparx-prod-cus`, resource
group `rg-sparx-prod-cus`, region `centralus`) in its own `rocketease` namespace,
with its **own** Postgres server, Key Vault and storage account. Manifests are in
`deploy/k8s`; the pipeline is the `images` + `deploy` jobs in
`.github/workflows/ci.yml`.

| Piece | Where it lives |
| --- | --- |
| Postgres 18 flexible server, Key Vault, storage account | `sparx.works/terraform/envs/azure/rocketease.tf` |
| CI identity (app registration, federated credentials, roles) | `sparx.works/terraform/bootstrap-azure/rocketease.tf` |
| TLS + routing | `sparx.works/k8s/ingress/Caddyfile` |
| Public DNS | `sparx.works/terraform/modules/dns` (Cloudflare) |
| Workloads | this repo, `deploy/k8s` |

## There is no Ingress object

This cluster runs **no nginx-ingress and no cert-manager**. A single shared
**Caddy** in the `sparx-prod` namespace terminates TLS and reverse-proxies to
these Services cross-namespace by ClusterIP. An `Ingress` resource applied here
would be silently inert — nothing watches it.

Two consequences worth knowing before debugging a "routing" problem:

- Caddy uses **on-demand TLS**, so every RocketEase hostname must also be
  allow-listed in `PLATFORM_HOSTNAMES`
  (`sparx.works/wizeworks/services/api-rest/src/routes/internal/domain-check.ts`).
  A name missing there gets a 403 from the ask endpoint, never receives a
  certificate, and Cloudflare answers **525 for that hostname alone** — which
  reads like a routing bug and is a TLS bootstrap failure.
- An explicit managed-certificate block cannot work here at all: Caddy is
  `replicas: 1` on a `Recreate` rollout, so every boot has a window with no
  registered load-balancer backend and all startup issuance attempts fail inside
  it. On-demand defers issuance to the first request, which lands on a warm pod.

## Hostnames

| Host | Service |
| --- | --- |
| `rocketease.com` | `web` (marketing site) |
| `www.rocketease.com` | 301 to the apex, in Caddy |
| `app.rocketease.com` | `platform` (the product) |

Cloudflare-proxied, like every other first-party brand. Cloudflare's SSL mode
must be **Full** or **Full (strict)** — never Flexible, which speaks plain HTTP
to an origin that only serves HTTPS.

## Secrets

Nothing is a GitHub Actions secret. The deploy job authenticates to Azure by
**workload identity federation** (no stored credential) and reads everything from
Key Vault at deploy time. Vault names allow only alphanumerics and hyphens, so
`DATABASE_URL` is stored as `DATABASE-URL` and mapped back by the pipeline.

Repository **variables** (public identifiers, deliberately not secrets):

    AZURE_CLIENT_ID  AZURE_TENANT_ID  AZURE_SUBSCRIPTION_ID  AZURE_KEY_VAULT_NAME
    NEXT_PUBLIC_AUTH_SOCIAL  NEXT_PUBLIC_GOOGLE_CLIENT_ID  NEXT_PUBLIC_AI_ENABLED

**Required vault secrets** — the release fails if any is missing, because every
one of them fails silently at runtime rather than at boot:

    DATABASE-URL  BETTER-AUTH-SECRET  TOKEN-MASTER-KEY
    AZURE-STORAGE-ACCOUNT  AZURE-STORAGE-KEY

Everything else (provider OAuth pairs, Stripe, Anthropic/OpenAI, GA4, Shopify,
ClamAV, OTel) is optional: each missing entry costs exactly one feature, and the
product says so in the UI rather than pretending.

### SMTP-URL is temporarily optional

It was moved out of `required` on 2026-08-29 so the platform could ship before a
mail provider existed. Nothing fails at boot — `requireEmailVerification` is
false, so signup and sign-in work, and `lib/mail.ts` logs each message instead of
sending it. What silently does **not** work is every transactional mail:
verification, **password reset**, invitations, approval requests and scheduled
reports. Password reset strands a real user with no way back into their account,
so this must not reach paying customers. Every deploy annotates the run with a
`::warning::` until it is set. Tracked in `docs/IMPLEMENTATION_PLAN.md`
("Deferred — revisit before launch"), which carries the Mailgun steps and the
reminder to move it back to `required`.

### TOKEN-MASTER-KEY is set once, by hand, and never by Terraform

It is the AES-256-GCM key wrapping every stored provider token (`lib/crypto.ts`).
A Terraform-managed value is regenerated whenever its `random_password` is
replaced — a taint, a provider upgrade, a `-replace`, someone tidying state — and
every one of those silently swaps the key. Previously stored tokens then fail to
decrypt with an auth-tag error that names nothing, and re-running anything does
not recover them.

Generate 32 bytes, base64, no trailing newline, and set it once:

    node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
    az keyvault secret set --vault-name kv-rocketease-prod-cus --name TOKEN-MASTER-KEY --value '<value>'

## Two database roles

`rocketease_owner` (the server admin) runs migrations. The app connects as
`rocketease_app`, which has DML on `public` but no DDL — so a SQL injection or a
mistaken migration path cannot drop or alter a table. It is defence in depth, not
an access-control boundary: tenancy is enforced in application code.

**The `pgboss` schema is owned by `rocketease_app`, deliberately.** pg-boss v12
issues `CREATE SCHEMA`, `CREATE TABLE` and `CREATE TABLE ... PARTITION OF` at
runtime — `boss.start()` plus one `createQueue` per queue, in both the platform
and the worker — so a role with no DDL anywhere cannot run the queue at all.
Scoping ownership to `pgboss` keeps the protection that matters.

The `db-role` Job creates it; Azure has no `docker/init/*.sql` hook, so nothing
else will.

## Release order

The deploy job runs, in this order, and fails the release at any step:

1. **Secrets** — Key Vault into `platform-env` (app) and `db-admin` (Jobs only; no
   Deployment mounts it, so the owner URL never reaches the running app).
2. **`db-role` Job** — creates/updates `rocketease_app` and the `pgboss` schema.
3. **`db-migrate` Job** — `drizzle-kit migrate` in the worker image at this SHA,
   as the owner. Migrations are forward-compatible, so old pods keep serving.
4. **Containers** — image tags pinned to the SHA, then `kubectl apply -k`, then
   `kubectl rollout status` on all three.

Steps 2 and 3 **must** run in the cluster: the Postgres server has
`public_network_access_enabled = false` and sits in a delegated subnet, so a
GitHub-hosted runner cannot reach it with any connection string or firewall rule.
A pod is inside the VNet. There is no laptop path to production Postgres, and
that is the design rather than a limitation to work around.

### First deploy: expect a brief platform 503

`/api/health` probes `pgboss.queue`, and that table does not exist until pg-boss
starts — which the **worker** does on boot. On a first deploy the platform pods
report not-ready until the worker has come up. It resolves itself within the
rollout timeout; it is not a misconfiguration.

## Images

GHCR, tagged `sha-<commit>` and `latest`:

    ghcr.io/brandonkorous/rocketease-web
    ghcr.io/brandonkorous/rocketease-platform
    ghcr.io/brandonkorous/rocketease-worker

**Lowercase and hyphenated, and both halves matter.** A Docker reference may not
contain uppercase, and this repository is `brandonkorous/RocketEase`; a slash
would address a nested package that does not exist. Either mistake fails the pull
with a 401 that reads like a missing tag.

**The packages must be public.** No manifest carries an `imagePullSecret` because
the cluster pulls anonymously. A new GHCR package is **private by default** — after
the first push, set each of the three to public once, by hand, in the package
settings. Until then pods sit in `ImagePullBackOff`.

`NEXT_PUBLIC_*` is baked into the platform image at build time (Next inlines it
into the client bundle), so it is a build arg, never a ConfigMap value. Omitting
one does not error: the browser gets `undefined` and social sign-in, One Tap and
the AI controls quietly never render against a deploy that looks healthy.

## Storage

Production uses **Azure Blob** (`STORAGE_DRIVER=azure`, `lib/storage/azure.ts`).
Azure has no S3-compatible API, so this is a real driver rather than the S3 one
pointed at another endpoint; the S3 driver remains for local MinIO.

The container is private and every access is a short-lived SAS URL the browser
uses directly, so bytes never transit the cluster. **The account's CORS rules are
therefore load-bearing**: the browser PUTs and GETs against Azure itself, so
without `https://app.rocketease.com` in the allowed origins and `x-ms-blob-type`
in the allowed headers, every upload and download fails at preflight — with no
server-side trace, because no request reaches the app.

## Local

`pnpm dev` — web :5000, platform :5001, Postgres :5050, Mailpit :5026,
MinIO :5090/:5091, worker. Nothing here touches Azure.
