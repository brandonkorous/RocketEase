"use client";

import { ToastProvider } from "@wizeworks/silicaui-react";

/** Client-side providers for the whole app. Toasts render bottom-right, above the dock on mobile. */
export function AppProviders({ children }: { children: React.ReactNode }) {
  return <ToastProvider timeout={5000}>{children}</ToastProvider>;
}
