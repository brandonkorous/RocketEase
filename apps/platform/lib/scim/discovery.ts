import { SCIM_MAX_PAGE, SCIM_SCHEMA, scimBaseUrl } from "./constants";

const supported = (supported: boolean) => ({ supported });

/** RFC 7643 §5 — what this provisioning endpoint actually implements. */
export function serviceProviderConfig(base: string) {
  return {
    schemas: [SCIM_SCHEMA.serviceProviderConfig],
    documentationUri: `${base}/Schemas`,
    patch: supported(true),
    bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter: { supported: true, maxResults: SCIM_MAX_PAGE },
    changePassword: supported(false),
    sort: supported(false),
    etag: supported(false),
    authenticationSchemes: [
      {
        type: "oauthbearertoken",
        name: "OAuth Bearer Token",
        description: "Per-organization provisioning token issued in Settings → Single sign-on.",
        primary: true,
      },
    ],
    meta: { resourceType: "ServiceProviderConfig", location: `${base}/ServiceProviderConfig` },
  };
}

function resourceType(base: string, name: "User" | "Group", schema: string) {
  return {
    schemas: [SCIM_SCHEMA.resourceType],
    id: name,
    name,
    endpoint: `/${name}s`,
    description: `Make It Social ${name}`,
    schema,
    meta: { resourceType: "ResourceType", location: `${base}/ResourceTypes/${name}` },
  };
}

export function resourceTypes(base: string) {
  return [resourceType(base, "User", SCIM_SCHEMA.user), resourceType(base, "Group", SCIM_SCHEMA.group)];
}

function attr(name: string, type: string, extra: Record<string, unknown> = {}) {
  return { name, type, multiValued: false, required: false, caseExact: false, mutability: "readWrite", returned: "default", uniqueness: "none", ...extra };
}

/** The attributes an IdP may map. Anything outside this list is ignored on write. */
export function schemas() {
  return [
    {
      id: SCIM_SCHEMA.user,
      name: "User",
      description: "Provisioned member of an organization",
      attributes: [
        attr("userName", "string", { required: true, uniqueness: "server" }),
        attr("externalId", "string"),
        attr("displayName", "string"),
        attr("name", "complex", {
          subAttributes: [attr("formatted", "string"), attr("givenName", "string"), attr("familyName", "string")],
        }),
        attr("emails", "complex", {
          multiValued: true,
          subAttributes: [attr("value", "string"), attr("type", "string"), attr("primary", "boolean")],
        }),
        attr("active", "boolean"),
      ],
    },
    {
      id: SCIM_SCHEMA.group,
      name: "Group",
      description: 'Workspace role preset, named "mis:<workspaceSlug>:<role>"',
      attributes: [
        attr("displayName", "string", { required: true, uniqueness: "server" }),
        attr("members", "complex", {
          multiValued: true,
          subAttributes: [attr("value", "string"), attr("display", "string", { mutability: "readOnly" })],
        }),
      ],
    },
  ];
}

export const discoveryBase = (appUrl: string) => scimBaseUrl(appUrl);
