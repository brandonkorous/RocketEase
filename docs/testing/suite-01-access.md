# Suite 01 — Public site, auth, onboarding, tenancy

Gates every other suite. Run first.

Legend: `☐` not run · `✅` pass · `⚠️` finding logged · `⛔` blocked

## A. Marketing site (rocketease.com)

| ID | Test | Expected | |
|---|---|---|---|
| A-01 | Landing page loads; nav dropdowns and mobile nav work | No 404s, no layout break at 375/768/1440 | ☐ |
| A-02 | Every footer link (5 columns, ~20 routes) | All 200. This was the M11 blocker — verify none regressed | ☐ |
| A-03 | `/pricing` | Prices render honestly. See F-001 — placeholder expected, must not show `undefined`, `$NaN`, or a blank | ☐ |
| A-04 | `/legal` index + all 12 documents | Each renders with a working table of contents | ☐ |
| A-05 | Legal entity name | Reads **WizeWorks LLC** (with the `s`) everywhere. `apps/web` needed a redeploy for this fix — confirm it landed | ☐ |
| A-06 | `/integrations` | Per-provider status is *honest* — nothing claims live that isn't | ☐ |
| A-07 | `/capabilities` (on the platform host) | Generated from the adapters; matches what the app actually offers | ☐ |
| A-08 | `/sitemap.xml`, `/robots.txt`, a 404 route | Valid; 404 is designed, not a stack trace | ☐ |
| A-09 | `/data-deletion/[code]` with a bogus code | Honest "not found", no leak | ☐ |
| A-10 | Contact / demo forms | Submit and confirm mail arrives (real send — W12) | ☐ |

## B. Signup and authentication

| ID | Test | Expected | |
|---|---|---|---|
| B-01 | Sign up with email/password | Verification mail arrives; link works | ☐ |
| B-02 | Sign up with an address already registered | No account enumeration | ☐ |
| B-03 | Weak/short password, mismatched confirm | Clear, inline, non-blaming errors | ☐ |
| B-04 | Log in before verifying | Behaviour is stated, not a silent failure | ☐ |
| B-05 | Password reset end to end | Mail arrives, token single-use, expired token handled | ☐ |
| B-06 | Google sign-in button | Present only if `NEXT_PUBLIC_AUTH_SOCIAL`/client id were baked (W5). If present, it must work | ☐ |
| B-07 | Enable TOTP 2FA; log out; log in | `/login/2fa` step appears; correct code passes; wrong code fails safely | ☐ |
| B-08 | Backup codes | Issued, single-use, regenerable | ☐ |
| B-09 | Session list; revoke another session | Revoked session actually loses access | ☐ |
| B-10 | Password change | Requires current password; sessions handled per policy | ☐ |
| B-11 | Stale cookie: log in, delete the session server-side, navigate | No redirect loop on `/login` (the documented middleware trap) | ☐ |
| B-12 | Log out | Fully signed out; back button does not restore an authenticated view | ☐ |

## C. Onboarding

| ID | Test | Expected | |
|---|---|---|---|
| C-01 | First run: `/onboarding` → org → workspace → goals | Completes; lands somewhere useful (UX-Q4) | ☐ |
| C-02 | Workspace timezone selection | Honoured later by the calendar and scheduling (W10) | ☐ |
| C-03 | Refresh / back mid-onboarding | No duplicate org or workspace created | ☐ |
| C-04 | Abandon onboarding, log in again | Resumes; does not strand the account | ☐ |
| C-05 | Add a second workspace | Switcher appears and works | ☐ |
| C-06 | Home checklist | Reflects real state — connecting a channel ticks the connect step, etc. | ☐ |

## D. Invitations and roles

| ID | Test | Expected | |
|---|---|---|---|
| D-01 | Invite a member from Team | Mail arrives; `/invite/:token` accepts | ☐ |
| D-02 | Accept as a *new* user vs an *existing* user | Both paths work | ☐ |
| D-03 | Reused / expired / tampered token | Refused cleanly | ☐ |
| D-04 | Invite to a workspace you don't administer | Refused server-side | ☐ |
| D-05 | Change a member's role; remove a member | Takes effect immediately; audited | ☐ |
| D-06 | Each of the 8 role presets | Nav and controls match `permissions.md`; no control visible that the role can't use | ☐ |
| D-07 | Client approver role | Sees only assigned requests; cannot browse the workspace | ☐ |

## E. Tenancy isolation — **P0 territory**

Do these by URL, not by clicking (W4). You need two workspaces, ideally in two organizations.

| ID | Test | Expected | |
|---|---|---|---|
| E-01 | Paste workspace B's URL while signed in as a member of A only | Redirected; **no existence leak** | ☐ |
| E-02 | Same for a deep object: `/app/B/posts/:id`, `/app/B/inbox/:id`, `/app/B/campaigns/:id`, `/app/B/reports/:id` | All refused identically | ☐ |
| E-03 | Call a server action with a foreign workspace id (devtools) | Refused server-side, not just hidden in the UI | ☐ |
| E-04 | Public report share link `/r/:token` | Works unauthenticated; revoked token stops working; passcode enforced; view is audited | ☐ |
| E-05 | Agency overview `/agency` | Shows only workspaces you belong to | ☐ |
| E-06 | API key from workspace A used against workspace B | Refused | ☐ |
