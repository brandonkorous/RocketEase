/*
 * Object storage. One API, two drivers: the S3 API (MinIO) in local dev and
 * Azure Blob in production — Azure has no S3-compatible endpoint, so the
 * production path is a real driver rather than a re-pointed endpoint.
 *
 * Every object key is prefixed by org/workspace so a key cannot be guessed
 * across tenants, and all access is via signed URLs.
 */
import { randomBytes } from "node:crypto";
import { azureDriver } from "./azure";
import { s3Driver } from "./s3";
import type { StorageDriver } from "./types";

export type { ObjectHead, UploadTicket } from "./types";

/**
 * Explicit, never inferred from which credentials happen to be present: a
 * half-configured environment should fail loudly on the driver it was told to
 * use, not silently fall back to the other one and write somewhere unexpected.
 */
function driver(): StorageDriver {
  const name = process.env.STORAGE_DRIVER ?? "s3";
  if (name === "azure") return azureDriver;
  if (name === "s3") return s3Driver;
  throw new Error(`STORAGE_DRIVER must be "s3" or "azure", got "${name}"`);
}

export function newObjectKey(organizationId: string, workspaceId: string, kind: "original" | "rendition", fileName: string) {
  const ext = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".")).toLowerCase().replace(/[^.a-z0-9]/g, "") : "";
  return `org/${organizationId}/ws/${workspaceId}/${kind}/${new Date().toISOString().slice(0, 10)}/${randomBytes(16).toString("hex")}${ext}`;
}

/** Browser uploads PUT directly to storage with this URL (10 min). */
export function presignUpload(key: string, contentType: string, maxBytes: number) {
  return driver().presignUpload(key, contentType, maxBytes);
}

/** Read URL for previews and for providers pulling media (default 1h). */
export function presignGet(key: string, expiresIn = 3600, fileName?: string) {
  return driver().presignGet(key, expiresIn, fileName);
}

export function headObject(key: string) {
  return driver().headObject(key);
}

export function getObjectBuffer(key: string): Promise<Buffer> {
  return driver().getObjectBuffer(key);
}

export function putObject(key: string, body: Buffer, contentType: string) {
  return driver().putObject(key, body, contentType);
}

export function deleteObject(key: string) {
  return driver().deleteObject(key);
}

/** Health probe: throws when the container is unreachable or credentials are rejected. */
export function storageReachable() {
  return driver().reachable();
}

/**
 * Creates the bucket/container if missing. Dev only (STORAGE_AUTO_CREATE_BUCKET=1):
 * production storage is provisioned by Terraform, and a deploy that silently
 * creates its own container hides a misconfigured one.
 */
export async function ensureStorage(): Promise<void> {
  if (process.env.STORAGE_AUTO_CREATE_BUCKET !== "1") return;
  await driver().ensureContainer();
}
