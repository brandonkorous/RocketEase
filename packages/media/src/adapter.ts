/*
 * The adapter contract.
 *
 * `start` / `poll` / `fetch` is the honest shape for every vendor: a synchronous
 * one implements `start` as "do it now" and `poll` as "already done", and the
 * caller never branches on which kind it got.
 *
 * `reconcile` is not optional. Generation spends money, so an ambiguous result
 * is resolved against the vendor's own record of the job BEFORE anything is
 * retried — the identical rule publish.execute and promotion.execute follow.
 */
import type { ModelDescriptor } from "./io";
import type { CostEstimate, GenerationSpec, MediaJobHandle, MediaJobState, RawOutput } from "./types";
import type { Transcript, TranscribeRequest } from "./transcribe";

export type WebhookRequest = { headers: Record<string, string>; body: string };

export interface MediaAdapter {
  readonly key: string;

  /**
   * True when `start` does the whole job, so a caller may run it inline and
   * hand back the result. Everything else must go through the queue: an
   * adapter that keeps job state in memory cannot be started in one process
   * and polled from another.
   */
  readonly synchronous?: boolean;

  /** Descriptors this adapter can actually serve in this deployment. */
  models(): ModelDescriptor[];

  /** True when keys and configuration are present. Never throws. */
  configured(): boolean;

  estimate(model: ModelDescriptor, spec: GenerationSpec): CostEstimate;

  /**
   * Submit. The idempotency key is the caller's and must be passed to the
   * vendor wherever it supports one — it is how `reconcile` finds the job again.
   */
  start(model: ModelDescriptor, spec: GenerationSpec, idempotencyKey: string): Promise<MediaJobHandle>;

  poll(handle: MediaJobHandle): Promise<MediaJobState>;

  /** Bytes, before any delivery URL expires. */
  fetch(state: MediaJobState): Promise<RawOutput[]>;

  /**
   * Find a job we may have started but lost the answer to. Returns null only
   * when the vendor confirms no such job exists — never on a lookup failure,
   * which must throw so the caller does not re-spend on a false negative.
   */
  reconcile(idempotencyKey: string): Promise<MediaJobState | null>;

  /**
   * Optional: speech to text. A different shape from generation because the
   * input is bytes that already exist and the output is structure, not bytes.
   * An image vendor has no business pretending to do this.
   */
  transcribe?(req: TranscribeRequest): Promise<Transcript>;

  /** Optional: vendors that call back instead of being polled. */
  parseWebhook?(req: WebhookRequest): MediaJobState | null;

  /** Optional: stop work we are still being billed for. */
  cancel?(handle: MediaJobHandle): Promise<void>;
}

export type AdapterRegistry = Map<string, MediaAdapter>;

/** Availability probe for routing: configured adapters only. */
export const availabilityFrom = (registry: AdapterRegistry) => (adapter: string) => registry.get(adapter)?.configured() ?? false;
