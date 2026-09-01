# B-001 · P1 · We strip the C2PA content credential at publish and say nothing

**Status** fixed 2026-09-01, awaiting live verification
**Found** 2026-09-01, live in production, attaching a generated image to a Facebook post
**Where** `apps/platform/worker/handlers/asset/image.ts`, `apps/platform/lib/content.ts`

## Symptom

A gpt-image-2 image was attached to a real post and validated. Two warnings fired
(not virus-scanned, missing alt text). **No content-credential warning fired**, and the
file we would have sent carries no manifest.

## Why it happens

Four facts that are individually fine and together lose the disclosure:

1. The original PNG from gpt-image-2 **is** C2PA-signed. (Inferred, tightly: the asset is
   `generatedByAi: true`, so `credentialIssue` returns `credential_absent` for any state
   except `signed` — and that warning did not appear.)
2. Publishing sends the **preview rendition**, not the original —
   `lib/content.ts`, `opts.forPublish && web ? web.storageKey : a.storageKey`.
3. That rendition is built by `sharp(buf).rotate().resize().webp({quality: 82})` with no
   `.withMetadata()`. Sharp drops metadata, and a C2PA manifest would not survive a
   PNG-to-WebP transcode in any case. The manifest is gone.
4. `credentialIssue(a)` inspects the **parent asset's** provenance, sees `signed`, and
   correctly says nothing — about a file we are not sending.

`credentialForDerived()` in `lib/media/c2pa.ts` exists for exactly this and is written
correctly. It is called only from `lib/media/render-store.ts` (the ad-creative path).
The rendition path never calls it.

## Why it matters

Meta and TikTok auto-label from the credential. We remove the vendor's disclosure and
tell nobody — which `c2pa.ts`'s own header names as worse than never generating it.

## Fix

The credential check must describe **the bytes we actually publish**.

- Record the credential state on the rendition when it is made, probing the bytes we
  just produced rather than assuming. `writeRendition` already has them in hand.
- At publish, read the state of the rendition being sent; fall back to the asset only
  when the original is what goes out.
- A rendition with no recorded state cannot be assumed to have kept a manifest: derive
  `stripped` from a signed source, so the gap errs toward disclosure rather than silence.

Warnings, not blocks — unchanged. The caption label is a real disclosure and re-signing
needs a certificate we do not have (M12.5).

## Verification

Attach a generated image to a post, validate, and expect a `credential_stripped`
warning naming the file. Confirm a non-AI upload still produces no credential warning.
