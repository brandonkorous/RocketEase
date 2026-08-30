"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { beginUpload, completeUpload } from "@/lib/actions/assets";

export type UploadItem = { name: string; progress: number; status: "uploading" | "processing" | "done" | "error"; error?: string };

function putWithProgress(url: string, file: File, headers: Record<string, string>, onProgress: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Storage responded ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(file);
  });
}

/**
 * Direct-to-storage uploads with per-file progress; refreshes the route as files land.
 * `onUploaded` fires once the asset row exists — it is still `processing` at that
 * point, so callers that need a usable asset must wait for it to turn `ready`.
 */
export function useUploads(workspaceId: string, onUploaded?: (assetId: string) => void) {
  const router = useRouter();
  const [uploads, setUploads] = useState<UploadItem[]>([]);

  async function uploadOne(file: File, idx: number) {
    const set = (patch: Partial<UploadItem>) => setUploads((u) => u.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
    try {
      const begin = await beginUpload({ workspaceId, fileName: file.name, mimeType: file.type, bytes: file.size });
      if (!("assetId" in begin)) throw new Error(begin.error ?? "Upload could not start");
      await putWithProgress(begin.upload.url, file, begin.upload.headers, (p) => set({ progress: p }));
      set({ status: "processing", progress: 1 });
      const done = await completeUpload(workspaceId, begin.assetId);
      if (done.error) throw new Error(done.error);
      set({ status: "done" });
      onUploaded?.(begin.assetId);
      router.refresh();
    } catch (e) {
      set({ status: "error", error: e instanceof Error ? e.message : "Upload failed" });
    }
  }

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files);
    const base = uploads.length;
    setUploads((u) => [...u, ...list.map((f) => ({ name: f.name, progress: 0, status: "uploading" as const }))]);
    for (const [i, file] of list.entries()) await uploadOne(file, base + i);
    setTimeout(() => setUploads((u) => u.filter((x) => x.status === "error")), 4000);
  }

  return { uploads, uploadFiles };
}
