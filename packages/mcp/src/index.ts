#!/usr/bin/env node
/*
 * Make It Social MCP server.
 *
 *   make-it-social-mcp             stdio (Claude Desktop, Claude Code)
 *   make-it-social-mcp --http      streamable HTTP on MIS_MCP_PORT (default 5010)
 *
 * Credentials come from the environment: MIS_API_KEY, MIS_API_URL.
 */
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { clientFromEnv } from "./client.js";
import { createServer } from "./server.js";

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

async function runHttp() {
  const port = Number(process.env.MIS_MCP_PORT ?? 5010);
  const server = createServer(clientFromEnv());
  // Stateless: one transport, no session ids — every request carries the API key's own context.
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  createHttpServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      if (!req.url?.startsWith("/mcp")) {
        res.writeHead(404).end();
        return;
      }
      await transport.handleRequest(req, res, await readBody(req));
    })();
  }).listen(port, () => console.error(`[make-it-social-mcp] streamable HTTP on :${port}/mcp`));
}

async function runStdio() {
  const server = createServer(clientFromEnv());
  await server.connect(new StdioServerTransport());
}

const main = process.argv.includes("--http") ? runHttp : runStdio;
main().catch((e: unknown) => {
  console.error("[make-it-social-mcp]", e instanceof Error ? e.message : e);
  process.exit(1);
});
