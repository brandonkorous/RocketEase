# B-002 · P1 · An AI-generated asset can be published with the disclosure set to "none"

**Status** fixed 2026-09-01, awaiting live verification
**Found** 2026-09-01, live in production
**Where** `apps/platform/lib/disclosure.ts`, `apps/platform/lib/content.ts`

## Symptom

Attached an asset our own generator made — `generatedByAi: true`, model
`azure-gpt-image-2`, cost recorded — to a post. "Contains AI-generated media?" stayed on
**"No AI-generated media"**. Validation raised nothing. The post could be published with
no label.

## Why it happens

`disclosureGap()` only fires in the opposite direction: you declared synthetic media and
the destination cannot label it. There is no check for *declared nothing while carrying
generated media*. Nothing connects `asset.generatedByAi` — which we set reliably in
`lib/media/normalize.ts` — to `content_item.synthetic_media`.

So the product knows the picture was generated, and lets an author who forgot publish it
undisclosed.

## Fix

A pure rule beside `disclosureGap` in `lib/disclosure.ts`: attached assets are flagged
generated, the item's flag is not `synthetic_media` → an issue naming the files.

Severity mirrors the existing rule: **error** when the workspace sets
`requireAiDisclosure`, **warning** otherwise. Warning by default is deliberate — the
author may have edited the image beyond recognition, and this is a prompt, not a verdict.

Do not silently auto-set the flag. The disclosure is the author's statement, and a
declaration the product made on their behalf is not a declaration.

## Verification

Attach a generated asset, leave the disclosure on "none", validate: expect a warning
naming the file. Set it to "Synthetic image, video or audio": the warning goes away and
"Facebook: label added to caption" appears. Turn on `requireAiDisclosure`: it becomes an
error and blocks.
