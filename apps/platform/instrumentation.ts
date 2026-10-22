import type { Instrumentation } from "next";

/*
 * Next.js instrumentation hook: boots OpenTelemetry (no-op without
 * OTEL_EXPORTER_OTLP_ENDPOINT), then WizeLens.
 *
 * WizeLens traces each request with Next's render, route and fetch spans inside
 * it. On in development (dashboard at /_wizelens). In production only with
 * WIZELENS_ENABLED=true (deploy/k8s/base/platform.yaml), and then SEND-ONLY to
 * WIZELENS_HUB. A failure to start is logged and never stops the app.
 */
// WIZELENS_ENABLED=true turns it on anywhere; =false turns it off in development too.
const FLAG = process.env.WIZELENS_ENABLED;
const WIZELENS = FLAG === "true" || (FLAG !== "false" && process.env.NODE_ENV === "development");

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startOtel } = await import("./lib/otel");
  await startOtel("rke-platform");
  if (!WIZELENS) return;
  try {
    const { registerWizeLens, nextIgnore } = await import("@wizeworks/lens-node/next");
    // Probes hit /api/health/* every few seconds; they are not traffic.
    const ignore = (path: string) => nextIgnore(path) || path.startsWith("/api/health");
    registerWizeLens({ serviceName: "rocketease-platform", enabled: true, ignore });
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
