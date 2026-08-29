/*
 * Shared shapes for the rights rules. Plain data only: the rules are pure so
 * they can run in the composer, the promote action, the worker, and tests.
 */
import type { GrantKind } from "@/db/schema/rights";
import type { RightsScope } from "@/db/schema/assets";

export type { GrantKind, RightsScope };

export type RightsAsset = {
  id: string;
  fileName: string;
  rightsScope: RightsScope;
  rightsExpiresAt: Date | null;
};

export type RightsGrant = {
  id: string;
  kind: GrantKind;
  scope: RightsScope;
  label: string;
  assetId: string | null;
  channelId: string | null;
  creatorHandle: string | null;
  startsAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
};

export type RightsProblem = {
  severity: "error" | "warning";
  code: string;
  message: string;
  field: "media";
  /** Which clock produced it, for UI that wants to link back. */
  clockId: string;
};

/** A normalized clock: an asset's own rights, or one grant. */
export type Clock = {
  id: string;
  /** Sentence subject, e.g. `Usage rights for hero.jpg`. */
  what: string;
  scope: RightsScope;
  startsAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  /** Imperative half of the message. */
  fix: string;
};

export const KIND_LABEL: Record<GrantKind, string> = {
  ugc_license: "UGC licence",
  spark_code: "Spark code",
  partnership_ad: "Partnership-ad permission",
  music_license: "Music licence",
  other: "Authorisation",
};

export const SCOPE_LABEL: Record<RightsScope, string> = {
  organic: "Organic only",
  paid: "Paid only",
  both: "Organic and paid",
};

/** Warnings start this many days before a clock runs out. */
export const WARN_DAYS = 7;
export const DAY_MS = 86_400_000;
