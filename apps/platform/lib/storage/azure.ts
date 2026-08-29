/*
 * Azure Blob driver — production on the sparx AKS cluster.
 *
 * The container is PRIVATE and anonymous access is never granted: every read and
 * write is a short-lived SAS URL the browser uses directly, so bytes never
 * transit the cluster. That makes the storage account's CORS rules load-bearing
 * (see rocketease.tf) — without a matching origin, uploads and downloads fail at
 * preflight with nothing reaching the app to log.
 */
import { BlobSASPermissions, BlobServiceClient, SASProtocol, StorageSharedKeyCredential, generateBlobSASQueryParameters } from "@azure/storage-blob";
import { contentDisposition, env, type ObjectHead, type StorageDriver, type UploadTicket } from "./types";

const g = globalThis as unknown as { __rkeAz?: { cred: StorageSharedKeyCredential; svc: BlobServiceClient } };

function azure() {
  if (!g.__rkeAz) {
    const account = env("AZURE_STORAGE_ACCOUNT");
    const cred = new StorageSharedKeyCredential(account, env("AZURE_STORAGE_KEY"));
    g.__rkeAz = { cred, svc: new BlobServiceClient(`https://${account}.blob.core.windows.net`, cred) };
  }
  return g.__rkeAz;
}

const containerName = () => env("AZURE_STORAGE_CONTAINER", "media");
const container = () => azure().svc.getContainerClient(containerName());
const blob = (key: string) => container().getBlockBlobClient(key);

/**
 * Signs one blob URL. `startsOn` is backdated five minutes because a SAS is
 * validated against Azure's clock, not ours, and a node running slightly ahead
 * otherwise mints tokens that are not yet valid.
 */
function sign(key: string, permissions: string, expiresIn: number, disposition?: string) {
  const { cred } = azure();
  const sas = generateBlobSASQueryParameters(
    {
      containerName: containerName(),
      blobName: key,
      permissions: BlobSASPermissions.parse(permissions),
      protocol: SASProtocol.Https,
      startsOn: new Date(Date.now() - 5 * 60_000),
      expiresOn: new Date(Date.now() + expiresIn * 1000),
      contentDisposition: disposition,
    },
    cred,
  );
  return `${blob(key).url}?${sas}`;
}

export const azureDriver: StorageDriver = {
  /**
   * `x-ms-blob-type` is REQUIRED by Azure on a direct PUT — without it the
   * request fails with a generic 400 that names nothing. It is returned here so
   * the browser sends it, and it must also appear in the account's CORS
   * allowed_headers, since a custom header makes the PUT preflighted.
   */
  async presignUpload(key, contentType, maxBytes): Promise<UploadTicket> {
    return {
      url: sign(key, "cw", 600),
      headers: { "Content-Type": contentType, "x-ms-blob-type": "BlockBlob" },
      maxBytes,
    };
  },

  async presignGet(key, expiresIn, fileName) {
    return sign(key, "r", expiresIn, contentDisposition(fileName));
  },

  async headObject(key): Promise<ObjectHead | null> {
    try {
      const p = await blob(key).getProperties();
      return { bytes: p.contentLength ?? 0, contentType: p.contentType ?? "application/octet-stream" };
    } catch {
      return null;
    }
  },

  async getObjectBuffer(key) {
    return blob(key).downloadToBuffer();
  },

  async putObject(key, body, contentType) {
    await blob(key).upload(body, body.length, { blobHTTPHeaders: { blobContentType: contentType } });
  },

  async deleteObject(key) {
    await blob(key).deleteIfExists().catch(() => undefined);
  },

  async reachable() {
    await container().getProperties();
  },

  /** Terraform owns the container in production; this is the dev-parity path. */
  async ensureContainer() {
    try {
      await container().createIfNotExists();
    } catch (err) {
      console.warn(`[storage] container ${containerName()} is missing and could not be created`, err);
    }
  },
};
