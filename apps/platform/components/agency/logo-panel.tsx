"use client";

import { useRef, useState } from "react";
import { Button } from "@wizeworks/silicaui-react";
import { beginAgencyLogoUpload, completeAgencyLogoUpload, removeAgencyLogo } from "@/lib/actions/agency/branding";
import { useActionFeedback } from "@/lib/use-action-feedback";

async function put(url: string, file: File, headers: Record<string, string>) {
  const res = await fetch(url, { method: "PUT", body: file, headers });
  if (!res.ok) throw new Error(`Storage responded ${res.status}`);
}

/** Direct-to-storage logo upload, then a server-side check that the object landed. */
export function LogoPanel({ organizationId, logoUrl, canEdit }: { organizationId: string; logoUrl: string | null; canEdit: boolean }) {
  const { run, notify, router } = useActionFeedback();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    try {
      const begin = await beginAgencyLogoUpload(organizationId, { mimeType: file.type, bytes: file.size });
      if (!("upload" in begin)) throw new Error(begin.error ?? "Upload could not start");
      await put(begin.upload.url, file, begin.upload.headers);
      notify(await completeAgencyLogoUpload(organizationId, begin.key));
      router.refresh();
    } catch (e) {
      notify({ error: e instanceof Error ? e.message : "Upload failed" });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-secondary">Logo</span>
      <div className="flex h-24 items-center justify-center rounded-box border border-base-300 p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logoUrl ? <img src={logoUrl} alt="Agency logo" className="max-h-16 max-w-full" /> : <span className="text-xs text-secondary/70">No logo yet</span>}
      </div>
      {canEdit && (
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <Button size="xs" variant="outline" color="neutral" loading={uploading} onClick={() => fileRef.current?.click()}>
            {logoUrl ? "Replace" : "Upload"}
          </Button>
          {logoUrl && (
            <Button size="xs" variant="ghost" color="error" onClick={() => run(() => removeAgencyLogo(organizationId))}>
              Remove
            </Button>
          )}
        </div>
      )}
      <p className="text-xs text-secondary/70">PNG, JPG, WebP or SVG, under 512 KB — it is embedded in every report so the file stays self-contained.</p>
    </div>
  );
}
