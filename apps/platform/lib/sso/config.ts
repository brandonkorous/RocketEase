import { z } from "zod";

/** One connection form covers both protocols; the protocol picks the branch. */
export const ssoFormSchema = z.object({
  workspaceId: z.string().min(1),
  providerId: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*$/, "Use lowercase letters, numbers and dashes"),
  protocol: z.enum(["oidc", "saml"]),
  /** One or more email domains, comma separated. */
  domain: z.string().trim().min(3).max(400),
  issuer: z.string().trim().url("Enter the issuer URL"),
  clientId: z.string().trim().max(400).optional(),
  clientSecret: z.string().max(2000).optional(),
  discoveryEndpoint: z.string().trim().max(500).optional(),
  entryPoint: z.string().trim().max(500).optional(),
  idpEntityId: z.string().trim().max(500).optional(),
  cert: z.string().trim().max(20_000).optional(),
  spEntityId: z.string().trim().max(500).optional(),
});

export type SsoFormInput = z.infer<typeof ssoFormSchema>;

const DOMAIN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/** "@Acme.com, sub.acme.com" → "acme.com,sub.acme.com". Throws on anything else. */
export function normalizeDomains(value: string): string {
  const parts = value
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
  if (!parts.length) throw new Error("Enter at least one email domain.");
  for (const d of parts) if (!DOMAIN.test(d)) throw new Error(`"${d}" isn't a valid email domain.`);
  return [...new Set(parts)].join(",");
}

type OidcConfig = { clientId: string; clientSecret?: string; discoveryEndpoint?: string; pkce: true; scopes: string[] };

function oidcConfig(input: SsoFormInput): OidcConfig {
  if (!input.clientId) throw new Error("Enter the client ID from your identity provider.");
  return {
    clientId: input.clientId,
    ...(input.clientSecret ? { clientSecret: input.clientSecret } : {}),
    ...(input.discoveryEndpoint ? { discoveryEndpoint: input.discoveryEndpoint } : {}),
    pkce: true,
    scopes: ["openid", "email", "profile"],
  };
}

function samlConfig(input: SsoFormInput, appUrl: string) {
  if (!input.entryPoint) throw new Error("Enter the IdP sign-on URL (entry point).");
  if (!input.cert) throw new Error("Paste the IdP signing certificate.");
  return {
    entryPoint: input.entryPoint,
    cert: input.cert,
    idpMetadata: { entityID: input.idpEntityId || input.issuer, cert: input.cert },
    spMetadata: { entityID: input.spEntityId || appUrl },
    wantAssertionsSigned: true,
    identifierFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
  };
}

/** Body for POST /sso/register. Secrets pass straight through; nothing is logged. */
export function buildRegisterBody(input: SsoFormInput, organizationId: string, appUrl: string) {
  return {
    providerId: input.providerId,
    issuer: input.issuer,
    domain: normalizeDomains(input.domain),
    organizationId,
    ...(input.protocol === "oidc" ? { oidcConfig: oidcConfig(input) } : { samlConfig: samlConfig(input, appUrl) }),
  };
}

/**
 * Body for POST /sso/update-provider. A blank client secret means "keep the
 * stored one" — the form never echoes a secret back, so it can't resubmit it.
 */
export function buildUpdateBody(input: SsoFormInput, appUrl: string) {
  const base = { providerId: input.providerId, issuer: input.issuer, domain: normalizeDomains(input.domain) };
  if (input.protocol === "saml") return { ...base, samlConfig: samlConfig(input, appUrl) };
  const cfg = oidcConfig(input);
  if (!input.clientSecret) delete (cfg as { clientSecret?: string }).clientSecret;
  return { ...base, oidcConfig: cfg };
}
