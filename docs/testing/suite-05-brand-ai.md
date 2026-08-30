# Suite 05 — Brand hub, AI, media

All AI is gated by `ANTHROPIC_API_KEY` + `NEXT_PUBLIC_AI_ENABLED` (build-time, W5). If AI controls
are absent, confirm against `environment.md` before filing — absence may be configuration.

## T. Brand hub

`/app/:workspaceId/brand`. The kit is the input every generated post, ad and image reads from.

| ID | Test | Expected | |
|---|---|---|---|
| T-01 | Overview card grid | One card per section, showing what is actually in it | ☐ |
| T-02 | Completeness meter | Reflects real content | ☐ |
| T-03 | Card empty states | Name what each gap **costs**, not just that it is empty | ☐ |
| T-04 | Identity, voice (banned words, emoji/spelling/CTA rules) | Save; audited per section | ☐ |
| T-05 | Messaging with dated offers | Save; expired offers filtered against the **workspace** timezone | ☐ |
| T-06 | Audiences, compliance rules, channel presence | Save | ☐ |
| T-07 | Visual identity: 8 logo variants via presigned upload | All upload; render | ☐ |
| T-08 | Palette, typography with licence note, imagery direction | Save | ☐ |
| T-09 | Brand assets | Library assets flagged as brand assets; rights/scan behaviour unchanged | ☐ |
| T-10 | External media references | Save | ☐ |
| T-11 | Stale-offer / licence warnings | Appear when they should | ☐ |
| T-12 | `settings/brand` | Redirects to `/brand` | ☐ |
| T-13 | Tolerant read | A partially filled kit never errors a page | ☐ |
| T-14 | Not built — do not file | Brand-kit export, copy-from-another-workspace, and a composer lint that blocks on banned words. Banned words reach the **model**, not the publish check | — |

## U. AI generation

| ID | Test | Expected | |
|---|---|---|---|
| U-01 | `/create/generate`: brief to concepts per network | Concepts respect network specs | ☐ |
| U-02 | Generated copy reflects the brand kit | Voice, banned words, offers all applied (M10.5) | ☐ |
| U-03 | **Output always lands as a draft** | Nothing auto-publishes. Promise 5 — a violation is P0 | ☐ |
| U-04 | AI caption variants in the composer | Insert as an editable draft | ☐ |
| U-05 | Repurpose an existing post | Works | ☐ |
| U-06 | Inbox reply drafts | Grounded in brand voice; still require a human send | ☐ |
| U-07 | Image generation | Gated by `OPENAI_API_KEY` + `AI_IMAGE_MODEL`. Brand kit appended to the prompt | ☐ |
| U-08 | AI usage ledger (M9.1) | Credits metered; usage meter accurate | ☐ |
| U-09 | Monthly allowance and **hard cap** | Cap actually stops spend — no surprise bill | ☐ |
| U-10 | Behaviour at the cap | Explained clearly, not a raw error | ☐ |
| U-11 | Provider error mid-generation | Handled honestly; no half-written draft presented as complete | ☐ |
| U-12 | Generated content is labelled as AI-assisted | Consistent with the M8.6 disclosure flag | ☐ |

## V. Media generation (M12) — expected absent

M12.1 and M12.2 are behind `feature_grant`, **default closed**, plus a `/staff` surface (W8).
M12.2 is also uncommitted and not deployed (W9).

| ID | Test | Expected | |
|---|---|---|---|
| V-01 | Any ad-creative generation entry point as a normal user | **Absent.** Correct behaviour | ☐ |
| V-02 | `/staff` as a non-staff user | Refused, no existence leak | ☐ |
| V-03 | Video upload probe (M12.1, deployed) | Covered in suite 02 G-03 — the one deployed piece of M12 | ☐ |
