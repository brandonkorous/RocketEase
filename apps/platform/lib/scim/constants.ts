/** SCIM 2.0 (RFC 7643/7644) URNs and limits used by the provisioning API. */
export const SCIM_SCHEMA = {
  user: "urn:ietf:params:scim:schemas:core:2.0:User",
  group: "urn:ietf:params:scim:schemas:core:2.0:Group",
  serviceProviderConfig: "urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig",
  resourceType: "urn:ietf:params:scim:schemas:core:2.0:ResourceType",
  listResponse: "urn:ietf:params:scim:api:messages:2.0:ListResponse",
  error: "urn:ietf:params:scim:api:messages:2.0:Error",
  patchOp: "urn:ietf:params:scim:api:messages:2.0:PatchOp",
} as const;

export const SCIM_CONTENT_TYPE = "application/scim+json";
export const SCIM_BASE_PATH = "/api/scim/v2";
export const SCIM_MAX_PAGE = 200;
export const SCIM_DEFAULT_PAGE = 50;

/** Absolute base URL an IdP should be pointed at. */
export const scimBaseUrl = (appUrl: string) => `${appUrl.replace(/\/+$/, "")}${SCIM_BASE_PATH}`;
