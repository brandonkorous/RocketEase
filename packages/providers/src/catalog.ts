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
import { FB_CAPS, IG_CAPS } from "./meta/graph";
import { MEMBER_CAPS, ORG_CAPS } from "./linkedin/client";
import { SCOPES as TIKTOK, capsFor as tiktokCaps } from "./tiktok/client";
import { SCOPES as YOUTUBE, capsFor as youtubeCaps } from "./youtube/client";
import { SCOPES as PINTEREST, accountCaps, boardCaps } from "./pinterest/client";
import { SCOPES as X, capsFor as xCaps } from "./x/client";
import { capsFor as gbpCaps, SCOPES as GBP } from "./google-business/client";
import { CAPS as MOCK_CAPS } from "./mock";

/** Every capability the contract expresses, addressed by path. */
export const CAPABILITY_PATHS = [
  "formats",
  "scheduling",
  "limits.firstComment",
  "limits.links",
  "limits.altText",
  "disclosure",
  "inbox.comments",
  "inbox.mentions",
  "inbox.messages",
  "inbox.reviews",
  "inbox.reply",
  "insights.organic",
  "insights.audience",
  "ads.import",
  "ads.manage",
  "ingestion.webhooks",
  "ingestion.polling",
] as const;

export type CapabilityPath = (typeof CAPABILITY_PATHS)[number];

export type CatalogEntry = {
  provider: ProviderKey;
  network: Network;
  kind: ChannelKind;
  /** What the user selects in Connected accounts, e.g. a Facebook Page. */
  label: string;
  /** Best case: what the network offers when every scope we can ask for is granted. */
  capabilities: Capabilities;
  /** Paths available only with an extra grant, mapped to the adapter's reason. */
  conditional: Partial<Record<CapabilityPath, string>>;
  /** Development-only network (the mock adapter); never shown on the public page. */
  dev?: boolean;
};

/** Adapters key `reasons` by feature, not by path; a path resolves through these keys in order. */
const REASON_KEYS: Record<CapabilityPath, string[]> = {
  formats: ["formats"],
  scheduling: ["scheduling"],
  "limits.firstComment": ["firstComment"],
  "limits.links": ["links"],
  "limits.altText": ["altText"],
  disclosure: ["disclosure"],
  "inbox.comments": ["comments"],
  "inbox.mentions": ["mentions"],
  "inbox.messages": ["messages"],
  "inbox.reviews": ["reviews"],
  "inbox.reply": ["reply", "comments"],
  "insights.organic": ["organic", "insights"],
  "insights.audience": ["audience", "insights"],
  "ads.import": ["ads"],
  "ads.manage": ["ads"],
  "ingestion.webhooks": ["webhooks"],
  "ingestion.polling": ["polling"],
};

/** True when the channel can do this at all (formats/links/scheduling are not booleans). */
export function capabilitySupported(caps: Capabilities, path: CapabilityPath): boolean {
  switch (path) {
    case "formats": return caps.formats.length > 0;
    case "scheduling": return caps.scheduling !== "none";
    case "limits.firstComment": return caps.limits.firstComment === true;
    case "limits.altText": return caps.limits.altText === true;
    case "disclosure": return (caps.disclosure ?? "caption") !== "none";
    case "limits.links": return caps.limits.links !== undefined && caps.limits.links !== "none";
    case "inbox.comments": return caps.inbox.comments;
    case "inbox.mentions": return caps.inbox.mentions;
    case "inbox.messages": return caps.inbox.messages;
    case "inbox.reviews": return caps.inbox.reviews;
    case "inbox.reply": return caps.inbox.reply;
    case "insights.organic": return caps.insights.organic;
    case "insights.audience": return caps.insights.audience;
    case "ads.import": return caps.ads.import;
    case "ads.manage": return caps.ads.manage;
    case "ingestion.webhooks": return caps.ingestion.webhooks;
    case "ingestion.polling": return caps.ingestion.polling;
  }
}

/** The declared explanation for a capability path, if the adapter recorded one. */
export function reasonFor(caps: Capabilities, path: CapabilityPath): string | undefined {
  for (const key of REASON_KEYS[path]) {
    const reason = caps.reasons?.[key];
    if (reason) return reason;
  }
  return undefined;
}

/** Reasons the adapter recorded that no capability column shows — network caveats worth stating. */
export function extraNotes(caps: Capabilities): { key: string; note: string }[] {
  const shown = new Set(Object.values(REASON_KEYS).flat());
  return Object.entries(caps.reasons ?? {})
    .filter(([key, note]) => Boolean(note) && !shown.has(key))
    .map(([key, note]) => ({ key, note: note as string }));
}

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
