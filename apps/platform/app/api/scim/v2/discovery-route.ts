import { authenticateScim } from "@/lib/scim/auth";
import { SCIM_SCHEMA, scimBaseUrl } from "@/lib/scim/constants";
import { scimHandler, scimJson } from "@/lib/scim/errors";

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:5001";

/** Discovery endpoints are read-only and identical for every organization,
 *  but still require a valid provisioning token (RFC 7644 §2 allows either). */
export function discoveryRoute(build: (base: string) => unknown, asList = false) {
  return (req: Request) =>
    scimHandler(async () => {
      await authenticateScim(req);
      const body = build(scimBaseUrl(appUrl()));
      if (!asList) return scimJson(body);
      const resources = body as unknown[];
      return scimJson({
        schemas: [SCIM_SCHEMA.listResponse],
        totalResults: resources.length,
        startIndex: 1,
        itemsPerPage: resources.length,
        Resources: resources,
      });
    });
}
