import type { Instrumentation } from "next";

/*
 * Next.js instrumentation hook: WizeLens traces each request to the marketing
 * site. On in development (dashboard at /_wizelens). In production only with
 * WIZELENS_ENABLED=true (deploy/k8s/base/web.yaml), and then SEND-ONLY to
 * WIZELENS_HUB. Node.js runtime only. A failure to start is logged and never
 * stops the site.
 */
// WIZELENS_ENABLED=true turns it on anywhere; =false turns it off in development too.
const FLAG = process.env.WIZELENS_ENABLED;
const WIZELENS = FLAG === "true" || (FLAG !== "false" && process.env.NODE_ENV === "development");

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !WIZELENS) return;
  try {
    const { registerWizeLens } = await import("@wizeworks/lens-node/next");
    registerWizeLens({ serviceName: "rocketease-web", enabled: true });
  } catch (err) {
    console.warn("[wizelens] tracing did not start", err);
  }
}

export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !WIZELENS) return;
  try {
    const { onRequestError } = await import("@wizeworks/lens-node/next");
    onRequestError(...args);
  } catch {
    // Tracing is optional: the error is still Next's to report.
  }
};
