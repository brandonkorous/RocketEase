# Billing

Status: **the code is complete and unit-tested against a fake Stripe; no Stripe account is
connected, so nothing here has ever taken a real payment.** Everything below describes what the
code does, not what has been observed.

## The model

From the 2026 positioning decision:

- **A flat price per workspace per month.** A workspace is a brand or a client. The subscription's
  quantity is the organization's count of non-archived workspaces.
- **Unlimited team members.** Seats are never counted or charged.
- **Client reviewers and approvers are free.** They are workspace members like anyone else.
- **AI beyond an allowance is metered in credits.** 1 credit = 1,000 output tokens; input tokens
  count at a fifth (`lib/ai/usage/credits.ts` owns that conversion — billing re-exports it, never
  restates it). Each billed workspace includes `BILLING_INCLUDED_AI_CREDITS` per period.
- **A hard cap, so no surprise bills.** The AI meter refuses drafting at the cap
  (`lib/ai/usage/budget.ts`) rather than billing past it. Overage reporting can only ever bill what
  the ledger already recorded.

**No amount of money appears in this repository.** Prices, the meter and the product are Stripe
objects named by environment variables; the UI formats whatever Stripe returns.

## What billing is allowed to block

| Action | Gated? |
|---|---|
| Reading anything that already exists | Never |
| Publishing a post that is already scheduled | Never |
| Replying, editing, exporting | Never |
| Scheduling something **new** | Yes, once the grace period has run out |
| Creating a **new workspace** | Yes, when there is no active subscription |

A failed payment starts a **7-day grace period** (`GRACE_DAYS`). During it everything keeps
working and the billing page shows a persistent Alert — the one place the toast rule does not
apply, because the state persists until someone fixes it. After it, `schedulingBlock()`
(`lib/billing/gate.ts`) stops *new* scheduling in `scheduleItemCore`, with a message that says
plainly that already-scheduled posts still publish.

With `STRIPE_SECRET_KEY` unset, billing is **off**: nothing is charged, nothing is gated, and
Settings → Billing says so instead of pretending to work.

## Environment

| Variable | What it is |
|---|---|
| `STRIPE_SECRET_KEY` | Secret API key. Unset = billing off. |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for `/api/webhooks/stripe`. |
| `STRIPE_PRICE_WORKSPACE_MONTHLY` | Recurring per-unit price, monthly. |
| `STRIPE_PRICE_WORKSPACE_YEARLY` | Recurring per-unit price, yearly. Optional. |
| `STRIPE_METER_AI_CREDITS` | Billing meter **event name**, e.g. `ai_credits`. |
| `STRIPE_PRICE_AI_CREDIT_OVERAGE` | Metered price attached to that meter. |
| `BILLING_INCLUDED_AI_CREDITS` | Credits included per workspace per period (default 200). |
| `BILLING_TRIAL_DAYS` | Trial length on a new subscription; 0 disables (default 14). |
| `NEXT_PUBLIC_APP_URL` | Base for Checkout/portal return URLs. |

A plan whose price id is unset is simply not offered — the same rule providers and tracking
sources follow.

## Stripe dashboard setup

1. **Product → "Workspace".** Add a recurring price, **per unit** (not tiered), monthly. Copy the
   price id to `STRIPE_PRICE_WORKSPACE_MONTHLY`. Repeat yearly if you offer one.
2. **Billing → Meters → create a meter.** Event name `ai_credits`; aggregation **sum**; customer
   mapping `stripe_customer_id`; value key `value`. Copy the event name to
   `STRIPE_METER_AI_CREDITS`.
3. **Product → "AI credits".** Add a **usage-based** recurring price billed against that meter.
   Copy its id to `STRIPE_PRICE_AI_CREDIT_OVERAGE`.
4. **Settings → Billing → Customer portal.** Enable payment-method updates, cancellation and
   invoice history. The portal is the only place a plan is changed or cancelled — we never
   reimplement it.
5. **Developers → Webhooks → add endpoint** `https://<host>/api/webhooks/stripe`, subscribed to:
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`. Copy the signing
   secret to `STRIPE_WEBHOOK_SECRET`.

## How it fits together

```
Settings → Billing ──"Start subscription"──▶ Checkout (hosted)
                  └─"Manage billing"───────▶ Customer portal (hosted)

Stripe ──event──▶ /api/webhooks/stripe ──▶ billing_event (claim)
                                        └─▶ subscriptions.retrieve ──▶ billing_subscription
                                        └─▶ audit_event (billing.*)

worker nightly ──▶ billing.report_usage ──▶ ai_usage totals per workspace
                                        └─▶ credits above allowance ──▶ Stripe billing meter
                                        └─▶ billing_usage_report (running total)
```

- **Stripe is authoritative.** Every write is followed by re-reading the subscription from Stripe
  and syncing it into `billing_subscription`. Period bounds live on the *subscription item* in
  current API versions, so they are read from the flat item.
- **Quantity follows the workspaces.** `syncWorkspaceQuantity(orgId)` runs after a workspace is
  created. A Stripe failure there is logged, never surfaced — billing must not block workspace
  administration.
- **Webhooks are idempotent.** `billing_event` is claimed before any work and stamped
  `processed_at` after. A redelivery of a completed event is a no-op; a redelivery of one that
  crashed mid-apply runs again, which is safe because every apply is an upsert.
- **Usage is reported once.** `billing_usage_report` holds the running overage total per
  (subscription, workspace, period). Only the delta is sent, under a deterministic identifier, so
  a Stripe retry cannot double-charge. Partial credits are never billed.

## Tables (`db/schema/billing.ts`)

| Table | Grain |
|---|---|
| `billing_customer` | One Stripe customer per organization. |
| `billing_subscription` | Mirror of the Stripe subscription: status, plan, workspace quantity, period, trial, cancel-at, allowance snapshot. |
| `billing_event` | Every Stripe event id we have claimed, for idempotency. |
| `billing_usage_report` | Overage credits reported per (subscription, workspace, period). |

## Local testing

```bash
stripe login
stripe listen --forward-to localhost:5001/api/webhooks/stripe
# copy the whsec_… it prints into STRIPE_WEBHOOK_SECRET, then restart the app

# drive the flow from the UI (Settings → Billing → Start subscription) with test card 4242…,
# or fire events directly:
stripe trigger checkout.session.completed
stripe trigger invoice.payment_failed
```

To exercise the overage job without waiting for the nightly cron, enqueue `billing.report_usage`
(it is a singleton; the handler reports only deltas, so running it twice reports nothing twice).

Unit tests cover the entitlement maths, the overage calculation and webhook idempotency:

```bash
pnpm --filter @rocketease/platform test lib/billing
```
