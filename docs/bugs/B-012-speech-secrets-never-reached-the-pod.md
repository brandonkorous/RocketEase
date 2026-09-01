# B-012 — The speech secrets were in Key Vault and never reached the container

- **Severity:** P1 — voice-over and captions were unreachable in production.
- **Found:** 2026-09-01, on the first clip whose spec actually carried a script.
- **Status:** fixed.

## What happened

With B-011 fixed, the chain finally fired — and immediately said so:

```
voice-over failed  reason="No model can run this voiceover:
  mock-audio the mock adapter isn't configured;
  azure-gpt-4o-mini-tts the azure-speech adapter isn't configured."
```

The deployment existed. The Key Vault entries existed. The adapter still
reported itself unconfigured, because the values never reached the pod.

## Cause

Secrets get into a container through exactly one channel: the deploy job in
`ci.yml` copies a **named list** out of Key Vault into the `platform-env`
Secret. `AZURE_OPENAI_SPEECH_DEPLOYMENT`, `AZURE_OPENAI_SPEECH_API_VERSION` and
`AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT` were not on that list.

Nothing failed. A name absent from the list is simply never copied, the adapter
finds `undefined`, `configured()` returns false, and the product says *"the
model isn't configured"* — which is true, and points at the wrong thing.

**This is the second time.** The video pair had to be added to the same list on
the same day. The vault is not the source of truth for what a pod can see; that
list is.

## Fix

The three names are on the list. More usefully,
`lib/media/adapter-env.test.ts` now scans every `process.env.X` the adapters
read and asserts each Azure/OpenAI one appears in `ci.yml`. Mutation-checked:
removing either speech line fails two tests.

That guard is the real fix. Adding three strings solves today; the test means
the next adapter cannot ship its secret into a vault nobody reads.

## Why it took three attempts to see

The same feature failed three different ways in a row, each hiding the next:

1. **B-011** — the spec never carried the script, so nothing was queued.
2. **B-012** — the chain ran and found no configured model.
3. (pending) — whatever the first *real* voice-over run turns up.

Each fix revealed the next failure. That is what happens when a feature spans a
form, an action, a queue, a worker, a vendor and a deploy pipeline, and only the
last step can prove any of it.
