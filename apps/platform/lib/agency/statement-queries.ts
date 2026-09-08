/*
 * Reads for the Statements block (M14.10): the agency's Stripe connection and
 * each client's statement for the month. Worker-safe.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { agencyBillingAccount, clientStatement, type AgencyBillingAccount, type ClientStatement } from "@/db/schema/agency";

/** The connected account, or null while nothing is connected. */
export async function billingAccountFor(organizationId: string): Promise<AgencyBillingAccount | null> {
  const row = await db.query.agencyBillingAccount.findFirst({ where: (a, { and, eq }) => and(eq(a.organizationId, organizationId), eq(a.status, "connected")) });
  return row ?? null;
}

/** The statement that counts for a client and month: the newest one that is not void. */
export async function statementsFor(organizationId: string, workspaceIds: string[], period: string): Promise<Map<string, ClientStatement>> {
  if (!workspaceIds.length) return new Map();
  const rows = await db.select().from(clientStatement).where(and(eq(clientStatement.organizationId, organizationId), inArray(clientStatement.workspaceId, workspaceIds), eq(clientStatement.period, period))).orderBy(clientStatement.createdAt);
  const out = new Map<string, ClientStatement>();
  for (const r of rows) if (r.status !== "void" || !out.has(r.workspaceId)) out.set(r.workspaceId, r);
  return out;
}

export const statementByInvoice = async (stripeInvoiceId: string): Promise<ClientStatement | null> => (await db.query.clientStatement.findFirst({ where: (s, { eq }) => eq(s.stripeInvoiceId, stripeInvoiceId) })) ?? null;
