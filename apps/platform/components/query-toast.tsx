"use client";

import { useEffect, useRef } from "react";
import { useToast } from "@wizeworks/silicaui-react";

/** Fires one toast on mount for a server-derived message (e.g. after an OAuth redirect). */
export function QueryToast({ ok, error }: { ok?: string | null; error?: string | null }) {
  const toast = useToast();
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    if (error) toast.add({ title: error, type: "error", timeout: 8000 });
    else if (ok) toast.add({ title: ok, type: "success" });
  }, [ok, error, toast]);
  return null;
}
