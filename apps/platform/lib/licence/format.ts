/*
 * The licence key: `RE1.<payload>.<signature>` — a base64url JSON payload signed
 * with Ed25519. Checking it needs only the PUBLIC key, so an install never
 * calls RocketEase to find out what it may do. The private key never enters
 * this repository; scripts/licence.ts signs with it on an operator's machine.
 */
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, type KeyObject } from "node:crypto";
import { z } from "zod";

export const LICENCE_PREFIX = "RE1";
export const LICENCE_CHANNELS = ["stable", "edge"] as const;

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "an ISO date");

export const licencePayloadSchema = z.object({
  v: z.literal(1),
  /** Key id, shown on the billing page so support can find the record. */
  id: z.string().min(1).max(64),
  licensee: z.string().trim().min(1).max(120),
  issuedAt: isoDate,
  expiresAt: isoDate,
  /** null = unlimited. */
  workspaces: z.number().int().positive().nullable(),
  /** Beta features the licence includes (lib/features/policy.ts names). Unknown names are ignored, never trusted. */
  features: z.array(z.string().max(64)).max(32).default([]),
  channel: z.enum(LICENCE_CHANNELS).default("stable"),
});
export type LicencePayload = z.infer<typeof licencePayloadSchema>;
export type LicenceInput = z.input<typeof licencePayloadSchema>;

const b64url = (buf: Buffer) => buf.toString("base64url");

/** Keys as base64 DER (SPKI public, PKCS#8 private), which is what the env and the CLI carry. */
export function generateLicenceKeyPair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKey: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
    privateKey: privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"),
  };
}

export const publicKeyFrom = (b64: string) => createPublicKey({ key: Buffer.from(b64, "base64"), type: "spki", format: "der" });
export const privateKeyFrom = (b64: string) => createPrivateKey({ key: Buffer.from(b64, "base64"), type: "pkcs8", format: "der" });

export function signLicence(input: LicenceInput, privateKey: KeyObject | string): string {
  const body = b64url(Buffer.from(JSON.stringify(licencePayloadSchema.parse(input))));
  const key = typeof privateKey === "string" ? privateKeyFrom(privateKey) : privateKey;
  const sig = sign(null, Buffer.from(`${LICENCE_PREFIX}.${body}`), key);
  return `${LICENCE_PREFIX}.${body}.${b64url(sig)}`;
}

export type LicenceFailure = "malformed" | "unsupported" | "bad_signature" | "no_public_key";
export type LicenceCheck = { ok: true; payload: LicencePayload } | { ok: false; reason: LicenceFailure };

/** Signature first, then the payload: nothing unsigned is ever parsed as a licence. */
export function verifyLicence(key: string, publicKey: KeyObject | string | null): LicenceCheck {
  const parts = key.trim().split(".");
  if (parts.length !== 3 || !parts[1] || !parts[2]) return { ok: false, reason: "malformed" };
  if (parts[0] !== LICENCE_PREFIX) return { ok: false, reason: "unsupported" };
  if (!publicKey) return { ok: false, reason: "no_public_key" };
  let pub: KeyObject;
  try {
    pub = typeof publicKey === "string" ? publicKeyFrom(publicKey) : publicKey;
  } catch {
    return { ok: false, reason: "no_public_key" };
  }
  let valid = false;
  try {
    valid = verify(null, Buffer.from(`${parts[0]}.${parts[1]}`), pub, Buffer.from(parts[2], "base64url"));
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, reason: "bad_signature" };
  try {
    const parsed = licencePayloadSchema.safeParse(JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")));
    return parsed.success ? { ok: true, payload: parsed.data } : { ok: false, reason: "malformed" };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}
