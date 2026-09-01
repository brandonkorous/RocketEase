"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Textarea, useToast } from "@wizeworks/silicaui-react";
import { generateImage } from "@/lib/actions/generator";
import type { ImageAspect } from "@/lib/ai/generator/image-spec";

/**
 * Generating an image WITHOUT a concept.
 *
 * Until now the only way to reach image generation was the "Generate image"
 * button on a concept card, which meant it was gated behind AI drafting — two
 * different vendors and two different keys behind one switch. The server action
 * never had that coupling (it checks `canGenerate`, not `aiConfigured`), so
 * this surface simply asks for what the concept card was inferring.
 */
const ASPECTS: { key: ImageAspect; label: string; hint: string }[] = [
  { key: "square", label: "1:1", hint: "Square — feed posts" },
  { key: "portrait", label: "9:16", hint: "Portrait — Reels, Stories, TikTok" },
  { key: "landscape", label: "16:9", hint: "Landscape — YouTube, link previews" },
];

type Props = { workspaceId: string; estimate: string | null };

export function GeneratePanel({ workspaceId, estimate }: Props) {
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState<ImageAspect>("square");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const router = useRouter();

  const submit = async () => {
    setBusy(true);
    const res = await generateImage({ workspaceId, prompt, aspect, count: 1 });
    setBusy(false);
    if (res.error) return toast.add({ title: res.error, type: "error" });
    // A model that takes minutes finishes in the worker; that is not a failure.
    if (res.ok) return toast.add({ title: res.ok, type: "success" });
    setPrompt("");
    toast.add({ title: "Image added to the library. It's marked AI-generated.", type: "success" });
    router.refresh();
  };

  return (
    <section className="mt-6" aria-labelledby="gen-image">
      <h2 id="gen-image" className="text-sm font-semibold">Generate an image</h2>
      <p className="mt-1 text-xs text-secondary/70">Follows this workspace&rsquo;s visual direction. Lands in the library marked AI-generated.</p>
      <Textarea
        className="mt-2"
        rows={3}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="What should the picture show?"
        aria-label="Image description"
      />
      <div className="mt-2 flex items-center gap-1" role="group" aria-label="Image shape">
        {ASPECTS.map((a) => (
          <Button key={a.key} size="xs" variant={aspect === a.key ? "solid" : "ghost"} color="neutral" disabled={busy} aria-pressed={aspect === a.key} title={a.hint} onClick={() => setAspect(a.key)}>
            {a.label}
          </Button>
        ))}
      </div>
      <Button className="mt-2 w-full" size="sm" color="primary" loading={busy} disabled={prompt.trim().length < 3} onClick={submit}>
        Generate
      </Button>
      {estimate && <p className="mt-1.5 text-xs text-secondary/70">{estimate}</p>}
    </section>
  );
}
