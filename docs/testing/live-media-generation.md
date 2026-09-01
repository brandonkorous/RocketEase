# Live production testing — AI media generation

State as of **2026-08-30**, written to survive a context compaction. Everything
below was verified against real infrastructure, not inferred.

---

## What is live and proven

**Image generation, end to end, on our own Azure resource.**

| | |
|---|---|
| Account | `oai-rocketease-prod-eus2` (kind `OpenAI`), `rg-sparx-prod-cus`, eastus2 |
| Deployment | `rocketease-images` → **gpt-image-2** v2026-04-21, GlobalStandard, capacity 2 |
| Endpoint | `https://oai-rocketease-prod-eus2.openai.azure.com/openai/deployments/rocketease-images/images/generations?api-version=2025-04-01-preview` |
| Vault | `AZURE-OPENAI-ENDPOINT`, `-API-KEY`, `-API-VERSION`, `-IMAGE-DEPLOYMENT` — all written by Terraform |

Two real calls returned **HTTP 200** with a decodable PNG: `1088x1088` and
`1088x1936`. The api-version, deployment path, `api-key` header and arbitrary
divisible-by-16 sizing are confirmed by live traffic, not documentation.

---

## What to actually test, and the order that finds bugs fastest

1. **Grant the beta.** `/staff` → grant `media.generation` to the org. Without
   it every entry point returns "Media generation isn't available", correctly.
   Nothing below works until this is done.
2. **Set the spend controls TOGETHER.** `MEDIA_CEILING_USD_PER_JOB` and
   `AI_MEDIA_RATES_JSON` are empty ConfigMap literals, so **production has no
   ceiling right now**. A per-job ceiling with no rate for the routed model
   refuses EVERY job by design — so set both or neither. The rate goes in as
   `{"azure-gpt-image-2": <usd per image>}`, read off Azure's pricing page.
3. **Generate from a concept card.** Create → Generate → "Generate image".
   Expect: an image back inline (the Azure adapter is `synchronous`), an asset
   in the library flagged AI-generated, and a `media_job` row recording
   `azure-openai` / `azure-gpt-image-2` / `gpt-image-2` plus a readable
   `model_reason`.
4. **Check the aspect that matters.** Portrait must request `1088x1936` — three
   of six placements are 9:16. Anything asking for 1024x1024 is a regression.
5. **Check provenance.** The asset's `provenance.c2pa` is probed from the bytes,
   not claimed. Publishing an AI image should surface the
   `credential_absent` warning in the composer.
6. **Check the audit trail.** One `media.generate` audit row, plus
   `asset.upload` per stored image.

---

## Known-blocked, with the reason

**Claude on Microsoft Foundry — blocked on subscription billing, not on code.**

The Foundry account `ai-rocketease-prod-eus2` (kind `AIServices`) exists. The
`claude-opus-5` deployment does not: creating it returns

    715-123420: Our system has detected this request as unusual activity
    for your account.

Microsoft documents the cause — Azure Marketplace partner models cannot be
purchased by subscriptions without an active pay-as-you-go billing method, and
this subscription is credit-funded (the jotDOJO Terraform section says so in as
many words). Attach a card, then flip `rocketease_claude_deployment_enabled` to
true. Nothing in the code or the Terraform needs to change.

Until then **AI drafting is off in production** — `ANTHROPIC-API-KEY` is not in
the vault, so `aiConfigured()` is false and every AI control hides itself.

Two further facts worth keeping:

- `claude-sonnet-5` — the platform's configured `AI_MODEL` default — has **zero
  quota** on every SKU in this subscription. `claude-opus-5` has 40 global / 13
  data-zone. Whatever gets deployed, `AI-MODEL` must be the DEPLOYMENT name.
- `azurerm_cognitive_deployment` cannot express `modelProviderData` (industry,
  organizationName, countryCode), which Anthropic deployments require. Even once
  billing is fixed, the deployment needs `az rest`, the `azapi` provider, or a
  newer azurerm.

---

## Traps that already cost time

- **Vault secret names take hyphens only.** `ANTHROPIC_BASE_URL` is rejected;
  `ANTHROPIC-BASE-URL` is right, and ci.yml maps it back.
- **A vault secret not listed in ci.yml's `optional=()` array never reaches the
  pods.** Setting it is a silent no-op.
- **`terraform plan` on this env hits Cloudflare rate limits** while refreshing
  the DNS module. Target the RocketEase resources to avoid touching it.
- **The `az cognitiveservices` CLI commands send a stale ARM api-version** and
  fail. Use `az resource list` / `az rest` with an explicit recent version.
- **centralus carries no image model at all**, which is why the AI accounts sit
  in eastus2 while everything else is centralus.

---

## Residency, stated accurately

Not uniform, and the subprocessor page now says so per row:

- **Images** — gpt-image-2 offers GlobalStandard ONLY. Generation may run in any
  region Microsoft hosts the model; anything stored stays in the US.
- **Text (when unblocked)** — Claude's Hosted-on-Azure versions also offer
  DataZoneStandard, which pins inference to the US. That is what the Terraform
  requests.
