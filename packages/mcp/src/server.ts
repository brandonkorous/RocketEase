import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MisClient } from "./client.js";
import { registerTools } from "./tools.js";

export const SERVER_INFO = { name: "make-it-social", version: "0.1.0" };

const INSTRUCTIONS = `Make It Social is the publishing layer under you: it holds the connected accounts, the approval policy, the audit trail and the publish receipts.

You can draft posts, submit them for approval, read the inbox, draft replies and read metrics. You cannot publish, send a reply, or spend money — a person does that, in the app. Treat every "draft" as a proposal awaiting a human.

When a metric comes back with an \`unavailable\` reason, say what is missing. Never report an unavailable metric as zero.`;

export function createServer(client: MisClient): McpServer {
  const server = new McpServer(SERVER_INFO, { instructions: INSTRUCTIONS });
  registerTools(server, client);
  return server;
}
