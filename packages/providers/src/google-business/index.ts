/*
 * Google Business Profile adapter — review management (M8.10).
 *
 * One authorization can manage several accounts, each holding locations. A
 * channel is one LOCATION, and its remoteId is the account-scoped resource name
 * (`accounts/{a}/locations/{l}`) because the v4 reviews endpoints are parented
 * on the account while the v1 Business Information API returns bare
 * `locations/{l}`. Nothing is published from here: see inbox.ts for what the
 * product does offer and client.ts for why everything else is off.
 */
import type { ChannelDescriptor, ChannelKind, Credential, HealthReport, ProviderAdapter, ProviderConfig, PublicationStatus, PublishResult, ValidationIssue } from "../types";
import { ProviderError } from "../types";
import { probe } from "../health";
import { ACCOUNTS, capsFor, gbp, INFO, LOCATION_READ_MASK } from "./client";
import { fetchInbox, findReply, reply } from "./inbox";
import { DEFAULT_SCOPES, googleBusinessOAuth } from "./oauth";

type GbpAccount = { name?: string; accountName?: string; type?: string; verificationState?: string };
type GbpLocation = { name?: string; title?: string; storeCode?: string; storefrontAddress?: { locality?: string; administrativeArea?: string } };

const NO_PUBLISH = "Make It Social does not publish to Google Business Profile; a location is connected for reviews only.";

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
    accessSummary: ["See the business accounts and locations you manage", "Read reviews left on the locations you choose", "Reply to those reviews as the business"],
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

    validate(): ValidationIssue[] {
      return [{ severity: "error", code: "publishing_unsupported", message: NO_PUBLISH, field: "settings" }];
    },
    publish(): Promise<PublishResult> {
      throw new ProviderError(NO_PUBLISH, { category: "validation", providerCode: "publishing_unsupported" });
    },
    async findPublication(): Promise<PublishResult | null> {
      return null;
    },
    async publicationStatus(): Promise<PublicationStatus> {
      return { state: "unknown" };
    },

    fetchInbox: (cred, channel, opts) => fetchInbox(cred, channel, opts),
    reply: (cred, channel, req) => reply(cred, channel, req),
    findReply: (cred, channel, lookup) => findReply(cred, channel, lookup),
    // Review notifications need a per-project Pub/Sub topic; the inbox is polled.
  };
}
