"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Textarea, useToast } from "@wizeworks/silicaui-react";
import { generateVideo } from "@/lib/actions/video";

/**
 * Generating a clip.
 *
 * Deliberately not folded into the image panel: a video takes minutes and lands
 * later, so it never shows a result here, and its shape and length are the
 * model's own short list rather than the image aspects.
 */
const ASPECTS = [
  { key: "9:16" as const, label: "9:16", hint: "Portrait — Reels, Stories, TikTok" },
  { key: "16:9" as const, label: "16:9", hint: "Landscape — YouTube, link previews" },
];

/** What Sora 2 accepts. 6 seconds is a vendor error, not a rounded 8. */
const SECONDS = [4, 8, 12] as const;

/** Images flagged as product shots in the library, newest first. */
export type ProductOption = { id: string; label: string };

type Props = { workspaceId: string; estimate: string | null; products: ProductOption[] };

export function GenerateVideoPanel({ workspaceId, estimate, products }: Props) {
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState<(typeof ASPECTS)[number]["key"]>("9:16");
  const [seconds, setSeconds] = useState<(typeof SECONDS)[number]>(4);
  // Optional, and off by default: a reference constrains the shot, and most
  // clips do not want to open on a packshot.
  const [productAssetId, setProductAssetId] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const router = useRouter();

  const submit = async () => {
    setBusy(true);
    const res = await generateVideo({ workspaceId, prompt, aspect, seconds, productAssetId: productAssetId || undefined });
    setBusy(false);
    if (res.error) return toast.add({ title: res.error, type: "error" });
    setPrompt("");
    toast.add({ title: res.ok ?? "Generating.", type: "success" });
    router.refresh();
  };

  return (
    <section className="mt-6" aria-labelledby="gen-video">
      <h2 id="gen-video" className="text-sm font-semibold">Generate a clip</h2>
      <p className="mt-1 text-xs text-secondary/70">Takes a few minutes. Lands in the library marked AI-generated, with sound.</p>
      <Textarea
        className="mt-2"
        rows={3}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="What should happen in the clip?"
        aria-label="Clip description"
      />
      <div className="mt-2 flex items-center gap-1" role="group" aria-label="Clip shape">
        {ASPECTS.map((a) => (
          <Button key={a.key} size="xs" variant={aspect === a.key ? "solid" : "ghost"} color="neutral" disabled={busy} aria-pressed={aspect === a.key} title={a.hint} onClick={() => setAspect(a.key)}>
            {a.label}
          </Button>
        ))}
      </div>
      <div className="mt-1 flex items-center gap-1" role="group" aria-label="Clip length">
        {SECONDS.map((s) => (
          <Button key={s} size="xs" variant={seconds === s ? "solid" : "ghost"} color="neutral" disabled={busy} aria-pressed={seconds === s} onClick={() => setSeconds(s)}>
            {s}s
          </Button>
        ))}
      </div>
      {products.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          <label htmlFor="gen-product" className="text-xs font-medium">Open on a product shot <span className="text-secondary/70">(optional)</span></label>
          <select id="gen-product" className="select select-xs" value={productAssetId} disabled={busy} onChange={(e) => setProductAssetId(e.target.value)}>
            <option value="">No product shot</option>
            {products.map((p) => (<option key={p.id} value={p.id}>{p.label}</option>))}
          </select>
          {/* The reference IS the first frame, so say that rather than "uses". */}
          {productAssetId && <p className="text-xs text-secondary/70">The clip starts on this image, fitted to the frame on your brand colour.</p>}
        </div>
      )}
      <Button className="mt-2 w-full" size="sm" color="primary" loading={busy} disabled={prompt.trim().length < 3} onClick={submit}>
        Generate clip
      </Button>
      {estimate && <p className="mt-1.5 text-xs text-secondary/70">{estimate}</p>}
    </section>
  );
}
