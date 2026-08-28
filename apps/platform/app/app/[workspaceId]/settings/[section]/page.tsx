import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppPage, PageHeader } from "@/components/page-frame";
import { requireWorkspace } from "@/lib/session";
import { SETTINGS_SECTIONS, workspacePath } from "@/lib/nav";
import { loadSection } from "./load";
import { SectionBody } from "./section-body";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ params }: { params: Promise<{ workspaceId: string; section: string }> }) {
  const { workspaceId, section } = await params;
  const current = SETTINGS_SECTIONS.find((s) => s.slug === section);
  if (!current) notFound();
  const ctx = await requireWorkspace(workspaceId);
  const data = await loadSection(section, ctx);

  return (
    <AppPage>
      <PageHeader title="Settings" description={ctx.workspace.name} />
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
