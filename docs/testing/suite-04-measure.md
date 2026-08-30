# Suite 04 — Analytics, reports, campaigns, tracking

Insights ingest on a **15-minute tick with a 3-day revision tail** (W6). A post published minutes ago
will legitimately have no metrics. Judge the *explanation*, not the emptiness.

**W3 governs this whole suite: missing is never zero.**

## P. Analytics

| ID | Test | Expected | |
|---|---|---|---|
| P-01 | Overview: scorecard, trend, channel mix, top content (`analytics.png`) | Renders | ☐ |
| P-02 | Content and Engagement tabs | Render | ☐ |
| P-03 | Date range, comparison, scope filters | Persist across navigation | ☐ |
| P-04 | **Every metric carries a definition** | Name, formula, unit, freshness reachable in one interaction (promise 2) | ☐ |
| P-05 | **Every unavailable metric states why** | Never `0`. Check paid, conversions, revenue, ROAS with nothing connected | ☐ |
| P-06 | Freshness indicator | Accurate against the 15-min tick | ☐ |
| P-07 | A brand-new workspace with no data | Empty states teach the next action | ☐ |
| P-08 | Metric continuity: Meta reach to "viewers" (M8.3) | Dual-track definition; break annotation on the chart | ☐ |
| P-09 | Data-quality issues (5.7) | Surfaced in the UI and in the export header | ☐ |
| P-10 | Recommendations page | Each recommendation is **explainable** — says why | ☐ |

## Q. Reports

| ID | Test | Expected | |
|---|---|---|---|
| Q-01 | CSV export | Filters, definitions and freshness stamped in the file | ☐ |
| Q-02 | Save a report definition | Persists; re-runs | ☐ |
| Q-03 | Schedule delivery | Runs; **permissions re-checked at run time**, not at save time | ☐ |
| Q-04 | Branded HTML report (M7 white-label) | Cover, scorecard, trend, mix, top posts, inbox service, paid, recommendations, definitions appendix | ☐ |
| Q-05 | PDF | Only if `REPORT_CHROMIUM_PATH` is set. If not, **the UI must say the artifact is HTML** | ☐ |
| Q-06 | Share link `/r/:token` | Unauthenticated access works; expiry, revocation, passcode, rate limit all hold | ☐ |
| Q-07 | Share link views are audited | With a truncated fingerprint | ☐ |
| Q-08 | Double-opt-in external recipient | Confirmation at `/r/confirm/:token` required before delivery | ☐ |
| Q-09 | Agency branding and per-client "use the client's own brand" | Applied to the rendered report | ☐ |

## R. Campaigns and paid

| ID | Test | Expected | |
|---|---|---|---|
| R-01 | Create a campaign; attach content items | Objective, dates, owner, tracking all save | ☐ |
| R-02 | Detail tabs: Overview, Content, Ads, Audience, Conversations, Performance, Activity | All render | ☐ |
| R-03 | Connect a Meta ad account | Read-only import of campaigns, spend, conversions | ☐ |
| R-04 | Deep links to the native ads manager | Correct | ☐ |
| R-05 | Paid/organic split in analytics | Deterministic attribution; no double counting | ☐ |
| R-06 | Promote a post (M6.5) | Eligibility, preview, budget cap, policy + **reauth** + audit **before any spend** | ☐ |
| R-07 | Cancel out of the promote flow | No spend mutation occurs | ☐ |
| R-08 | Vocabulary | "Campaigns" for the organic+paid container, "Ads" inside campaign detail (`navigation.md`) | ☐ |

## S. Conversion tracking

GA4 and Shopify are code-complete but **untested live** (no credentials). The signed generic webhook
is the one path proven end to end. See `docs/tracking.md`.

| ID | Test | Expected | |
|---|---|---|---|
| S-01 | Settings → Tracking | Renders; sources listed with honest status | ☐ |
| S-02 | Configure the signed generic webhook; post a conversion | `conversion_fact` written; appears in analytics | ☐ |
| S-03 | Bad signature | Rejected | ☐ |
| S-04 | Replay the same conversion | Not double-counted | ☐ |
| S-05 | Paid vs site attribution | A paid `utm_medium` goes to the ad platform, everything else to the tracking source | ☐ |
| S-06 | ROAS | Paid-medium revenue divided by spend. Unavailable when spend is unknown — **not zero** | ☐ |
| S-07 | GA4 / Shopify connect | Expected to be unavailable. Judge the honesty of the message | ☐ |
