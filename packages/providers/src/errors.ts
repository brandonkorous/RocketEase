/*
 * The shared error taxonomy every adapter maps onto (integrations.md "Publishing and replies").
 */

export type ErrorCategory = "permission" | "validation" | "rate_limit" | "temporary" | "deleted" | "policy" | "unknown";

export class ProviderError extends Error {
  readonly category: ErrorCategory;
  readonly retryable: boolean;
  readonly providerCode?: string;
  /** True when we cannot tell whether the side effect happened (timeouts, 5xx after send). */
  readonly ambiguous: boolean;
  readonly retryAfterSeconds?: number;
  constructor(
    message: string,
    opts: { category: ErrorCategory; retryable?: boolean; providerCode?: string; ambiguous?: boolean; retryAfterSeconds?: number; cause?: unknown },
  ) {
    super(message, { cause: opts.cause });
    this.name = "ProviderError";
    this.category = opts.category;
    this.retryable = opts.retryable ?? (opts.category === "temporary" || opts.category === "rate_limit");
    this.providerCode = opts.providerCode;
    this.ambiguous = opts.ambiguous ?? false;
    this.retryAfterSeconds = opts.retryAfterSeconds;
  }
}

/**
 * `instanceof` fails when the adapter registry (cached on globalThis) was built
 * by one compiled copy of this module and the caller holds another — Next's dev
 * server does exactly that across layers. The name is the stable identity.
 */
export function isProviderError(err: unknown): err is ProviderError {
  return err instanceof ProviderError || (err instanceof Error && err.name === "ProviderError" && "category" in err);
}
