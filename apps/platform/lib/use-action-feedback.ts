"use client";

import { useCallback, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@wizeworks/silicaui-react";

export type ActionState = { error?: string; ok?: string };

/**
 * Turns server-action results into toasts (design.md: toasts confirm transient
 * success; persistent failures stay inline). `run` refreshes the route after.
 *
 * `notify` MUST keep a stable identity. Callers put it in an effect's
 * dependency list — `useEffect(() => notify(state), [state, notify])` — and a
 * fresh function each render makes that effect run on every render. It is
 * harmless until a state carries a message: then notify() shows a toast, the
 * toast store re-renders, notify is new again, and the effect fires forever.
 * That is React error #185, and it killed the page on save (docs/bugs/B-010).
 *
 * The toast handle goes through a ref rather than a useCallback dependency,
 * so this stays stable even if the provider hands back a new object.
 */
export function useActionFeedback() {
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const router = useRouter();
  const [pending, start] = useTransition();

  const notify = useCallback((state: ActionState | undefined | null, opts: { silentOk?: boolean } = {}) => {
    if (!state) return;
    if (state.error) toastRef.current.add({ title: state.error, type: "error", timeout: 7000 });
    else if (state.ok && !opts.silentOk) toastRef.current.add({ title: state.ok, type: "success" });
  }, []);

  const run = useCallback(
    <T extends ActionState>(fn: () => Promise<T>, after?: (r: T) => void) =>
      start(async () => {
        const r = await fn();
        notify(r);
        after?.(r);
        router.refresh();
      }),
    [notify, router, start],
  );

  return { toast, notify, run, pending, router };
}
