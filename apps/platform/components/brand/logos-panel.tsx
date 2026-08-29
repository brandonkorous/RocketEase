"use client";

import { useRef, useState } from "react";
import { Button } from "@wizeworks/silicaui-react";
import { beginBrandLogoUpload, completeBrandLogoUpload, removeBrandLogo } from "@/lib/actions/brand/logos";
import { LOGO_LABEL, LOGO_ROLES, type LogoRole } from "@/lib/brand/types";
import type { LogoView } from "@/lib/brand/view-types";
import { useActionFeedback } from "@/lib/use-action-feedback";

type Props = { workspaceId: string; logos: LogoView[]; canEdit: boolean };

const ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml";
/** Mono marks are meant to be seen against their opposite background. */
const DARK_PREVIEW = new Set<LogoRole>(["mono_light"]);

async function put(url: string, file: File, headers: Record<string, string>) {
  const res = await fetch(url, { method: "PUT", body: file, headers });
  if (!res.ok) throw new Error(`Storage responded ${res.status}`);
}

function Slot({ workspaceId, role, current, canEdit }: { workspaceId: string; role: LogoRole; current?: LogoView; canEdit: boolean }) {
  const { run, notify, router } = useActionFeedback();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    try {
      const begin = await beginBrandLogoUpload({ workspaceId, role, mimeType: file.type, bytes: file.size });
      if (!("upload" in begin)) throw new Error(begin.error ?? "Upload could not start");
      await put(begin.upload.url, file, begin.upload.headers);
      notify(await completeBrandLogoUpload({ workspaceId, role, key: begin.key, note: current?.note ?? "" }));
      router.refresh();
    } catch (e) {
      notify({ error: e instanceof Error ? e.message : "Upload failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-box border border-base-300 p-3">
      <span className="text-xs font-medium">{LOGO_LABEL[role]}</span>
      <div className={`flex h-20 items-center justify-center rounded-field p-2 ${DARK_PREVIEW.has(role) ? "bg-neutral" : "bg-base-200"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {current ? <img src={current.url} alt={`${LOGO_LABEL[role]} logo`} className="max-h-16 max-w-full" /> : <span className="text-xs text-secondary/70">Empty</span>}
      </div>
      {canEdit && (
        <div className="flex gap-1">
          <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <Button size="xs" variant="outline" color="neutral" loading={busy} onClick={() => fileRef.current?.click()}>{current ? "Replace" : "Upload"}</Button>
          {current && <Button size="xs" variant="ghost" color="error" onClick={() => run(() => removeBrandLogo({ workspaceId, role }))}>Remove</Button>}
        </div>
      )}
    </div>
  );
}

/** One slot per logo variant, so "which file do I use for a square avatar" has an answer. */
export function LogosPanel({ workspaceId, logos, canEdit }: Props) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby="brand-logos-h">
      <div>
        <h3 id="brand-logos-h" className="text-base font-semibold">Logos</h3>
        <p className="mt-1 text-sm leading-relaxed text-secondary">PNG, JPG, WebP or SVG, under 512 KB each. Generated images never draw a logo — it is placed afterwards from the real file.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {LOGO_ROLES.map((role) => (
          <Slot key={role} workspaceId={workspaceId} role={role} current={logos.find((l) => l.role === role)} canEdit={canEdit} />
        ))}
      </div>
    </section>
  );
}
