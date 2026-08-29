"use client";

import { useState } from "react";
import { saveBrandSection } from "@/lib/actions/brand/save";
import type { BrandSection } from "@/lib/brand/schema";
import { useActionFeedback } from "@/lib/use-action-feedback";

/** One brand section's local edit state. Saving posts the whole section. */
export function useSectionForm<T extends object>(workspaceId: string, section: BrandSection, initial: T) {
  const { run, pending } = useActionFeedback();
  const [v, setV] = useState<T>(initial);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const set = (patch: Partial<T>) => setV((prev) => ({ ...prev, ...patch }));
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => saveBrandSection({ workspaceId, section, values: v }));
  };
  return { v, set, setV, dirty, save, pending };
}
