/**
 * Single source of truth for the legal entity, contact points, and external URLs
 * that the public site and every legal document reference.
 */

export const ENTITY = {
  /** Legal name of the operating company. */
  legalName: "WizeWorks LLC",
  /** Trading / product name used throughout the site. */
  productName: "RocketEase",
  /** How the documents refer to the company after first mention. */
  shortName: "RocketEase",
  formationState: "California",
  governingLaw: "the State of California",
  venue: "Tulare County, California",
  address: {
    line1: "3727 East Paradise Ave",
    city: "Visalia",
    region: "CA",
    postalCode: "93292",
    country: "United States",
  },
} as const;

export const CONTACT = {
  support: "support@rocketease.com",
  general: "hello@rocketease.com",
  /** Privacy, legal, DMCA and security mail all route to support today. */
  privacy: "support@rocketease.com",
  legal: "support@rocketease.com",
  dmca: "support@rocketease.com",
  security: "support@rocketease.com",
} as const;

export const SITE = {
  url: "https://rocketease.com",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "https://app.rocketease.com",
  statusUrl: "https://status.rocketease.com",
} as const;

export const appPath = (path: string) => `${SITE.appUrl}${path}`;

export function formattedAddress(): string {
  const { line1, city, region, postalCode, country } = ENTITY.address;
  return `${line1}, ${city}, ${region} ${postalCode}, ${country}`;
}

/** Documents state a single effective date so revisions are auditable. */
export const LEGAL_EFFECTIVE = "2026-08-29";

export function formatLegalDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
