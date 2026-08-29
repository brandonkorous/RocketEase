"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@wizeworks/silicaui-react";
import { generateConcepts, generateImage, regenerateConcept, saveBrief, sendToCreate } from "@/lib/actions/generator";
import type { AdSet, Brief, Concept } from "@/lib/ai/generator/types";
import { conceptText } from "@/lib/ai/generator/types";
import { cleanBrief, emptyBrief, type GeneratorChannel } from "./types";

export type ConceptImage = { assetId: string; url: string };

/**
 * All generator state in one place. Nothing here publishes: the only write is
 * "Use in Create", which makes a draft and navigates to it.
 */
export function useGenerator(workspaceId: string, channels: GeneratorChannel[]) {
  const toast = useToast();
  const router = useRouter();
  const [brief, setBrief] = useState<Brief>(() => emptyBrief(channels));
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [adSets, setAdSets] = useState<AdSet[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [images, setImages] = useState<Record<string, ConceptImage[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [ran, setRan] = useState(false);

  const fail = (message: string) => toast.add({ title: message, type: "error", timeout: 7000 });
  const set = (patch: Partial<Brief>) => setBrief((b) => ({ ...b, ...patch }));

  const run = async () => {
    setBusy("run");
    const res = await generateConcepts({ workspaceId, brief: cleanBrief(brief) });
    setBusy(null);
    setRan(true);
    if (res.error) return fail(res.error);
    setConcepts(res.concepts ?? []);
    setAdSets(res.adSets ?? []);
    setNotes(res.notes ?? []);
  };

  const regenerate = async (concept: Concept) => {
    setBusy(concept.id);
    const avoid = concepts.filter((c) => c.channelId === concept.channelId).map((c) => c.rationale || c.hook).filter(Boolean);
    const res = await regenerateConcept({ workspaceId, brief: cleanBrief(brief), channelId: concept.channelId, avoid });
    setBusy(null);
    if (res.error || !res.concept) return fail(res.error ?? "Nothing came back. Try again.");
    setConcepts((list) => list.map((c) => (c.id === concept.id ? res.concept! : c)));
  };

  const edit = (id: string, patch: Partial<Concept>) => setConcepts((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const copy = async (c: Concept) => {
    try {
      await navigator.clipboard.writeText(conceptText(c));
      toast.add({ title: "Copied to the clipboard.", type: "success" });
    } catch {
      fail("Your browser blocked the clipboard. Select the text and copy it.");
    }
  };

  const use = async (c: Concept) => {
    setBusy(c.id);
    const assets = images[c.id] ?? [];
    const res = await sendToCreate({
      workspaceId,
      concept: { channelId: c.channelId, hook: c.hook, body: c.body, cta: c.cta, hashtags: c.hashtags, firstComment: c.firstComment, altText: c.altText, syntheticMedia: assets.length > 0 },
      assetIds: assets.map((a) => a.assetId),
    });
    setBusy(null);
    if (res.error || !res.url) return fail(res.error ?? "The draft couldn't be created.");
    router.push(res.url);
  };

  const makeImage = async (c: Concept) => {
    setBusy(`${c.id}:image`);
    const prompt = [c.hook, c.body].filter(Boolean).join(" ").slice(0, 1_200);
    const res = await generateImage({ workspaceId, prompt, aspect: "square", count: 1, altText: c.altText });
    setBusy(null);
    if (res.error || !res.images?.length) return fail(res.error ?? "No image came back.");
    setImages((m) => ({ ...m, [c.id]: [...(m[c.id] ?? []), ...res.images!] }));
    toast.add({ title: "Image added to the library. It's marked AI-generated.", type: "success" });
  };

  const save = async (name: string) => {
    const res = await saveBrief({ workspaceId, name, brief: cleanBrief(brief) });
    if (res.error) return fail(res.error);
    toast.add({ title: res.ok ?? "Brief saved.", type: "success" });
    router.refresh();
  };

  return { brief, set, setBrief, concepts, adSets, notes, images, busy, ran, run, regenerate, edit, copy, use, makeImage, save };
}

export type GeneratorApi = ReturnType<typeof useGenerator>;
