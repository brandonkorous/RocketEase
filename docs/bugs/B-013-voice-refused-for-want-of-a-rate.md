# B-013 — The ceiling refused every voice-over, because the model had no rate

- **Severity:** P2 — a correct refusal for a real reason, but the feature was unusable.
- **Found:** 2026-09-01, on the first clip that reached the voice step configured.
- **Status:** fixed.

## What happened

With the secrets finally in the pod (B-012), the voice step ran and refused:

> This model has no configured rate, so its cost can't be checked against the
> spending limit. Set a rate before generating.

That is the ceiling working exactly as designed. `AI_MEDIA_RATES_JSON` had rates
for the image and video models and none for `azure-gpt-4o-mini-tts`, and a
per-job ceiling with no rate for the routed model **refuses every job** — the
rule CLAUDE.md states plainly, because "we don't know what this costs" is the
worst possible reason to spend.

So the bug is not the refusal. It is that a model was added to the catalog, made
routable, deployed and reached in production before anybody priced it.

## The rate, and why it is derived

Azure bills `gpt-4o-mini-tts` in **tokens** and publishes no per-character
meter. The "Neural TTS" entries in the retail price API are the separate Speech
service, not this model — a similarity worth naming, because taking one for the
other would have produced a rate 500x too high.

So it is measured. Against the live deployment on 2026-09-01, 40 characters of
input produced **3.168 seconds** of audio — 12.6 characters per second. At the
published ~$0.015 per minute of audio that is **$0.0000198 per character**,
rounded up to `0.000025` because a ceiling should err toward refusing.

A 200-character voice-over costs half a cent.

Credits follow the same proportion video uses rather than taste: a video credit
stands for about $0.0083 of our cost (12 credits/second against $0.10/second),
so a character at $0.000025 is **0.003 credits**. A 200-character voice-over is
well under one credit, which is honest — speech genuinely is cheap next to a
rendered second of video.

## Fix

Both rates are in the production overlay. More usefully,
`lib/media/model-rates.test.ts` asserts that **every model on an adapter
production configures has a rate**, and that any model whose vendor reports no
tokens also has a credits rate — otherwise the customer is charged nothing.
Mutation-checked.

Direct-vendor OpenAI models are deliberately exempt: they stay in the catalog so
old `media_job` rows resolve, but nothing routes to them here, and pricing a
path we do not run would be inventing a number.

## Three in a row, one feature

B-011, B-012 and B-013 are the same feature failing at three different layers,
each hiding the next: the request never carried the script, then the secret
never reached the pod, then the model had no price. None was visible until the
one before it was fixed.

Two of the three now have a test that would have caught them before a deploy.
That is the only durable answer to a feature that spans a form, an action, a
queue, a worker, a vendor, a secret pipeline and a spend ceiling.
