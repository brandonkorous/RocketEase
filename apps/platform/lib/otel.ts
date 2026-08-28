/*
 * OpenTelemetry bootstrap shared by the Next app (instrumentation.ts) and the
 * worker (worker/env.ts). No-op unless OTEL_EXPORTER_OTLP_ENDPOINT is set, so
 * local dev and CI pay nothing. Attributes carry tenant ids only, never tokens.
 */
import { trace, SpanStatusCode, type Attributes } from "@opentelemetry/api";

const g = globalThis as unknown as { __misOtel?: Promise<void> };

export function otelEnabled() {
  return Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT);
}

/** Start the SDK once per process. Safe to call repeatedly. */
export function startOtel(serviceName: string): Promise<void> {
  if (!otelEnabled()) return Promise.resolve();
  if (!g.__misOtel) g.__misOtel = boot(serviceName);
  return g.__misOtel;
}

async function boot(serviceName: string) {
  const [{ NodeSDK }, { OTLPTraceExporter }, { resourceFromAttributes }, { HttpInstrumentation }, { PgInstrumentation }] = await Promise.all([
    import("@opentelemetry/sdk-node"),
    import("@opentelemetry/exporter-trace-otlp-http"),
    import("@opentelemetry/resources"),
    import("@opentelemetry/instrumentation-http"),
    import("@opentelemetry/instrumentation-pg"),
  ]);
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT!.replace(/\/$/, "");
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({ "service.name": process.env.OTEL_SERVICE_NAME ?? serviceName, "deployment.environment": process.env.NODE_ENV ?? "development" }),
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    instrumentations: [new HttpInstrumentation({ ignoreIncomingRequestHook: (req) => (req.url ?? "").startsWith("/api/health") }), new PgInstrumentation()],
  });
  sdk.start();
  const stop = () => void sdk.shutdown().catch(() => {});
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}

/** Run `fn` inside a span; records the error and rethrows. Cheap when OTel is off (no-op tracer). */
export async function withSpan<T>(name: string, attributes: Attributes, fn: () => Promise<T>): Promise<T> {
  return trace.getTracer("make-it-social").startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await fn();
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
      throw err;
    } finally {
      span.end();
    }
  });
}
