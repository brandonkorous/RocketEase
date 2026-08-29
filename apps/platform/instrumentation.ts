/** Next.js instrumentation hook: boots OpenTelemetry for the web process (no-op without OTEL_EXPORTER_OTLP_ENDPOINT). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startOtel } = await import("./lib/otel");
  await startOtel("rke-platform");
}
