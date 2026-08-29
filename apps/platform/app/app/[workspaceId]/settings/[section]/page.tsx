import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppPage, PageHeader } from "@/components/page-frame";
import { QueryToast } from "@/components/query-toast";
import { requireWorkspace } from "@/lib/session";
import { SETTINGS_SECTIONS, workspacePath } from "@/lib/nav";
import { brandPath } from "@/lib/brand/sections";
import { loadSection } from "./load";
import { SectionBody } from "./section-body";

export const metadata: Metadata = { title: "Settings" };

const OK_MESSAGES: Record<string, string> = {
  connected: "Conversion source connected. The first import is running; numbers appear once it finishes.",
  subscribed: "Subscription started. It can take a moment for Stripe to confirm the first payment.",
};
const CONNECTED = OK_MESSAGES.connected;

export default async function SettingsPage({ params, searchParams }: { params: Promise<{ workspaceId: string; section: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ workspaceId, section }, sp] = await Promise.all([params, searchParams]);
  // Brand grew out of Settings into its own first-level area; old links still work.
  if (section === "brand") redirect(brandPath(workspaceId));
  const current = SETTINGS_SECTIONS.find((s) => s.slug === section);
  if (!current) notFound();
  const ctx = await requireWorkspace(workspaceId);
  const data = await loadSection(section, ctx);

  return (
    <AppPage>
      <PageHeader title="Settings" description={ctx.workspace.name} />
      <QueryToast ok={sp.ok ? (OK_MESSAGES[String(sp.ok)] ?? CONNECTED) : null} error={typeof sp.error === "string" ? sp.error : null} />
      <div className="mt-8 grid gap-8 md:grid-cols-[220px_1fr]">
        <nav aria-label="Settings sections" className="flex flex-row gap-1 overflow-x-auto md:flex-col">
          {SETTINGS_SECTIONS.map((s) => (
            <Link key={s.slug} href={workspacePath(workspaceId, `settings/${s.slug}`)} aria-current={s.slug === section ? "page" : undefined} className={`whitespace-nowrap rounded-field px-3 py-2 text-sm ${s.slug === section ? "bg-base-200 font-semibold" : "text-secondary hover:bg-base-200"}`}>
              {s.label}
            </Link>
          ))}
        </nav>
        <section aria-labelledby="section-title" className="min-w-0">
          <h2 id="section-title" className="text-xl font-bold tracking-tight">{current.label}</h2>
          <SectionBody section={section} label={current.label} ctx={ctx} data={data} />
        </section>
      </div>
    </AppPage>
  );
}
