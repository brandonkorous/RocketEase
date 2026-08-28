"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@wizeworks/silicaui-react";

export type ActionState = { error?: string; ok?: string };

/**
 * Turns server-action results into toasts (design.md: toasts confirm transient
 * success; persistent failures stay inline). `run` refreshes the route after.
 */
export function useActionFeedback() {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();

  const notify = (state: ActionState | undefined | null, opts: { silentOk?: boolean } = {}) => {
    if (!state) return;
    if (state.error) toast.add({ title: state.error, type: "error", timeout: 7000 });
    else if (state.ok && !opts.silentOk) toast.add({ title: state.ok, type: "success" });
  };

  const run = <T extends ActionState>(fn: () => Promise<T>, after?: (r: T) => void) =>
    start(async () => {
      const r = await fn();
      notify(r);
      after?.(r);
      router.refresh();
    });

  return { toast, notify, run, pending, router };
}
