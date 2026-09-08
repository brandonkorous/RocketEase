import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { applyConnectEvent, type StatementRef, type StatementStore } from "./statement-webhook";

const ref: StatementRef = { id: "st1", organizationId: "org1", workspaceId: "ws1", status: "sent", accountId: "acct_agency" };
const event = (type: string, invoice: Partial<Stripe.Invoice>, account: string | undefined = "acct_agency") => ({ id: "evt_1", type, account, created: 1_757_000_000, data: { object: { id: "in_1", status: "paid", hosted_invoice_url: "https://pay.example/in_1", number: "A-0001", ...invoice } } }) as unknown as Stripe.Event;

function fakeStore(found: StatementRef | null = ref) {
  const store: StatementStore & { calls: unknown[] } = {
    calls: [],
    byInvoice: vi.fn(async () => found),
    setStatus: vi.fn(async (...args: unknown[]) => { store.calls.push(["setStatus", ...args]); }),
    record: vi.fn(async (...args: unknown[]) => { store.calls.push(["record", ...args]); }),
  };
  return store;
}

describe("applyConnectEvent", () => {
  it("marks the statement paid from invoice.paid on the organization's own account", async () => {
    const store = fakeStore();
    expect(await applyConnectEvent(event("invoice.paid", { status: "paid" }), store)).toEqual({ applied: true, status: "paid" });
    expect(store.calls[0]).toEqual(["setStatus", "st1", "paid", { hostedInvoiceUrl: "https://pay.example/in_1", number: "A-0001", paidAt: new Date(1_757_000_000 * 1000), voidedAt: null }]);
    expect(store.calls[1]).toEqual(["record", "agency.statement.paid", "org1", "ws1", { type: "client_statement", id: "st1" }, { status: "paid", invoice: "in_1" }]);
  });

  it("voids from invoice.voided and ignores an event whose account is not the organization's", async () => {
    const store = fakeStore();
    expect(await applyConnectEvent(event("invoice.voided", { status: "void" }), store)).toEqual({ applied: true, status: "void" });
    const other = fakeStore();
    expect(await applyConnectEvent(event("invoice.paid", { status: "paid" }, "acct_someone_else"), other)).toMatchObject({ applied: false, reason: expect.stringMatching(/account/) });
    expect(other.calls).toEqual([]);
  });

  it("ignores unknown invoices and event types it does not handle", async () => {
    expect(await applyConnectEvent(event("invoice.paid", { status: "paid" }), fakeStore(null))).toMatchObject({ applied: false, reason: expect.stringMatching(/no statement/) });
    expect(await applyConnectEvent(event("customer.created", {}), fakeStore())).toMatchObject({ applied: false, reason: "not a statement event" });
  });
});
