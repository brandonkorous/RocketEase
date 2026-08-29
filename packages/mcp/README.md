# @rocketease/mcp

Model Context Protocol server for RocketEase — **the trusted publishing layer under any AI agent**.

An agent can plan, draft, and read through this server. It cannot publish, send a reply, or spend
money. Every write goes through the same gates as the app: capability checks, the workspace's
approval policy, idempotency, and the audit log. A draft is a proposal; a person decides.

## What it exposes

| Tool | What it does | Human gate |
| --- | --- | --- |
| `get_capabilities` | What the key may do, and the gates that always apply | — |
| `list_channels` | Connected accounts + live capabilities and health | — |
| `create_draft` | Creates a draft post with a variant per channel | Creates a draft; a person approves and publishes |
| `submit_for_approval` | Opens an approval request (or schedules where no policy applies) | A person decides; the requested time is applied on approval |
| `get_item_status` | State + publish receipt per destination | — |
| `list_conversations` | Inbox threads with status, priority, overdue flag | — |
| `draft_reply` | Writes a proposed reply into the thread | Stays a draft; a person presses Send in the Inbox |
| `get_metrics` | Values with definition version, caveats, availability reasons | — |

An unavailable metric comes back with a reason and a `null` value. It is never reported as `0`.

## Setup

1. In RocketEase: **Settings → API keys → New API key**. Name it after the agent, tick only the
   scopes it needs, and copy the key — it is shown once.
2. Install and build (from the repo root):

   ```bash
   pnpm install
   pnpm --filter @rocketease/mcp build
   ```

3. Point your client at it.

### Claude Desktop

`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "rocketease": {
      "command": "node",
      "args": ["/absolute/path/to/rocketease/packages/mcp/dist/index.js"],
      "env": {
        "RKE_API_KEY": "rke_…",
        "RKE_API_URL": "https://app.rocketease.example/api/v1"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add rocketease \
  --env RKE_API_KEY=rke_… \
  --env RKE_API_URL=https://app.rocketease.example/api/v1 \
  -- node /absolute/path/to/rocketease/packages/mcp/dist/index.js
```

### Streamable HTTP

```bash
RKE_API_KEY=rke_… RKE_API_URL=https://app.rocketease.example/api/v1 \
  node packages/mcp/dist/index.js --http     # POST/GET http://localhost:5010/mcp
```

`RKE_MCP_PORT` overrides the port. The server is stateless: it holds one API key and one workspace,
so give each workspace its own server entry rather than sharing one.

## Environment

| Variable | Required | Default |
| --- | --- | --- |
| `RKE_API_KEY` | yes | — |
| `RKE_API_URL` | no | `http://localhost:5001/api/v1` |
| `RKE_MCP_PORT` | no | `5010` |

## Notes

- The key is workspace-scoped and acts as the person who created it. If their role changes or they
  are deprovisioned, the key narrows or stops working on the next request.
- `create_draft` and `draft_reply` accept an `idempotencyKey`: retrying with the same value returns
  the same draft instead of making a second one.
- The REST API this wraps is documented in [`docs/api.md`](../../docs/api.md).
