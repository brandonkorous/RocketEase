/*
 * Bulk CSV import of posts (M8.9; Publer-style bulk scheduling).
 *
 * Pure and DB-free: parse, resolve destinations, and run the same validator the
 * composer runs. Remote media is NEVER fetched — `media_urls` is carried as a
 * note on the draft so a person can attach the real assets from the Library.
 */
import { validateAgainstCapabilities, type Capabilities, type ValidationIssue } from "@make-it-social/providers/client";

export const IMPORT_HEADERS = ["text", "channels", "scheduled_at", "first_comment", "link", "media_urls"] as const;
export type ImportHeader = (typeof IMPORT_HEADERS)[number];
export const MAX_IMPORT_ROWS = 500;

/** RFC 4180: quoted fields may hold commas, newlines, and doubled quotes. */
export function splitCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const text = input.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') cell += c;
      else if (text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = false;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

export type RawRow = { line: number; text: string; channels: string[]; scheduledAt: string | null; firstComment: string | null; link: string | null; mediaUrls: string[] };
export type ParseResult = { rows: RawRow[]; headerError: string | null; ignored: number };

const listOf = (v: string) => v.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);

/** Header row first; `text` and `channels` are the only required columns. */
export function parsePostsCsv(input: string): ParseResult {
  const table = splitCsv(input);
  if (table.length === 0) return { rows: [], headerError: "The file is empty.", ignored: 0 };
  const header = table[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  for (const required of ["text", "channels"] as const) {
    if (!header.includes(required)) return { rows: [], headerError: `Missing the "${required}" column. Download the template to see the expected header.`, ignored: 0 };
  }
  const at = (cells: string[], name: ImportHeader) => { const i = header.indexOf(name); return i === -1 ? "" : (cells[i] ?? "").trim(); };
  const body = table.slice(1);
  const rows = body.slice(0, MAX_IMPORT_ROWS).map((cells, i) => ({
    line: i + 2,
    text: at(cells, "text"),
    channels: listOf(at(cells, "channels")),
    scheduledAt: at(cells, "scheduled_at") || null,
    firstComment: at(cells, "first_comment") || null,
    link: at(cells, "link") || null,
    mediaUrls: listOf(at(cells, "media_urls")),
  }));
  return { rows, headerError: null, ignored: Math.max(0, body.length - MAX_IMPORT_ROWS) };
}

export type ImportChannel = { id: string; name: string; handle: string | null; network: string; capabilities: Capabilities };

const keysFor = (c: ImportChannel) => [c.id, c.handle ?? "", `@${c.handle ?? ""}`, c.name, c.network].filter(Boolean).map((k) => k.toLowerCase());

/** Tokens may be ids, handles (with or without @), channel names, or network keys. */
export function resolveChannels(tokens: string[], channels: ImportChannel[]): { ids: string[]; unknown: string[] } {
  const ids: string[] = [];
  const unknown: string[] = [];
  for (const raw of tokens) {
    const t = raw.toLowerCase();
    const hits = channels.filter((c) => keysFor(c).includes(t));
    if (hits.length === 0) unknown.push(raw);
    for (const h of hits) if (!ids.includes(h.id)) ids.push(h.id);
  }
  return { ids, unknown };
}

export type RowProblem = ValidationIssue & { channelName?: string };
export type CheckedRow = { line: number; text: string; channelIds: string[]; channelNames: string[]; scheduledAtIso: string | null; firstComment: string | null; link: string | null; mediaUrls: string[]; problems: RowProblem[] };

function scheduleProblem(value: string | null, now: Date): { iso: string | null; problem: RowProblem | null } {
  if (!value) return { iso: null, problem: null };
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return { iso: null, problem: { severity: "error", code: "schedule_unparsable", message: `"${value}" is not an ISO date-time (e.g. 2026-09-01T09:00:00Z).`, field: "schedule" } };
  if (at.getTime() < now.getTime()) return { iso: at.toISOString(), problem: { severity: "warning", code: "schedule_in_past", message: "That time has passed; the row will import as a draft.", field: "schedule" } };
  return { iso: at.toISOString(), problem: null };
}

/** Everything wrong with one row, per channel, in the composer's own words. */
export function checkRow(row: RawRow, channels: ImportChannel[], now: Date): CheckedRow {
  const { ids, unknown } = resolveChannels(row.channels, channels);
  const problems: RowProblem[] = [];
  if (!row.text.trim() && row.mediaUrls.length === 0) problems.push({ severity: "error", code: "text_missing", message: "Add text (media URLs are only a note, not content).", field: "text" });
  for (const u of unknown) problems.push({ severity: "error", code: "channel_unknown", message: `No connected account matches "${u}".`, field: "settings" });
  if (ids.length === 0 && unknown.length === 0) problems.push({ severity: "error", code: "channel_missing", message: "Name at least one connected account.", field: "settings" });
  const { iso, problem } = scheduleProblem(row.scheduledAt, now);
  if (problem) problems.push(problem);
  if (row.mediaUrls.length) problems.push({ severity: "warning", code: "media_not_fetched", message: `${row.mediaUrls.length} media URL${row.mediaUrls.length === 1 ? "" : "s"} kept as a note — attach the assets in Create.`, field: "media" });
  for (const id of ids) {
    const c = channels.find((x) => x.id === id)!;
    const issues = validateAgainstCapabilities(c.capabilities, { format: "text", text: row.text, media: [], link: row.link ?? undefined, firstComment: row.firstComment ?? undefined, settings: {} });
    for (const i of issues) problems.push({ ...i, channelName: c.name });
  }
  return { line: row.line, text: row.text, channelIds: ids, channelNames: ids.map((id) => channels.find((c) => c.id === id)!.name), scheduledAtIso: iso, firstComment: row.firstComment, link: row.link, mediaUrls: row.mediaUrls, problems };
}

export const rowBlocked = (r: CheckedRow) => r.problems.some((p) => p.severity === "error");

/** The downloadable starter file. One example row, no invented claims in it. */
export function csvTemplate(): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const example = ["Our new opening hours start Monday.", "@ourhandle, instagram", "2026-09-01T09:00:00Z", "Full details on the site.", "https://example.com/hours", ""];
  return [IMPORT_HEADERS.join(","), example.map(esc).join(",")].join("\n") + "\n";
}
