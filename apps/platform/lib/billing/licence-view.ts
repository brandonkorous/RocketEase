/*
 * What Settings › Billing shows on a self-hosted install instead of a plan:
 * the licence and the install. Strings only — the page has nothing to compute.
 */
import { appVersion, gitSha, updateChannel, type UpdateChannel } from "@/lib/deployment";
import { licenceKeySet, type Licence, type LicenceState } from "@/lib/licence";
import { formatInZone } from "@/lib/time";
import { latestUpdate, updateFeedUrl } from "@/lib/updates/check";
import { updateStanding, type UpdateStanding } from "@/lib/updates/feed";
import type { Entitlements } from "./entitlements";

export type LicenceView = {
  state: LicenceState;
  statusLabel: string;
  keySet: boolean;
  /** Why a key that is set cannot be used; null when it can, or when none is set. */
  reason: string | null;
  licensee: string | null;
  keyId: string | null;
  expiresOn: string | null;
  graceUntil: string | null;
  evaluationEndsOn: string | null;
  workspaces: number | null;
  features: string[];
  channel: string | null;
};

export type InstallView = {
  version: string;
  sha: string | null;
  channel: UpdateChannel;
  feedConfigured: boolean;
  checkedAt: string | null;
  latestVersion: string | null;
  notesUrl: string | null;
  standing: UpdateStanding;
  error: string | null;
};

export const LICENCE_STATUS_LABEL: Record<LicenceState, string> = {
  licensed: "Licensed",
  licence_grace: "Licence expired — in grace",
  licence_expired: "Licence expired",
  unlicensed: "Evaluation",
};

/** Beta feature names as a person reads them; an unknown key is shown as itself. */
const FEATURE_LABEL: Record<string, string> = { "media.generation": "Media generation" };
export const featureLabel = (key: string) => FEATURE_LABEL[key] ?? key;

const day = (d: Date | null, tz: string) => (d ? formatInZone(d, tz, { dateStyle: "medium" }) : null);

export function licenceView(lic: Licence, ent: Entitlements, timezone: string): LicenceView {
  return {
    state: lic.state,
    statusLabel: LICENCE_STATUS_LABEL[lic.state],
    keySet: licenceKeySet(),
    reason: lic.reason,
    licensee: lic.payload?.licensee ?? null,
    keyId: lic.payload?.id ?? null,
    expiresOn: day(lic.expiresAt, timezone),
    graceUntil: lic.state === "licence_grace" ? day(lic.graceUntil, timezone) : null,
    evaluationEndsOn: lic.state === "unlicensed" ? day(ent.gracefulUntil, timezone) : null,
    workspaces: lic.payload?.workspaces ?? null,
    features: lic.payload?.features.map(featureLabel) ?? [],
    channel: lic.payload?.channel ?? null,
  };
}

export async function installView(timezone: string): Promise<InstallView> {
  const row = await latestUpdate();
  return {
    version: appVersion(),
    sha: gitSha()?.slice(0, 7) ?? null,
    channel: updateChannel(),
    feedConfigured: Boolean(updateFeedUrl()),
    checkedAt: row ? formatInZone(row.checkedAt, timezone, { dateStyle: "medium", timeStyle: "short" }) : null,
    latestVersion: row?.latestVersion ?? null,
    notesUrl: row?.notesUrl ?? null,
    standing: updateStanding(appVersion(), row?.latestVersion ?? null),
    error: row?.error ?? null,
  };
}
