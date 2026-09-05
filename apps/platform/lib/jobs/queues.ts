/*
 * Queue registry: every background job name, its payload type, and queue
 * policy. Both the web process (enqueue) and the worker (handle) import this
 * so names and payloads can't drift.
 */
import type { Queue } from "pg-boss";
import type { TriggerKind as AutomationTrigger } from "@/db/schema/automations";

export type JobPayloads = {
  /** Relay pending outbox_event rows into their target queues. Singleton. */
  "outbox.relay": Record<string, never>;
  /** Send one transactional email. */
  "mail.send": { to: string; template: string; data: Record<string, unknown>; organizationId?: string; replyTo?: string };
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
  /** Erase every connection a provider identity owns, after a verified deauthorize / data-deletion callback. */
  "provider.deletion": { requestId: string };
  /** Nightly (or on-demand) recommendation + best-time pass; one workspace or all. */
  "recommendations.compute": { workspaceId?: string };
  /** Evaluate automation rules for one trigger event (lib/automations). */
  "automation.evaluate": { trigger: AutomationTrigger; refId: string };
  /** Resume an automation run whose approval gate was cleared. */
  "automation.apply": { runId: string };
  /** Pull one conversion-tracking source (GA4/Shopify) or recompute a webhook source's facts. */
  "tracking.sync": { sourceId: string; since?: string };
  /** Hourly evergreen recycling pass; one workspace/rule or all. */
  "recycle.tick": { workspaceId?: string; ruleId?: string };
  /** Nightly warning before a rights or authorisation clock lapses under a scheduled/promoted post. */
  "rights.expiring": Record<string, never>;
  /** Nightly + period-end: report AI credits above the included allowance to the Stripe meter. */
  "billing.report_usage": Record<string, never>;
  /** Submit one generation to a model vendor. A SPEND mutation — never retried blindly. */
  "media.generate": { mediaJobId: string };
  /** Advance running generations, and pull bytes the moment one completes. */
  "media.poll": { mediaJobId?: string };
  /**
   * The ffmpeg/sharp render queue: ad composites now, caption burn-in here,
   * assembly and loudness in 12.4. One queue because they share a worker, a
   * scratch disk and a CPU budget — and because a render is a render.
   */
  "media.render": MediaRenderPayload;
  /** Speech to text for one asset → a caption_track with word timings. */
  "media.transcribe": { assetId: string; language?: string; force?: boolean };
  /** Candidate cover frames for a video (Grid's cover picker), spaced across the clip. */
  "asset.frames": { assetId: string; count?: number };
};

export type MediaRenderPayload =
  | { kind: "ad_plan"; contentItemId: string; placement: string; variantId: string }
  | { kind: "caption_burn"; assetId: string; captionTrackId: string; placement: string }
  | { kind: "assembly"; contentItemId: string; placement: string; variantId: string }
  /**
   * Voice-over onto an existing clip, with captions of it. Carries the script
   * rather than a reference to one, so the job is replayable from its own row.
   */
  | { kind: "voiceover"; assetId: string; userId: string; script: string; voiceId?: string; captions: boolean };

export type JobName = keyof JobPayloads;

/**
 * Which worker process owns a queue. `media` work is CPU-bound ffmpeg and long
 * vendor polls; it must not share a process with inbox.sync ticking every two
 * minutes. The role lives here rather than in a WORKER_QUEUES env list so a new
 * queue cannot be forgotten by one of the two processes and silently dropped.
 */
export const WORKER_ROLES = ["general", "media"] as const;
export type WorkerRole = (typeof WORKER_ROLES)[number];

export type QueuePolicy = Omit<Queue, "name"> & { role?: WorkerRole };

const STANDARD: Omit<Queue, "name"> = { retryLimit: 5, retryDelay: 5, retryBackoff: true, expireInSeconds: 600 };

