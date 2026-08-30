/*
 * Shared between the worker that writes a scan result and the UI that reports
 * it, so "we did not actually scan this" is one string in one place.
 */

/** Recorded on an asset marked `clean` that nothing actually inspected. */
export const NOT_SCANNED_NOTE = "not scanned: no scanner is configured";

/** True when the asset was passed without being looked at. */
export const wasNotScanned = (scanNote: string | null | undefined) => scanNote === NOT_SCANNED_NOTE;
