# Deploy

Kustomize manifests for the sparx AKS cluster (`deploy/k8s`). Still to wire into the sparx.works Terraform:

- **Registry** — CI pushes to GHCR; switch the login step and the overlay `images:` to the sparx ACR.
- **Secret `platform-env`** (namespace `make-it-social`): `DATABASE_URL`, `BETTER_AUTH_SECRET`, `SMTP_URL`, `TOKEN_MASTER_KEY`, provider client IDs/secrets. Sourced from Key Vault by Terraform.
- **Ingress** class + TLS issuer annotations per cluster convention.
- **Blob storage** credentials once M1.9 lands (`STORAGE_*`).

Release order: `migrate` Job → roll `platform` + `worker` → roll `web`. Both Next apps listen on 3000 inside the container.

Local: `pnpm dev` (Postgres :5050, Mailpit UI :5026, web :5000, platform :5001, worker).