export const QUEUES: Record<JobName, QueuePolicy> = {
  "outbox.relay": { policy: "singleton", retryLimit: 3, retryDelay: 2, expireInSeconds: 120 },
  "mail.send": { ...STANDARD, retryLimit: 8, retryDelayMax: 900 },
  // Publishing must never blindly retry: the worker decides after reconciliation.
  "publish.execute": { policy: "stately", retryLimit: 0, expireInSeconds: 900 },
  "channel.sync": { policy: "singleton", retryLimit: 3, retryDelay: 30, retryBackoff: true, expireInSeconds: 1800 },
  "webhook.process": { ...STANDARD, retryLimit: 6 },
  "insights.ingest": { policy: "singleton", retryLimit: 3, retryDelay: 60, retryBackoff: true, expireInSeconds: 1800 },
  "report.run": { ...STANDARD, retryLimit: 2, expireInSeconds: 1800 },
  // ffmpeg runs here now (probe + poster frame), so this belongs to the media worker.
  "asset.process": { ...STANDARD, retryLimit: 3, expireInSeconds: 900, role: "media" },
  // Unique on (asset, offset), so a retry writes nothing twice.
  "asset.frames": { ...STANDARD, retryLimit: 2, expireInSeconds: 600, role: "media" },
  "inbox.sync": { policy: "singleton", retryLimit: 2, retryDelay: 30, retryBackoff: true, expireInSeconds: 600 },
  // Replies reconcile before any retry; the handler decides whether a retry is safe.
  "inbox.reply": { policy: "stately", retryLimit: 4, retryDelay: 20, retryBackoff: true, expireInSeconds: 300 },
  "quality.check": { policy: "singleton", retryLimit: 1, retryDelay: 300, expireInSeconds: 1800 },
  "publication.reconcile": { policy: "singleton", retryLimit: 1, retryDelay: 600, expireInSeconds: 3600 },
  "connection.refresh": { policy: "singleton", retryLimit: 2, retryDelay: 300, retryBackoff: true, expireInSeconds: 1800 },
  "ads.sync": { policy: "singleton", retryLimit: 3, retryDelay: 60, retryBackoff: true, expireInSeconds: 1800 },
  // Spend mutations reconcile before any retry; the handler decides whether a retry is safe.
  "promotion.execute": { policy: "stately", retryLimit: 3, retryDelay: 30, retryBackoff: true, expireInSeconds: 600 },
  // Idempotent by design: a second run finds nothing live and completes cleanly.
  "provider.deletion": { ...STANDARD, retryLimit: 6, retryDelay: 30, retryBackoff: true, expireInSeconds: 900 },
  "recommendations.compute": { policy: "singleton", retryLimit: 1, retryDelay: 300, expireInSeconds: 1800 },
  "automation.evaluate": { ...STANDARD, retryLimit: 3, expireInSeconds: 300 },
  "automation.apply": { ...STANDARD, retryLimit: 3, expireInSeconds: 300 },
  "tracking.sync": { policy: "singleton", retryLimit: 3, retryDelay: 60, retryBackoff: true, expireInSeconds: 1800 },
  // One run per (rule, occurrence) is enforced in the database, so a retry is always safe.
  "recycle.tick": { policy: "singleton", retryLimit: 2, retryDelay: 120, retryBackoff: true, expireInSeconds: 1800 },
  "rights.expiring": { policy: "singleton", retryLimit: 1, retryDelay: 300, expireInSeconds: 1800 },
  // Reporting is idempotent (billing_usage_report holds the running total), so a retry cannot double-charge.
  "billing.report_usage": { policy: "singleton", retryLimit: 2, retryDelay: 300, retryBackoff: true, expireInSeconds: 1800 },
  // A spend mutation: the handler decides after reconciliation, exactly like
  // publish.execute. A blind retry re-spends real money.
  "media.generate": { policy: "stately", retryLimit: 0, expireInSeconds: 900, role: "media" },
  // Races the vendor's URL expiry (Sora: ~1 hour), so it polls tightly.
  "media.poll": { policy: "singleton", retryLimit: 3, retryDelay: 15, retryBackoff: true, expireInSeconds: 900, role: "media" },
  // Compositing spends CPU, not money, and is deterministic: the same plan makes
  // the same file, so a retry is always safe. `stately` keeps one render per
  // (item, placement, variant) in flight rather than racing itself.
  "media.render": { policy: "stately", retryLimit: 3, retryDelay: 10, retryBackoff: true, expireInSeconds: 600, role: "media" },
  // Spends money, but pennies per clip, and the result lands in OUR caption_track
  // — so the handler reconciles against that row before calling a vendor again,
  // which makes an ordinary retry safe without a stately queue.
  "media.transcribe": { ...STANDARD, retryLimit: 3, expireInSeconds: 1800, role: "media" },
};

export const JOB_NAMES = Object.keys(QUEUES) as JobName[];

/** A queue with no explicit role belongs to the general worker. */
export const roleOf = (name: JobName): WorkerRole => QUEUES[name].role ?? "general";

export const queuesForRole = (role: WorkerRole): JobName[] => JOB_NAMES.filter((n) => roleOf(n) === role);
