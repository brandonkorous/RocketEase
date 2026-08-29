"use client";

import Link from "next/link";
import { brandPath } from "@/lib/brand/sections";
import type { BrandSummary } from "./types";

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A glance at the brand kit from the library; the kit itself lives under Brand. */
export function BrandKitPanel({ workspaceId, brand }: { workspaceId: string; brand: BrandSummary }) {
  const empty = !brand.logos && !brand.palette.length && !brand.fonts.length && !brand.assets;
  return (
    <section className="rounded-box border border-base-300 p-4" aria-labelledby="brand-h">
      <div className="flex items-center justify-between">
        <h2 id="brand-h" className="text-sm font-semibold">Brand kit</h2>
        <Link href={brandPath(workspaceId)} className="text-xs font-medium hover:underline">{empty ? "Set it up" : "View all"}</Link>
      </div>
      {empty ? (
        <p className="mt-3 text-sm leading-relaxed text-secondary">Logos, colours, fonts, and the brand assets creators should reach for first. Nothing has been added yet.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {brand.palette.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {brand.palette.map((hex) => (
                <li key={hex} className="h-6 w-6 rounded-field border border-base-300" style={{ backgroundColor: hex }} title={hex} />
              ))}
            </ul>
          )}
          <p className="text-sm leading-relaxed text-secondary">
            {[brand.logos ? count(brand.logos, "logo") : null, brand.fonts.length ? brand.fonts.join(" / ") : null, brand.assets ? count(brand.assets, "brand asset") : null].filter(Boolean).join(" · ")}
          </p>
        </div>
      )}
    </section>
  );
}
