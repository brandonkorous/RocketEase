/*
 * Queue registry: every background job name, its payload type, and queue
 * policy. Both the web process (enqueue) and the worker (handle) import this
 * so names and payloads can't drift.
 */
import type { Queue } from "pg-boss";

export type JobPayloads = {
  /** Relay pending outbox_event rows into their target queues. Singleton. */
  "outbox.relay": Record<string, never>;
  /** Send one transactional email. */
  "mail.send": { to: string; template: string; data: Record<string, unknown>; organizationId?: string };
  "publish.execute": { publishJobId: string };
  "channel.sync": { channelId: string; reason: "initial" | "scheduled" | "reconnect" };
  "webhook.process": { receiptId: string };
  "insights.ingest": { channelId: string; since?: string };
  "report.run": { reportRunId: string };
  /** Renditions, checksum, scan after an upload completes. */
  "asset.process": { assetId: string };
  /** Poll a channel for new inbox items (comments/mentions/DMs). */
  "inbox.sync": { channelId: string; reason: "initial" | "scheduled" | "manual" | "webhook" };
  /** Deliver one outbound message; reconciles ambiguous sends before retrying. */
  "inbox.reply": { messageId: string };
};

export type JobName = keyof JobPayloads;

const STANDARD: Omit<Queue, "name"> = { retryLimit: 5, retryDelay: 5, retryBackoff: true, expireInSeconds: 600 };

export const QUEUES: Record<JobName, Omit<Queue, "name">> = {
  "outbox.relay": { policy: "singleton", retryLimit: 3, retryDelay: 2, expireInSeconds: 120 },
  "mail.send": { ...STANDARD, retryLimit: 8, retryDelayMax: 900 },
  // Publishing must never blindly retry: the worker decides after reconciliation.
  "publish.execute": { policy: "stately", retryLimit: 0, expireInSeconds: 900 },
  "channel.sync": { policy: "singleton", retryLimit: 3, retryDelay: 30, retryBackoff: true, expireInSeconds: 1800 },
  "webhook.process": { ...STANDARD, retryLimit: 6 },
  "insights.ingest": { policy: "singleton", retryLimit: 3, retryDelay: 60, retryBackoff: true, expireInSeconds: 1800 },
  "report.run": { ...STANDARD, retryLimit: 2, expireInSeconds: 1800 },
  "asset.process": { ...STANDARD, retryLimit: 3, expireInSeconds: 900 },
  "inbox.sync": { policy: "singleton", retryLimit: 2, retryDelay: 30, retryBackoff: true, expireInSeconds: 600 },
  // Replies reconcile before any retry; the handler decides whether a retry is safe.
  "inbox.reply": { policy: "stately", retryLimit: 4, retryDelay: 20, retryBackoff: true, expireInSeconds: 300 },
};

export const JOB_NAMES = Object.keys(QUEUES) as JobName[];
