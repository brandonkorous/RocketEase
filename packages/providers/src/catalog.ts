/*
 * CAPABILITY_CATALOG — the static, credential-free capability contract.
 *
 * Built from the SAME `*_CAPS` factories the adapters hand to the UI, so the
 * public capability page cannot drift from what the code declares. Adapters
 * that derive capabilities from granted scopes are evaluated twice: once with
 * every scope we can ask for (the best case a network offers) and once with the
 * default scopes, so anything that depends on an extra grant is listed as
 * conditional with the adapter's own reason rather than promised outright.
 */
import type { Capabilities, ChannelKind, Credential, Network, ProviderKey } from "./types";
import { CAPABILITY_PATHS, capabilitySupported, reasonFor, type CapabilityPath, type CatalogEntry } from "./capability-paths";
export { CAPABILITY_PATHS, capabilitySupported, extraNotes, reasonFor, type CapabilityPath, type CatalogEntry } from "./capability-paths";
import { FB_CAPS, IG_CAPS } from "./meta/graph";
import { MEMBER_CAPS, ORG_CAPS } from "./linkedin/client";
import { SCOPES as TIKTOK, capsFor as tiktokCaps } from "./tiktok/client";
import { SCOPES as YOUTUBE, capsFor as youtubeCaps } from "./youtube/client";
import { SCOPES as PINTEREST, accountCaps, boardCaps } from "./pinterest/client";
import { SCOPES as X, capsFor as xCaps } from "./x/client";
import { capsFor as gbpCaps, SCOPES as GBP } from "./google-business/client";
import { CAPS as MOCK_CAPS } from "./mock";

const cred = (scopes: string[]): Credential => ({ accessToken: "", scopes, providerUserId: "" });

const SCOPE_SETS = {
  tiktokAll: [...TIKTOK.base, ...TIKTOK.comments, ...TIKTOK.reply, ...TIKTOK.insights],
  youtubeAll: [...YOUTUBE.read, ...YOUTUBE.upload, ...YOUTUBE.comments, ...YOUTUBE.analytics],
  pinterestAll: [...PINTEREST.boards, ...PINTEREST.pins, ...PINTEREST.account],
  xAll: [...X.base, ...X.media, ...X.dmRead, ...X.dmWrite],
  xDefault: [...X.base, ...X.media],
};

type Draft = Omit<CatalogEntry, "conditional"> & { withDefaultScopes?: Capabilities };

/** Anything the best case can do that the default grant cannot is conditional, not promised. */
function build({ withDefaultScopes, ...rest }: Draft): CatalogEntry {
  const conditional: Partial<Record<CapabilityPath, string>> = {};
  if (withDefaultScopes) {
    for (const path of CAPABILITY_PATHS) {
      if (!capabilitySupported(rest.capabilities, path) || capabilitySupported(withDefaultScopes, path)) continue;
      conditional[path] = reasonFor(withDefaultScopes, path) ?? "Needs an extra permission from the network.";
    }
  }
  return { ...rest, conditional };
}

export const CAPABILITY_CATALOG: CatalogEntry[] = [
  build({ provider: "meta", network: "facebook", kind: "facebook_page", label: "Facebook Page", capabilities: FB_CAPS() }),
  build({ provider: "meta", network: "instagram", kind: "instagram_business", label: "Instagram Business account", capabilities: IG_CAPS() }),
  build({ provider: "linkedin", network: "linkedin", kind: "linkedin_organization", label: "LinkedIn Page", capabilities: ORG_CAPS() }),
  build({ provider: "linkedin", network: "linkedin", kind: "linkedin_member", label: "LinkedIn member profile", capabilities: MEMBER_CAPS() }),
  build({
    provider: "tiktok",
    network: "tiktok",
    kind: "tiktok_account",
    label: "TikTok account",
    capabilities: tiktokCaps(cred(SCOPE_SETS.tiktokAll)),
    withDefaultScopes: tiktokCaps(cred(TIKTOK.base)),
  }),
  build({ provider: "youtube", network: "youtube", kind: "youtube_channel", label: "YouTube channel", capabilities: youtubeCaps(cred(SCOPE_SETS.youtubeAll)) }),
  build({ provider: "pinterest", network: "pinterest", kind: "pinterest_board", label: "Pinterest board", capabilities: boardCaps(cred(SCOPE_SETS.pinterestAll)) }),
  build({ provider: "pinterest", network: "pinterest", kind: "pinterest_account", label: "Pinterest account", capabilities: accountCaps(cred(SCOPE_SETS.pinterestAll)) }),
  build({
    provider: "x",
    network: "x",
    kind: "x_account",
    label: "X account",
    capabilities: xCaps(cred(SCOPE_SETS.xAll)),
    withDefaultScopes: xCaps(cred(SCOPE_SETS.xDefault)),
  }),
  build({ provider: "google_business", network: "google_business", kind: "gbp_location", label: "Google Business Profile location", capabilities: gbpCaps(cred(GBP.manage)) }),
  build({ provider: "mock", network: "mock", kind: "mock_profile", label: "Demo profile", capabilities: MOCK_CAPS, dev: true }),
];

/** The networks a customer can actually connect — the demo adapter is excluded. */
export const PUBLIC_CAPABILITY_CATALOG = CAPABILITY_CATALOG.filter((e) => !e.dev);

export function catalogEntry(kind: ChannelKind): CatalogEntry | undefined {
  return CAPABILITY_CATALOG.find((e) => e.kind === kind);
}
