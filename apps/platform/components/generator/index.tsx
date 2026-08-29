"use client";

import Link from "next/link";
import { buttonClasses } from "@wizeworks/silicaui-react/server";
import { workspacePath } from "@/lib/nav";
import { AppPage, PageHeader } from "../page-frame";
import { AdPanel } from "./ad-panel";
import { BriefForm } from "./brief-form";
import { ConceptCard } from "./concept-card";
import type { GeneratorProps } from "./types";
import { useGenerator } from "./use-generator";

export type { GeneratorProps, GeneratorChannel, SavedBriefView } from "./types";

/**
 * Generate: a brief on the left, concepts on the right. Everything produced
 * here is a draft — the only way out of this screen is "Use in Create", which
 * makes an ordinary draft a person still edits, approves, and sends.
 */
export function GeneratorScreen({ workspaceId, channels, savedBriefs, imagesEnabled }: GeneratorProps) {
  const api = useGenerator(workspaceId, channels);
  const byChannel = channels.map((c) => ({ channel: c, concepts: api.concepts.filter((x) => x.channelId === c.id) })).filter((g) => g.concepts.length > 0);

  return (
    <AppPage>
      <PageHeader
        title="Generate"
        description="Describe the post you want. You get concepts to edit, not posts to publish."
        actions={<Link href={workspacePath(workspaceId, "create")} className={buttonClasses({ color: "neutral", variant: "outline" })}>Open Create</Link>}
      />
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] xl:items-start">
        <BriefForm api={api} channels={channels} savedBriefs={savedBriefs} />
        <div className="flex flex-col gap-5">
          {api.notes.length > 0 && (
            <ul className="flex flex-col gap-1.5" aria-label="Generation notes">
              {api.notes.map((n, i) => (<li key={i} className="rounded-field bg-warning/10 px-3 py-2 text-xs text-warning">{n}</li>))}
            </ul>
          )}
          {byChannel.length === 0 ? (
            <Placeholder ran={api.ran} running={api.busy === "run"} />
          ) : (
            byChannel.map(({ channel, concepts }) => (
              <section key={channel.id} className="flex flex-col gap-3" aria-label={`Concepts for ${channel.name}`}>
                <h2 className="text-base font-semibold">{channel.networkLabel} · {channel.name}</h2>
                <div className="grid gap-4 2xl:grid-cols-2">
                  {concepts.map((c) => (<ConceptCard key={c.id} api={api} concept={c} channel={channel} imagesEnabled={imagesEnabled} />))}
                </div>
              </section>
            ))
          )}
          <AdPanel adSets={api.adSets} />
        </div>
      </div>
    </AppPage>
  );
}

function Placeholder({ ran, running }: { ran: boolean; running: boolean }) {
  const title = running ? "Generating…" : ran ? "Nothing came back for these channels" : "Concepts appear here";
  const body = running
    ? "Each channel is drafted against its own limits, so this takes a few seconds."
    : ran
      ? "Try a different angle in the brief, or add a key point so there is more to work from."
      : "Fill in the brief and press Generate. Every concept is checked against the real limits of the channel it is written for.";
  return (
    <div className="rounded-box border border-dashed border-base-300 px-6 py-16 text-center">
      <p className="text-base font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-110 text-sm text-secondary">{body}</p>
    </div>
  );
}
