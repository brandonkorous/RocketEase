/*
 * Google Business Profile adapter — review management (M8.10).
 *
 * One authorization can manage several accounts, each holding locations. A
 * channel is one LOCATION, and its remoteId is the account-scoped resource name
 * (`accounts/{a}/locations/{l}`) because the v4 reviews endpoints are parented
 * on the account while the v1 Business Information API returns bare
 * `locations/{l}`. Posts (updates, events, offers) go out as localPosts
 * (posts.ts, M14.8); reviews are the inbox (inbox.ts); client.ts says why
 * everything else is off.
 */
import type { ChannelDescriptor, ChannelKind, Credential, HealthReport, ProviderAdapter, ProviderConfig, ValidationIssue } from "../types";
import { ProviderError } from "../types";
import { probe } from "../health";
import { validateAgainstCapabilities } from "../validate";
import { ACCOUNTS, capsFor, gbp, INFO, LOCATION_READ_MASK } from "./client";
import { fetchInbox, findReply, reply } from "./inbox";
import { DEFAULT_SCOPES, googleBusinessOAuth } from "./oauth";
import { findPublication, postIssues, publicationStatus, publish } from "./posts";

type GbpAccount = { name?: string; accountName?: string; type?: string; verificationState?: string };
type GbpLocation = { name?: string; title?: string; storeCode?: string; storefrontAddress?: { locality?: string; administrativeArea?: string } };

async function listAccounts(cred: Credential): Promise<GbpAccount[]> {
  const res = await gbp<{ accounts?: GbpAccount[] }>("/accounts", cred.accessToken, { base: ACCOUNTS, query: { pageSize: "100" } });
  return res.body.accounts ?? [];
}

/** Locations of one account, keyed by the v4 (account-scoped) resource name. */
async function locationsOf(cred: Credential, account: GbpAccount): Promise<ChannelDescriptor[]> {
  if (!account.name) return [];
  const res = await gbp<{ locations?: GbpLocation[] }>(`/${account.name}/locations`, cred.accessToken, {
    base: INFO,
    query: { readMask: LOCATION_READ_MASK, pageSize: "100" },
  }).catch((e) => {
    // An account we can see but cannot read locations for must not break the whole list.
    if (e instanceof ProviderError && (e.category === "permission" || e.category === "deleted")) return { body: {} as { locations?: GbpLocation[] } };
    throw e;
  });
  return (res.body.locations ?? []).flatMap((l) => {
    if (!l.name) return [];
    const where = [l.storefrontAddress?.locality, l.storefrontAddress?.administrativeArea].filter(Boolean).join(", ");
    return [{
      remoteId: `${account.name}/${l.name}`,
      kind: "gbp_location" as const,
      network: "google_business" as const,
      name: l.title ?? "Business location",
      handle: l.storeCode || where || undefined,
      capabilities: capsFor(cred),
    }];
  });
}

async function myLocations(cred: Credential): Promise<ChannelDescriptor[]> {
  const out: ChannelDescriptor[] = [];
  for (const a of await listAccounts(cred)) out.push(...(await locationsOf(cred, a)));
  return out;
}

const identify = async (cred: Credential) => {
  const [first] = await listAccounts(cred);
  return { id: first?.name, name: first?.accountName };
};

export function createGoogleBusinessProvider(cfg: ProviderConfig): ProviderAdapter {
  return {
    key: "google_business",
    displayName: "Google Business Profile",
    networks: ["google_business"],
    accessSummary: ["See the business accounts and locations you manage", "Publish posts (updates, events, offers) to the locations you choose", "Read reviews left on the locations you choose", "Reply to those reviews as the business"],
    defaultScopes: DEFAULT_SCOPES,
    ...googleBusinessOAuth(cfg, identify),

    listChannels: (cred) => myLocations(cred),

    async describeChannel(cred, remoteId, kind: ChannelKind) {
      const c = (await myLocations(cred)).find((x) => x.remoteId === remoteId && x.kind === kind);
      if (!c) throw new ProviderError("This location is no longer available to your Google login.", { category: "deleted" });
      return c;
    },

    healthCheck(cred): Promise<HealthReport> {
      return probe(DEFAULT_SCOPES, cred.scopes, () => gbp("/accounts", cred.accessToken, { base: ACCOUNTS, query: { pageSize: "1" } }));
    },

    validate(channel, req): ValidationIssue[] {
      return [...validateAgainstCapabilities(channel.capabilities, req), ...postIssues(req)];
    },
    publish: (cred, channel, req) => publish(cred, channel, req),
    findPublication: (cred, channel, key) => findPublication(cred, channel, key),
    publicationStatus: (cred, _channel, remoteId) => publicationStatus(cred, remoteId),

    fetchInbox: (cred, channel, opts) => fetchInbox(cred, channel, opts),
    reply: (cred, channel, req) => reply(cred, channel, req),
    findReply: (cred, channel, lookup) => findReply(cred, channel, lookup),
    // Review notifications need a per-project Pub/Sub topic; the inbox is polled.
  };
}
