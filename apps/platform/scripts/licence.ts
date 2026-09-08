/*
 * Licence keys for self-hosted installs (docs/plans/m14.12-self-hosted.md).
 * Runs on an operator's machine; the private key never leaves it.
 *
 *   pnpm exec tsx scripts/licence.ts keygen
 *   pnpm exec tsx scripts/licence.ts sign --private-key-file ./licence.key --licensee "Northwind Agency" \
 *       --expires 2027-09-06 --workspaces 25 --features media.generation --channel stable --id nw-2026
 *   pnpm exec tsx scripts/licence.ts inspect <key> --public-key <base64>
 */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { generateLicenceKeyPair, signLicence, verifyLicence } from "../lib/licence/format";
import { licenceFrom } from "../lib/licence/state";

const [command, ...rest] = process.argv.slice(2);

function keygen() {
  const pair = generateLicenceKeyPair();
  console.log("PUBLIC key  (paste into lib/licence/public-key.ts, or LICENCE_PUBLIC_KEY for a local check):");
  console.log(pair.publicKey);
  console.log("\nPRIVATE key (keep out of every repository; --private-key-file for sign):");
  console.log(pair.privateKey);
}

function sign() {
  const { values } = parseArgs({
    args: rest,
    options: { "private-key-file": { type: "string" }, licensee: { type: "string" }, expires: { type: "string" }, workspaces: { type: "string" }, features: { type: "string" }, channel: { type: "string" }, id: { type: "string" } },
  });
  const file = values["private-key-file"];
  if (!file || !values.licensee || !values.expires) throw new Error("--private-key-file, --licensee and --expires are required");
  // A bare date means the END of that day (UTC), so "valid until Sep 6" holds in every time zone.
  const expiresAt = new Date(/^\d{4}-\d{2}-\d{2}$/.test(values.expires) ? `${values.expires}T23:59:59.999Z` : values.expires);
  if (Number.isNaN(expiresAt.getTime())) throw new Error("--expires must be a date");
  const key = signLicence(
    {
      v: 1,
      id: values.id ?? `${values.licensee.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24)}-${Date.now().toString(36)}`,
      licensee: values.licensee,
      issuedAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
      workspaces: values.workspaces === undefined || values.workspaces === "unlimited" ? null : Number.parseInt(values.workspaces, 10),
      features: (values.features ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      channel: values.channel === "edge" ? "edge" : "stable",
    },
    readFileSync(file, "utf8").trim(),
  );
  console.log(key);
}

function inspect() {
  const { values, positionals } = parseArgs({ args: rest, options: { "public-key": { type: "string" } }, allowPositionals: true });
  const key = positionals[0];
  if (!key) throw new Error("pass the key to inspect");
  const check = verifyLicence(key, values["public-key"] ?? process.env.LICENCE_PUBLIC_KEY ?? null);
  const state = licenceFrom(check, new Date());
  console.log(JSON.stringify({ check, state }, null, 2));
}

try {
  if (command === "keygen") keygen();
  else if (command === "sign") sign();
  else if (command === "inspect") inspect();
  else throw new Error("usage: licence.ts keygen | sign … | inspect <key>");
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
