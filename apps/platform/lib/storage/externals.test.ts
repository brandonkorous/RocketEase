import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

/*
 * Production-only failure, so it is asserted here rather than left to review.
 *
 * `generateBlobSASQueryParameters` authorises by
 * `credential instanceof StorageSharedKeyCredential`. Bundled, webpack emitted
 * two copies of @azure/storage-blob, so a credential built by one copy failed
 * the other's check and every upload died with "Invalid sharedKeyCredential,
 * userDelegationKey or accountName" — with valid credentials in the environment.
 * Local dev uses the S3/MinIO driver, so nothing catches this before deploy.
 */
describe("storage externals", () => {
  it("keeps the Azure SDK out of the bundle so there is one class identity", () => {
    expect(nextConfig.serverExternalPackages ?? []).toContain("@azure/storage-blob");
  });
});
