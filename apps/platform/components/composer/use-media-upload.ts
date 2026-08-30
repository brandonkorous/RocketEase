"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUploads } from "../library/use-uploads";
import type { ComposerAsset } from "./types";

/** An upload only reaches the picker once the worker has made its renditions. */
const POLL_MS = 1500;
const GIVE_UP_MS = 90_000;

export type PendingUpload = { assetId: string; since: number };

/**
 * Upload straight from the composer. The asset row exists as soon as the PUT
 * finishes, but `loadAssets` only returns `ready` rows, so each new id is held
 * as pending, the route is refreshed on a timer, and the asset is selected the
 * moment it appears.
 */
export function useMediaUpload(workspaceId: string, assets: ComposerAsset[], onSelect: (id: string) => void) {
  const router = useRouter();
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [timedOut, setTimedOut] = useState(false);
  const select = useRef(onSelect);
  select.current = onSelect;

  const { uploads, uploadFiles } = useUploads(workspaceId, (assetId) => {
    setTimedOut(false);
    setPending((p) => (p.some((x) => x.assetId === assetId) ? p : [...p, { assetId, since: Date.now() }]));
  });

  // Select each upload as it turns ready, and drop anything that never does.
  useEffect(() => {
    if (!pending.length) return;
    const ready = pending.filter((p) => assets.some((a) => a.id === p.assetId && a.scanClean));
    const stale = pending.filter((p) => Date.now() - p.since > GIVE_UP_MS);
    if (ready.length || stale.length) {
      for (const r of ready) select.current(r.assetId);
      if (stale.length) setTimedOut(true);
      const done = new Set([...ready, ...stale].map((x) => x.assetId));
      setPending((p) => p.filter((x) => !done.has(x.assetId)));
    }
  }, [assets, pending]);

  // Keep refreshing while anything is still processing.
  useEffect(() => {
    if (!pending.length) return;
    const t = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [pending.length, router]);

  const onFiles = useCallback(
    (files: FileList | File[] | null) => {
      const list = files ? Array.from(files) : [];
      if (list.length) void uploadFiles(list);
    },
    [uploadFiles],
  );

  return { uploads, pending, timedOut, onFiles };
}

/** Files from a paste event, if the clipboard carried any. */
export function filesFromPaste(e: ClipboardEvent | React.ClipboardEvent): File[] {
  const items = (e as ClipboardEvent).clipboardData?.items;
  if (!items) return [];
  return Array.from(items)
    .filter((i) => i.kind === "file")
    .map((i) => i.getAsFile())
    .filter((f): f is File => Boolean(f));
}
