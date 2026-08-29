export type AssetCard = {
  id: string; kind: "image" | "video" | "document"; fileName: string; title: string | null; altText: string | null; caption: string | null; mimeType: string;
  bytes: number | null; width: number | null; height: number | null; durationSeconds: number | null; uploadStatus: string; scanStatus: string; scanNote: string | null;
  processingError: string | null; rightsNote: string | null; rightsExpiresAt: string | null; rightsScope: "organic" | "paid" | "both"; folderId: string | null; tags: string[]; thumbUrl: string | null; previewUrl: string | null;
  originalUrl: string | null; renditions: { kind: string; width: number | null; height: number | null; bytes: number | null }[]; usedIn: Record<string, number>; createdAt: string; uploadedBy: string | null;
};
export type CollectionRow = { id: string; name: string; count: number };
export type RecentRow = { id: string; fileName: string; bytes: number | null; createdAt: string; thumbUrl: string | null };
export type LibraryQuery = { q: string; tab: string; folder: string; smart: string; sort: string; tag: string };
export type LibraryData = {
  workspaceId: string; timezone: string; canEdit: boolean; canPublish: boolean;
  tabs: { all: number; images: number; videos: number; drafts: number; templates: number; copy: number };
  collections: CollectionRow[];
  smart: { expiring: number; review: number; unused: number; used: number };
  assets: AssetCard[]; selected: AssetCard | null; matched: number; page: number; pageSize: number;
  recent: RecentRow[]; allTags: string[]; query: LibraryQuery;
};

export const fmtBytes = (b: number | null) => (b == null ? "" : b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
export const fmtDur = (s: number | null) => (s == null ? null : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
export const fmtDate = (iso: string, tz: string) => new Intl.DateTimeFormat("en-US", { timeZone: tz, dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
