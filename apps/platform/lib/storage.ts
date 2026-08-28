/*
 * Object storage behind an S3 API. MinIO locally; Azure Blob (via the sparx
 * gateway) in production. Every object key is prefixed by org/workspace so a
 * key can never be guessed across tenants, and all access is via signed URLs.
 */
import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomBytes } from "node:crypto";

function env(name: string, fallback?: string) {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`${name} is not set`);
  return v;
}

const g = globalThis as unknown as { __misS3?: S3Client; __misS3Public?: S3Client };

function client(publicEndpoint = false): S3Client {
  const key = publicEndpoint ? "__misS3Public" : "__misS3";
  if (!g[key]) {
    g[key] = new S3Client({
      region: env("STORAGE_REGION", "us-east-1"),
      endpoint: publicEndpoint ? env("STORAGE_PUBLIC_ENDPOINT", process.env.STORAGE_ENDPOINT) : env("STORAGE_ENDPOINT"),
      forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE === "1",
      credentials: { accessKeyId: env("STORAGE_ACCESS_KEY"), secretAccessKey: env("STORAGE_SECRET_KEY") },
    });
  }
  return g[key]!;
}

export const bucket = () => env("STORAGE_BUCKET");

export function newObjectKey(organizationId: string, workspaceId: string, kind: "original" | "rendition", fileName: string) {
  const ext = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".")).toLowerCase().replace(/[^.a-z0-9]/g, "") : "";
  return `org/${organizationId}/ws/${workspaceId}/${kind}/${new Date().toISOString().slice(0, 10)}/${randomBytes(16).toString("hex")}${ext}`;
}

/** Browser uploads PUT directly to storage with this URL (10 min). */
export async function presignUpload(key: string, contentType: string, maxBytes: number) {
  const url = await getSignedUrl(client(true), new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType, ContentLength: undefined }), { expiresIn: 600 });
  return { url, headers: { "Content-Type": contentType }, maxBytes };
}

/** Read URL for previews and for providers pulling media (default 1h). */
export async function presignGet(key: string, expiresIn = 3600, fileName?: string) {
  return getSignedUrl(
    client(true),
    new GetObjectCommand({ Bucket: bucket(), Key: key, ResponseContentDisposition: fileName ? `inline; filename="${fileName.replace(/"/g, "")}"` : undefined }),
    { expiresIn },
  );
}

export async function headObject(key: string) {
  try {
    const r = await client().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return { bytes: r.ContentLength ?? 0, contentType: r.ContentType ?? "application/octet-stream" };
  } catch {
    return null;
  }
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  const r = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  const bytes = await r.Body!.transformToByteArray();
  return Buffer.from(bytes);
}

export async function putObject(key: string, body: Buffer, contentType: string) {
  await client().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }));
}

export async function deleteObject(key: string) {
  await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key })).catch(() => undefined);
}

/** Health probe: throws when the bucket is unreachable or credentials are rejected. */
export async function storageReachable() {
  await client().send(new HeadBucketCommand({ Bucket: bucket() }));
}
