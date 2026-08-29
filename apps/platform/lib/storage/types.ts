/** The contract both storage drivers implement. Keys are opaque object paths. */
export type UploadTicket = {
  url: string;
  /** Sent verbatim by the browser on the PUT. Azure requires x-ms-blob-type here. */
  headers: Record<string, string>;
  maxBytes: number;
};

export type ObjectHead = { bytes: number; contentType: string };

export type StorageDriver = {
  presignUpload(key: string, contentType: string, maxBytes: number): Promise<UploadTicket>;
  presignGet(key: string, expiresIn: number, fileName?: string): Promise<string>;
  headObject(key: string): Promise<ObjectHead | null>;
  getObjectBuffer(key: string): Promise<Buffer>;
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  deleteObject(key: string): Promise<void>;
  /** Throws when the container/bucket is unreachable or credentials are rejected. */
  reachable(): Promise<void>;
  /** Dev convenience only; production containers are provisioned by Terraform. */
  ensureContainer(): Promise<void>;
};

export function env(name: string, fallback?: string) {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`${name} is not set`);
  return v;
}

/** A filename is never trusted into a header; quotes would terminate it early. */
export function contentDisposition(fileName?: string) {
  return fileName ? `inline; filename="${fileName.replace(/"/g, "")}"` : undefined;
}
