/*
 * Where a piece of media lives.
 *
 * Two different identifiers reach the renderer and they are NOT interchangeable:
 * library assets are rows with rights, scan status and an id; brand logos are
 * bare objects in storage under `ws/:id/brand/…` written by the brand kit.
 *
 * Modelling both as "an id" is how a logo key ends up in an asset lookup that
 * silently returns nothing. So the difference is in the type.
 */
export type MediaLocator =
  | { kind: "asset"; assetId: string }
  | { kind: "object"; storageKey: string };

export const assetLocator = (assetId: string): MediaLocator => ({ kind: "asset", assetId });
export const objectLocator = (storageKey: string): MediaLocator => ({ kind: "object", storageKey });

/** Stable string form — used in fingerprints and log lines, never parsed back. */
export const locatorKey = (l: MediaLocator): string => (l.kind === "asset" ? `asset:${l.assetId}` : `object:${l.storageKey}`);

export const isAsset = (l: MediaLocator): l is { kind: "asset"; assetId: string } => l.kind === "asset";
