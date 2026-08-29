"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BRAND_SECTIONS, brandPath } from "@/lib/brand/sections";

const cls = (active: boolean) => `whitespace-nowrap rounded-field px-3 py-2 text-sm ${active ? "bg-base-200 font-semibold" : "text-secondary hover:bg-base-200"}`;

export function BrandSectionNav({ workspaceId }: { workspaceId: string }) {
  const pathname = usePathname();
  const overview = brandPath(workspaceId);
  return (
    <nav aria-label="Brand sections" className="flex flex-row gap-1 overflow-x-auto md:flex-col">
      <Link href={overview} aria-current={pathname === overview ? "page" : undefined} className={cls(pathname === overview)}>Overview</Link>
      {BRAND_SECTIONS.map((s) => {
        const href = brandPath(workspaceId, s.slug);
        const active = pathname === href;
        return (
          <Link key={s.slug} href={href} aria-current={active ? "page" : undefined} className={cls(active)}>{s.label}</Link>
        );
      })}
    </nav>
  );
}
