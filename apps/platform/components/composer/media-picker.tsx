"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@wizeworks/silicaui-react";
import { workspacePath } from "@/lib/nav";
import { ExpandButton, PlayBadge, useMediaLightbox } from "../shared/media-lightbox";
import { lightboxMedia, type ComposerAsset } from "./types";
import { filesFromPaste, useMediaUpload } from "./use-media-upload";

type Props = { assets: ComposerAsset[]; selected: string[]; onChange: (ids: string[]) => void; onClose: () => void; workspaceId: string };

const ACCEPT = "image/*,video/*";

export function MediaPicker({ assets, selected, onChange, onClose, workspaceId }: Props) {
  const [local, setLocal] = useState<string[]>(selected);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const add = (id: string) => setLocal((l) => (l.includes(id) ? l : [...l, id]));
  const { uploads, pending, timedOut, onFiles } = useMediaUpload(workspaceId, assets, add);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onPaste = (e: ClipboardEvent) => {
      const files = filesFromPaste(e);
      if (files.length) {
        e.preventDefault();
        onFiles(files);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("paste", onPaste);
    };
  }, [onClose, onFiles]);

  const toggle = (id: string) => setLocal((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  const failed = uploads.filter((u) => u.status === "error");
  const active = uploads.filter((u) => u.status === "uploading");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="picker-h"
        className="flex max-h-11/12 w-full max-w-215 flex-col rounded-box border border-base-300 bg-base-100"
        onClick={(e) => e.stopPropagation()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          onFiles(e.dataTransfer.files);
        }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-base-300 px-5 py-4">
          <h2 id="picker-h" className="text-base font-semibold">
            Add media <span className="font-normal text-secondary/70">· {local.length} selected</span>
          </h2>
          <div className="flex items-center gap-3">
            <input
              ref={fileInput}
              type="file"
              multiple
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => {
                onFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <Button variant="outline" color="neutral" size="sm" onClick={() => fileInput.current?.click()}>
              Upload
            </Button>
            <Link href={workspacePath(workspaceId, "content")} target="_blank" rel="noopener" className="text-sm font-medium hover:underline">
              Content Library ↗
            </Link>
          </div>
        </div>

        <div className="relative flex-1 overflow-y-auto p-5">
          {dragging && (
            <div className="pointer-events-none absolute inset-3 z-10 flex items-center justify-center rounded-box border-2 border-dashed border-base-content bg-base-100/90 text-sm font-medium">
              Drop to upload
            </div>
          )}
          {assets.length === 0 && !pending.length && !active.length ? (
            <Empty onPick={() => fileInput.current?.click()} />
          ) : (
            <AssetGrid assets={assets} local={local} toggle={toggle} pending={pending.length} uploading={active.length} />
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-base-300 px-5 py-4">
          <p className="text-xs text-secondary/70" aria-live="polite">
            {failed.length ? (
              <span className="text-error">{failed[0]?.error ?? "Upload failed"}</span>
            ) : timedOut ? (
              "Still processing. It will appear in the Content Library when it is ready."
            ) : pending.length ? (
              `Processing ${pending.length} file${pending.length === 1 ? "" : "s"} — it will be selected automatically.`
            ) : (
              "Drag files in, paste, or use Upload."
            )}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" color="neutral" onClick={onClose}>
              Cancel
            </Button>
            <Button
              color="primary"
              onClick={() => {
                onChange(local);
                onClose();
              }}
            >
              Use {local.length} item{local.length === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Empty({ onPick }: { onPick: () => void }) {
  return (
    <div className="flex h-full min-h-50 flex-col items-center justify-center gap-3 text-center">
      <p className="text-sm text-secondary">No media yet. Drag an image or video in, paste one, or choose a file.</p>
      <Button variant="outline" color="neutral" size="sm" onClick={onPick}>
        Choose a file
      </Button>
    </div>
  );
}

type GridProps = { assets: ComposerAsset[]; local: string[]; toggle: (id: string) => void; pending: number; uploading: number };

function AssetGrid({ assets, local, toggle, pending, uploading }: GridProps) {
  const { open, lightbox } = useMediaLightbox(lightboxMedia(assets));
  return (
    <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
      {Array.from({ length: pending + uploading }).map((_, i) => (
        <li key={`busy-${i}`}>
          <div className="flex aspect-square w-full items-center justify-center rounded-lg border-2 border-dashed border-base-300 bg-base-200 text-xs text-secondary/70">
            {i < uploading ? "Uploading…" : "Processing…"}
          </div>
        </li>
      ))}
      {assets.map((a, i) => {
        const idx = local.indexOf(a.id);
        return (
          <li key={a.id} className="relative">
            <button
              type="button"
              onClick={() => a.scanClean && toggle(a.id)}
              disabled={!a.scanClean}
              title={a.scanClean ? a.fileName : `${a.fileName} — still being checked`}
              className={`relative block aspect-square w-full overflow-hidden rounded-lg border-2 ${idx >= 0 ? "border-base-content" : "border-transparent"} ${a.scanClean ? "" : "opacity-40"}`}
              aria-pressed={idx >= 0}
              aria-label={a.fileName}
            >
              {a.thumbUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={a.thumbUrl} alt={a.altText ?? ""} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center bg-base-200 text-xs uppercase text-secondary/70">{a.kind}</div>
              )}
              {idx >= 0 && (
                <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-base-content text-xs font-bold text-base-100">{idx + 1}</span>
              )}
              {a.kind === "video" && <PlayBadge />}
            </button>
            <ExpandButton onClick={() => open(i)} label={`View ${a.fileName} larger`} className="absolute bottom-2 right-2" />
          </li>
        );
      })}
      {lightbox}
    </ul>
  );
}
