/*
 * Tool surface. Every description states the human gate plainly: this server
 * can draft, submit, and read — it cannot publish, spend, or send.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MisApiError, type MisClient } from "./client.js";

const text = (data: unknown) => ({ content: [{ type: "text" as const, text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] });

/** Errors come back as tool errors, not thrown: the model should read and react to them. */
async function call(fn: () => Promise<unknown>) {
  try {
    return text(await fn());
  } catch (e) {
    const msg = e instanceof MisApiError ? `${e.code}: ${e.message}` : e instanceof Error ? e.message : String(e);
    return { ...text(msg), isError: true };
  }
}

export function registerTools(server: McpServer, client: MisClient) {
  server.registerTool(
    "get_capabilities",
    {
      title: "Get capabilities",
      description:
        "What this API key may do in this workspace, and the gates that always apply: drafts are not published, approvals are decided by people, replies are sent by people. Call this first when unsure whether an action is permitted.",
      inputSchema: {},
    },
    async () => call(() => client.request({ path: "/workspace" })),
  );

  server.registerTool(
    "list_channels",
    {
      title: "List channels",
      description:
        "Connected accounts in this workspace with their live capabilities and health. Use the returned ids as channelIds when creating a draft; a capability marked unsupported carries the network's own reason.",
      inputSchema: { includeDisconnected: z.boolean().optional().describe("Include revoked and disconnected channels.") },
    },
    async ({ includeDisconnected }) => call(() => client.request({ path: "/channels", query: { include: includeDisconnected ? "all" : undefined } })),
  );

  server.registerTool(
    "create_draft",
    {
      title: "Create draft",
      description:
        "Creates a draft post with one variant per channel. It creates a draft only — a person approves and publishes it. Returns the item plus per-channel validation problems, which you should fix before submitting. `scheduledAt` records the intended time; it does not schedule anything.",
      inputSchema: {
        text: z.string().max(10_000).describe("The post copy, shared by every channel."),
        channelIds: z.array(z.string()).min(1).max(20).describe("Channel ids from list_channels."),
        title: z.string().max(200).optional().describe("Internal title shown in the calendar."),
        link: z.string().url().optional(),
        scheduledAt: z.string().optional().describe("ISO 8601 time the author wants; applied when a person approves."),
        assetIds: z.array(z.string()).max(35).optional().describe("Ids of media already in the workspace library."),
        idempotencyKey: z.string().max(200).optional().describe("Reuse to retry safely: the same key returns the same draft."),
      },
    },
    async ({ idempotencyKey, ...body }) => call(() => client.request({ method: "POST", path: "/drafts", body, idempotencyKey })),
  );

  server.registerTool(
    "submit_for_approval",
    {
      title: "Submit for approval",
      description:
        "Hands a draft to the people who decide. Where a policy applies (or the post is already in review) this opens an approval request and a person approves it; the requested time is applied on approval. Where no policy applies, a key scoped to schedule may set the time directly. Nothing reaches a network before a person acts.",
      inputSchema: {
        itemId: z.string().describe("Item id from create_draft."),
        scheduledAt: z.string().optional().describe("ISO 8601 time to publish once approved."),
        assigneeUserId: z.string().optional().describe("Ask one person to review, rather than the policy's approvers."),
        note: z.string().max(1000).optional().describe("Context for the reviewer."),
      },
    },
    async ({ itemId, ...body }) => call(() => client.request({ method: "POST", path: `/drafts/${encodeURIComponent(itemId)}/submit`, body })),
  );

  server.registerTool(
    "get_item_status",
    {
      title: "Get item status",
      description:
        "State of one post and its publish receipt per destination: what was validated, what was sent, what the network confirmed, and whether an ambiguous response was reconciled before any retry.",
      inputSchema: { itemId: z.string() },
    },
    async ({ itemId }) => call(() => client.request({ path: `/items/${encodeURIComponent(itemId)}` })),
  );

  server.registerTool(
    "list_conversations",
    {
      title: "List conversations",
      description: "Inbox threads — comments, mentions, messages and reviews — with status, priority and whether a first response is overdue.",
      inputSchema: {
        status: z.enum(["open", "snoozed", "resolved", "all"]).optional(),
        tab: z.enum(["all", "unread", "mentions", "dms", "comments"]).optional(),
        channelId: z.string().optional(),
        q: z.string().optional().describe("Search preview text and contact names."),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async (query) => call(() => client.request({ path: "/conversations", query })),
  );

  server.registerTool(
    "draft_reply",
    {
      title: "Draft a reply",
      description:
        "Writes a proposed reply into a conversation as a draft. It is not sent: it appears in the Inbox thread with a Send button, and a person presses it. Nothing is queued and no network is called.",
      inputSchema: {
        conversationId: z.string(),
        text: z.string().min(1).max(5000),
        idempotencyKey: z.string().max(200).optional().describe("Reuse to retry safely: the same key returns the same draft."),
      },
    },
    async ({ conversationId, text: body, idempotencyKey }) =>
      call(() => client.request({ method: "POST", path: `/conversations/${encodeURIComponent(conversationId)}/reply-draft`, body: { text: body }, idempotencyKey })),
  );

  server.registerTool(
    "get_metrics",
    {
      title: "Get metrics",
      description:
        "Metric values with their definition version, formula, caveats and dated definition changes. A metric that cannot be shown comes back with `unavailable` explaining why and a null value — never 0. Read the caveats before comparing anything across networks or dates.",
      inputSchema: {
        metric: z.string().optional().describe("Comma-separated keys, e.g. reach,engagement,conversions. Defaults to the scorecard."),
        from: z.string().optional().describe("YYYY-MM-DD, workspace timezone."),
        to: z.string().optional().describe("YYYY-MM-DD, workspace timezone."),
        scope: z.enum(["all", "organic", "paid"]).optional(),
        channelId: z.string().optional(),
      },
    },
    async (query) => call(() => client.request({ path: "/metrics", query })),
  );
}
