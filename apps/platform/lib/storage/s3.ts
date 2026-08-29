/*
 * S3 API driver — MinIO in local dev, and any S3-compatible bucket.
 * Azure Blob does NOT speak S3; production uses ./azure.ts instead.
 */
import { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { contentDisposition, env, type ObjectHead, type StorageDriver, type UploadTicket } from "./types";

const g = globalThis as unknown as { __rkeS3?: S3Client; __rkeS3Public?: S3Client };

/**
 * Two clients: the in-cluster endpoint for server-side calls, and the browser-
 * facing one that signs URLs a user's machine can actually resolve.
 */
function client(publicEndpoint = false): S3Client {
  const key = publicEndpoint ? "__rkeS3Public" : "__rkeS3";
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

const bucket = () => env("STORAGE_BUCKET");

export const s3Driver: StorageDriver = {
  async presignUpload(key, contentType, maxBytes): Promise<UploadTicket> {
    const cmd = new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType });
    const url = await getSignedUrl(client(true), cmd, { expiresIn: 600 });
    return { url, headers: { "Content-Type": contentType }, maxBytes };
  },

  async presignGet(key, expiresIn, fileName) {
    const cmd = new GetObjectCommand({ Bucket: bucket(), Key: key, ResponseContentDisposition: contentDisposition(fileName) });
    return getSignedUrl(client(true), cmd, { expiresIn });
  },

  async headObject(key): Promise<ObjectHead | null> {
    try {
      const r = await client().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
      return { bytes: r.ContentLength ?? 0, contentType: r.ContentType ?? "application/octet-stream" };
    } catch {
      return null;
    }
  },

  async getObjectBuffer(key) {
    const r = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
    return Buffer.from(await r.Body!.transformToByteArray());
  },

  async putObject(key, body, contentType) {
    await client().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }));
  },

  async deleteObject(key) {
    await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key })).catch(() => undefined);
  },

  async reachable() {
    await client().send(new HeadBucketCommand({ Bucket: bucket() }));
  },

  /**
   * Local dev only. A managed bucket in production is provisioned by
   * infrastructure, and the app's credentials there do not carry CreateBucket.
   */
  async ensureContainer() {
    const name = bucket();
    try {
      await client().send(new HeadBucketCommand({ Bucket: name }));
      return;
    } catch {
      /* missing, unreachable, or forbidden — try to create, then report honestly */
    }
    try {
      await client().send(new CreateBucketCommand({ Bucket: name }));
      console.info(`[storage] created bucket ${name}`);
    } catch (err) {
      console.warn(`[storage] bucket ${name} is missing and could not be created`, err);
    }
  },
};
