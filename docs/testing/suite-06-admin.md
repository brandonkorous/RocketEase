# Suite 06 — Settings, billing, security, API, agency

## W. Settings shell

Fifteen sections (`lib/nav.ts` `SETTINGS_SECTIONS`). Every one must render for an authorised role and
refuse cleanly for an unauthorised one.

| ID | Section | Check | |
|---|---|---|---|
| W-01 | General | Workspace name, **timezone** (drives W10), locale save | ☐ |
| W-02 | Team and roles | Covered in suite 01 §D and suite 03 §L-01 | ☐ |
| W-03 | Notifications | Suite 03 §N-03 | ☐ |
| W-04 | Inbox | Saved replies, response target | ☐ |
| W-05 | Automations | Rules with approval gates — a rule cannot bypass an approval policy | ☐ |
| W-06 | Recycling | Evergreen recycling config (M8.9) | ☐ |
| W-07 | Hashtag sets | CRUD; used by the composer | ☐ |
| W-08 | Tracking | Suite 04 §S | ☐ |
| W-09 | Rights and authorisations | UGC licence windows, Spark codes, Partnership Ads grants (M8.4) | ☐ |
| W-10 | Connected accounts | Suite 02 §F | ☐ |
| W-11 | API keys | §X below | ☐ |
| W-12 | Billing | §Y below | ☐ |
| W-13 | Security | Suite 01 §B-07..B-10 | ☐ |
| W-14 | Single sign-on | §Z below | ☐ |
| W-15 | Audit log | §AA below | ☐ |

## X. Public API and MCP (M8.7)

| ID | Test | Expected | |
|---|---|---|---|
| X-01 | Create an API key | Shown **once**; stored hashed | ☐ |
| X-02 | Draft / approve / schedule / report endpoints | Work per `docs/api.md` | ☐ |
| X-03 | **Approval gates hold through the API** | The API cannot publish something the UI would require approval for | ☐ |
| X-04 | Revoke a key | Immediately refused | ☐ |
| X-05 | Key scoped to one workspace | Suite 01 §E-06 | ☐ |
| X-06 | Rate limiting / bad auth | Honest 401/429, no stack trace | ☐ |

## Y. Billing (M9.2)

Gated by `STRIPE_*` (optional secrets). If absent, the section must say so rather than half-render.

| ID | Test | Expected | |
|---|---|---|---|
| Y-01 | Settings → Billing renders | Plan, seats (unlimited), AI credit allowance and usage | ☐ |
| Y-02 | Stripe Customer Portal link | Opens the right customer | ☐ |
| Y-03 | Trial / grace period | 7-day grace honoured; entitlements correct | ☐ |
| Y-04 | Entitlement enforcement past grace | Degrades honestly; **no data loss** | ☐ |
| Y-05 | AI overage via Billing Meters | Metered; matches the M9.1 ledger (suite 05 §U-08) | ☐ |
| Y-06 | Pricing shown in-app vs the marketing site | Consistent. Marketing side is F-001 | ☐ |
| Y-07 | Webhook handling | Subscription changes reflect in-app | ☐ |

## Z. SSO and SCIM (M7)

Proven with curl; **no live IdP has been exercised**. Round 1 checks the surface, not a real IdP.

| ID | Test | Expected | |
|---|---|---|---|
| Z-01 | Settings → SSO renders | OIDC/SAML config per org | ☐ |
| Z-02 | Domain enforcement with owner break-glass | Owner is never locked out | ☐ |
| Z-03 | Email-first login branch | Routes to SSO for an enforced domain | ☐ |
| Z-04 | SCIM bearer token issue/revoke | Works | ☐ |
| Z-05 | Known limitation — do not file | SAML ForceAuthn is not exposable through `@better-auth/sso` 1.7.2, so SAML step-up records `forced: false` | — |

## AA. Audit log

| ID | Test | Expected | |
|---|---|---|---|
| AA-01 | Every action in the `permissions.md` audit list appears | Role changes, approvals, disconnects, spend, share-link views | ☐ |
| AA-02 | Rows are append-only | No edit or delete path anywhere | ☐ |
| AA-03 | Actor, target, timestamp, workspace | All present and correct | ☐ |
| AA-04 | Filter and export | Work | ☐ |

## AB. Agency and multi-workspace

| ID | Test | Expected | |
|---|---|---|---|
| AB-01 | `/agency` overview | Per-client roll-up; only workspaces you belong to (suite 01 §E-05) | ☐ |
| AB-02 | Workspace switcher | Fast; no state bleed between workspaces | ☐ |
| AB-03 | Agency branding | Applied to reports (suite 04 §Q-09) | ☐ |
| AB-04 | Economics / cost and margin roll-up (M8.11) | **Owner/admin only**; unknowns never render as 0 | ☐ |
| AB-05 | Economics CSV export | Matches the on-screen figures | ☐ |

## AC. Cross-cutting

| ID | Test | Expected | |
|---|---|---|---|
| AC-01 | 375 / 768 / 1440 on every primary screen | No horizontal scroll, no clipped controls | ☐ |
| AC-02 | Mobile bottom nav | Home, Calendar, Create, Inbox, More | ☐ |
| AC-03 | Keyboard-only through the core loop | Reachable and visibly focused throughout | ☐ |
| AC-04 | Status is icon + label, never colour alone | Design constraint, WCAG 2.2 AA | ☐ |
| AC-05 | Console errors on every visited page | Zero uncaught errors | ☐ |
| AC-06 | Failed network requests | None unexplained | ☐ |
| AC-07 | Feedback is toasts, not inline alerts | `Alert` only for persistent/blocking states | ☐ |
| AC-08 | Design constraints | Monochrome; colour only from platform brands. No gradients, glass, heavy shadows | ☐ |
| AC-09 | P75 navigation under 2.5s | Performance budget | ☐ |
| AC-10 | Browser back/forward across the app | No stale or broken views | ☐ |
