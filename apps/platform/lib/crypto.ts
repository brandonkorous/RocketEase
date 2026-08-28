/*
 * Secret boundary for provider tokens (architecture.md "Security").
 *
 * AES-256-GCM with a master key from TOKEN_MASTER_KEY (base64, 32 bytes).
 * Envelopes carry a keyId so the master key can rotate: new writes use the
 * current key, reads pick the key by id. In production the master key comes
 * from Key Vault via the sparx Terraform; swapping to KMS-wrapped data keys
 * only changes this file.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { SecretEnvelope } from "@/db/schema/connections";

type KeyRing = { current: string; keys: Record<string, Buffer> };

let ring: KeyRing | null = null;
function keyring(): KeyRing {
  if (ring) return ring;
  const current = process.env.TOKEN_MASTER_KEY;
  if (!current) throw new Error("TOKEN_MASTER_KEY is not set");
  const keys: Record<string, Buffer> = { v1: Buffer.from(current, "base64") };
  if (keys.v1.length !== 32) throw new Error("TOKEN_MASTER_KEY must be 32 bytes (base64)");
  // Optional previous key for rotation: TOKEN_MASTER_KEY_PREV=<id>:<base64>
  const prev = process.env.TOKEN_MASTER_KEY_PREV;
  if (prev) {
    const [id, b64] = prev.split(":");
    if (id && b64) keys[id] = Buffer.from(b64, "base64");
  }
  ring = { current: "v1", keys };
  return ring;
}

export function encryptSecret(plaintext: string, aad = ""): SecretEnvelope {
  const { current, keys } = keyring();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keys[current], iv);
  if (aad) cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { v: 1, keyId: current, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ct: ct.toString("base64") };
}

export function decryptSecret(env: SecretEnvelope, aad = ""): string {
  const { keys } = keyring();
  const key = keys[env.keyId];
  if (!key) throw new Error(`Unknown secret key id ${env.keyId}`);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(env.iv, "base64"));
  if (aad) decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(env.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(env.ct, "base64")), decipher.final()]).toString("utf8");
}

export const encryptJson = (value: unknown, aad?: string) => encryptSecret(JSON.stringify(value), aad);
export const decryptJson = <T>(env: SecretEnvelope, aad?: string) => JSON.parse(decryptSecret(env, aad)) as T;
