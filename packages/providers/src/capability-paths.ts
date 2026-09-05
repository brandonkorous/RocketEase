import type { Capabilities, ChannelKind, Network, ProviderKey } from "./types";

/** Every capability the contract expresses, addressed by path. */
export const CAPABILITY_PATHS = [
  "formats",
  "scheduling",
  "limits.firstComment",
  "limits.links",
  "limits.altText",
  "disclosure",
  "cover",
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
  cover: ["cover"],
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
    case "cover": return (caps.cover ?? "none") !== "none";
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
