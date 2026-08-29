#!/usr/bin/env node
/*
 * Stops this repo's dev processes: the web and platform Next servers and the
 * worker. Matching is by command line containing THIS repo's path, so another
 * checkout — or another project's dev server — is never touched.
 *
 *   pnpm dev:kill          stop the apps
 *   pnpm dev:kill --all    also `docker compose down` (Postgres, MinIO, Mailpit)
 *   pnpm dev:kill --dry    list what would be stopped, kill nothing
 */
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NEEDLE = ROOT.toLowerCase();
const PORTS = [5000, 5001];
const args = new Set(process.argv.slice(2));
const dry = args.has("--dry");

const run = (cmd, argv) => {
  try {
    return execFileSync(cmd, argv, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
};

/** Every node process in this repo, as { pid, cmd }. */
function candidates() {
  if (process.platform !== "win32") {
    return run("ps", ["-eo", "pid=,command="])
      .split("\n")
      .map((l) => l.trim().match(/^(\d+)\s+(.*)$/))
      .filter(Boolean)
      .map((m) => ({ pid: Number(m[1]), cmd: m[2] }));
  }
  const raw = run("powershell.exe", [
    "-NoProfile",
    "-Command",
    "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress",
  ]);
  if (!raw.trim()) return [];
  const parsed = JSON.parse(raw);
  return (Array.isArray(parsed) ? parsed : [parsed]).map((p) => ({ pid: p.ProcessId, cmd: p.CommandLine ?? "" }));
}

const mine = candidates().filter(
  (p) => p.cmd.toLowerCase().includes(NEEDLE) && p.pid !== process.pid && !p.cmd.includes("dev-kill"),
);

function kill(pid) {
  if (process.platform === "win32") run("taskkill", ["/PID", String(pid), "/T", "/F"]);
  else {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  }
}

const label = (cmd) => (cmd.length > 100 ? `${cmd.slice(0, 100)}…` : cmd);

if (!mine.length) console.log("No dev processes running for this repo.");
for (const p of mine) {
  console.log(`${dry ? "would stop" : "stopping"} ${p.pid}  ${label(p.cmd)}`);
  if (!dry) kill(p.pid);
}

if (args.has("--all")) {
  console.log(dry ? "would run: docker compose down" : "docker compose down");
  if (!dry) run("docker", ["compose", "down"]);
}

// The parent `pnpm dev` exits once its children do; report anything still bound.
if (!dry) {
  setTimeout(() => {
    const busy = PORTS.filter((port) =>
      process.platform === "win32"
        ? run("netstat", ["-ano"]).split("\n").some((l) => l.includes("LISTENING") && l.includes(`:${port} `))
        : run("lsof", ["-ti", `:${port}`]).trim().length > 0,
    );
    console.log(busy.length ? `Still listening: ${busy.join(", ")} — a process outside this repo owns them.` : "Ports 5000 and 5001 are free.");
  }, 700);
}
