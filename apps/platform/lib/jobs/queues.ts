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
  /** Daily data-quality sweep (5.7); one workspace or all. */
  "quality.check": { workspaceId?: string; organizationId?: string };
  /** Nightly remote_publication status reconciliation. */
  "publication.reconcile": { channelId?: string; limit?: number };
  /** Refresh provider credentials expiring within N days (default 7). */
  "connection.refresh": { connectionId?: string; withinDays?: number };
  /** Read-only import of an ad account's paid objects + daily paid facts (scope = paid). */
  "ads.sync": { adAccountId: string; since?: string };
  /** Create remote paid objects for a confirmed promotion; reconciles before any retry (CAM-002). */
  "promotion.execute": { promotionId: string };
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
  "quality.check": { policy: "singleton", retryLimit: 1, retryDelay: 300, expireInSeconds: 1800 },
  "publication.reconcile": { policy: "singleton", retryLimit: 1, retryDelay: 600, expireInSeconds: 3600 },
  "connection.refresh": { policy: "singleton", retryLimit: 2, retryDelay: 300, retryBackoff: true, expireInSeconds: 1800 },
  "ads.sync": { policy: "singleton", retryLimit: 3, retryDelay: 60, retryBackoff: true, expireInSeconds: 1800 },
  // Spend mutations reconcile before any retry; the handler decides whether a retry is safe.
  "promotion.execute": { policy: "stately", retryLimit: 3, retryDelay: 30, retryBackoff: true, expireInSeconds: 600 },
};

export const JOB_NAMES = Object.keys(QUEUES) as JobName[];
