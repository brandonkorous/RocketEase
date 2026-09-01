# B-005 · P2 · The spend ceiling cannot refuse anything the product can ask for

**Status** verified 2026-09-01 — the control works. The *design* problem (it cannot fire
on any honest image job, and can only be exercised by deploying a wrong value) is still open.
**Where** `deploy/k8s/overlays/production/kustomization.yaml`,
`apps/platform/lib/media/ceiling.ts`

## Symptom

`MEDIA_CEILING_USD_PER_JOB=0.50`. A generation job caps at 4 images, and the configured
rate is $0.05, so the largest request the product can make estimates at **$0.20**. The
per-job ceiling has never refused anything since it shipped, and cannot.

The monthly ceiling ($25.00) is reachable in principle but needs ~500 images.

## Why it matters

This is the control that guards spend on our own vendor key. A control that has never
fired is a control nobody has checked.

## What has been done

`lib/media/jobs.test.ts` (new) covers the wiring end to end: environment → route →
estimate → refuse, and asserts that a refusal writes **no row, queues no job, records no
audit event**. Verified non-vacuous by breaking `checkCeiling` and confirming three of
the six fail. `ceiling-policy.test.ts` already covered the decision itself.

The pod's environment is also confirmed good: the ConfigMap holds all four values, the
running pods are on the SHA that generated it, and `STAFF_EMAILS` from that same map is
verified working live — `envFrom` loads the whole map or none of it.

## Watched refusing, 2026-09-01

Lowered to $0.01 for one deploy and pressed Generate in the production Content Library:

> That would cost about $0.05, above the $0.01 limit for a single generation.

A red toast, not a crash. The library still showed 4 assets afterwards — the refusal
happens before a row exists or an adapter is called, exactly as `prepareJob` intends.
Restored to $0.50 in the next commit (`a80e012`).

## The better fix

Per-organization ceilings, set from `/staff`. Different customers will need different
limits anyway, and it makes the control testable forever without a deploy. Today the only
way to exercise a spend limit is to ship a wrong value to production, which is a design
smell in itself.

Video will fire it naturally in the meantime: Sora 2 at $0.10/s means an 8-second clip
estimates at $0.80, over the $0.50 limit. Decide that ceiling deliberately before wiring
video — see `docs/testing/live-media-generation.md`.
