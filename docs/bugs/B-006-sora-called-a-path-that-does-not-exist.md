# B-006 — Video generation called an Azure path that does not exist

- **Severity:** P1 — video generation was 100% broken on its first real run.
- **Found:** 2026-09-01, first live clip in production (`/app/:id/content`).
- **Status:** fixed, verified live.

## What happened

The first video job ever submitted failed in the media worker:

```
media job submission failed  model=azure-sora-2
MediaError: No such video deployment. Check the deployment name matches the model.
```

The deployment was fine. `az cognitiveservices account deployment list` showed
`rocketease-video` present on `oai-rocketease-prod-eus2`, exactly as Terraform
declared it. The message was our own 404 handler guessing.

Probing the endpoint by hand found the real cause: we were POSTing to
`/openai/v1/video/generations/jobs`, and that path is not served.

```
POST /openai/v1/video/generations/jobs?api-version=preview  -> 404 {"detail":"Not Found"}
POST /openai/v1/videos?api-version=preview                  -> 200 {"object":"video",...}
```

`{"detail":"Not Found"}` is a routing 404 — a bare framework response, not
Azure's error envelope. That is the tell: a real Azure error carries
`{"error":{"code":...}}`. We turned it into a sentence about deployment names.

## The contract we had wrong

Everything about the request was wrong, not just the path. Measured against
`oai-rocketease-prod-eus2` on 2026-09-01:

| | We sent | Azure takes |
|---|---|---|
| Path | `/openai/v1/video/generations/jobs` | `/openai/v1/videos` |
| Size | `width: 720, height: 1280` | `size: "720x1280"` — `width` is an *unknown parameter* |
| Duration | `n_seconds: 4` | `seconds: "4"` — a **string**; the number is a 400 |
| Poll | `/…/jobs/{id}` | `/openai/v1/videos/{id}` |
| Download | `/…/{generationId}/content/video` | `/openai/v1/videos/{id}/content` |
| Output id | `generations[0].id` | there is no `generations[]`; the video id **is** the download id |
| Statuses | `succeeded`, `preprocessing` | `queued`, `in_progress`, `completed`, `failed` |
| Failure | `failure_reason` | `error.message` |
| Variants | `n_variants` | no such field |
| Expiry | 1 hour (assumed) | 24 hours (`expires_at − created_at` = 86400 exactly) |

The `api-version=preview` literal was the one thing we had right.

## Why the tests did not catch it

`packages/media/src/sora/index.test.ts` had 14 tests and all 14 passed. Every
fixture in it was **written from the same wrong reading** as the code, so the
suite only ever proved the adapter was consistent with itself. It asserted what
`stateFrom` did with an `n_variants` field that does not exist; it never
asserted the URL, and it never asserted the request body.

A test whose fixtures come from the same guess as the code under test cannot
fail. That is the durable lesson here, not the path.

## Fix

- `packages/media/src/sora/transport.ts` rewritten to the measured contract.
- `packages/media/src/sora/index.ts` — `sizeFor` returns one string; `stateFrom`
  reads `seconds`/`error.message` and names the video itself as the output.
- `models.ts` — `urlTtlSeconds` 3600 → 86400, measured rather than assumed.
- Tests rewritten around **response bodies copied from live calls**, plus two
  new tests that assert the request URL and the JSON body. Mutation-checked:
  restoring the old path fails both.
- The 404 handler now says "No such video deployment" **only** when Azure
  returns `code: "DeploymentNotFound"`; any other 404 is passed through
  verbatim. A wrong path is not a wrong name, and the old message sent us to
  check a deployment that was never the problem.

## What it cost

Nothing. The job failed at submission, before any spend, and `media.generate`
runs `retryLimit: 0`, so it failed once and stopped. The refusal path worked
exactly as designed — it was the request underneath it that was wrong.
