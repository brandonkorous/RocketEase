# RocketEase on your own cluster

A licence-owned install of RocketEase on Kubernetes, from the same manifests
that run RocketEase's cloud (`deploy/k8s`). Design and rules:
`docs/plans/m14.12-self-hosted.md`.

## What you need

| Piece | Notes |
| --- | --- |
| Kubernetes 1.27+ with an ingress controller | The chart's Ingress is off by default; point your own at the `<release>-platform` Service. |
| PostgreSQL 16+ | One database. The connecting role must be able to run migrations (or give a separate admin URL, below). |
| Object storage | Any S3-compatible store (`STORAGE_DRIVER=s3`) or Azure Blob (`azure`). |
| SMTP | Sign-up verification, invitations, reports and notifications go out by mail. |
| A licence key | From RocketEase. Without one the install runs as an evaluation (one workspace, scheduling for the trial period). |

Images are public on GHCR: `ghcr.io/brandonkorous/rocketease-{platform,worker,web}`.

## Install

1. Create the namespace and the ONE Secret the chart reads. Generate the two random
   values once; **never regenerate `TOKEN_MASTER_KEY`** — it wraps every stored
   provider token, and a new key makes all of them undecryptable.

   ```bash
   kubectl create namespace rocketease
   kubectl -n rocketease create secret generic rocketease-env \
     --from-literal=DATABASE_URL='postgres://rocketease:…@postgres:5432/rocketease' \
     --from-literal=BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \
     --from-literal=TOKEN_MASTER_KEY="$(openssl rand -base64 32)" \
     --from-literal=SMTP_URL='smtp://user:pass@smtp.example.com:587' \
     --from-literal=LICENCE_KEY='RE1.…' \
     --from-literal=S3_ENDPOINT='…' --from-literal=S3_BUCKET='media' \
     --from-literal=S3_ACCESS_KEY_ID='…' --from-literal=S3_SECRET_ACCESS_KEY='…'
   ```

   Optional keys (each one switches on exactly one feature, and the product says
   when one is missing): provider OAuth pairs (`META_APP_ID`/`META_APP_SECRET`, …),
   `ANTHROPIC_API_KEY` or the Azure OpenAI set, `CLAMAV_HOST`, GA4/Shopify. See
   `apps/platform/.env.example` for every name.

2. Write a values file with your address and channel:

   ```yaml
   app:
     url: https://social.your-agency.example
     mailFrom: "Your Agency <noreply@your-agency.example>"
     staffEmails: you@your-agency.example
   updates:
     channel: stable
   ingress:
     enabled: true
     className: nginx
     host: social.your-agency.example
     tls: [{ secretName: rocketease-tls, hosts: [social.your-agency.example] }]
   ```

3. Install. The migrate hook runs first and the pods roll when it has finished.

   ```bash
   helm install rocketease deploy/helm/rocketease -n rocketease -f values.yaml
   kubectl -n rocketease get pods
   curl https://social.your-agency.example/api/health
   ```

4. Open the address. The **first person to sign up claims the install** and
   creates its one organization; after that, accounts are created only for
   invited addresses (Team › Invite).

## Upgrade, channels, versions

- `updates.channel: stable` follows tagged releases; `edge` follows every build
  of `main`. The image tag IS the channel unless `image.tag` pins a version:

  ```bash
  helm upgrade rocketease deploy/helm/rocketease -n rocketease -f values.yaml --set image.tag=v1.3.0
  ```

- `updates.feedUrl` is empty by default, so the install never calls out. Set it
  to RocketEase's feed and the worker asks once a day; Settings › Billing then
  says whether a newer build is listed for your channel.
- Rotated a Secret value? Bump `secrets.revision` and upgrade — env is read at
  pod start, and nothing restarts on its own.

## The licence

`LICENCE_KEY` is checked offline against RocketEase's public key that is baked
into the build. Settings › Billing shows the licensee, expiry, workspace
allowance, included features and the key id. When it expires, publishing keeps
working for 30 days with a notice; after that new scheduling and new workspaces
pause until a new key is set. Nothing you have is ever locked away.

## Migrations and database roles

`drizzle-kit migrate` runs as a Helm hook from the worker image. It uses the
Secret key named by `migrate.databaseUrlKey` (default `DATABASE_URL`). If your
app role cannot run DDL, add an admin connection string under another key (for
example `DATABASE_ADMIN_URL`) and point `migrate.databaseUrlKey` at it. The
app itself needs to OWN the `pgboss` schema, because pg-boss creates its own
tables at runtime — the note in `deploy/README.md` explains the split RocketEase
uses in its own cluster.
