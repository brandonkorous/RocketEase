/*
 * Stripe webhook. Verifies the signature, then applies the event exactly once
 * (lib/billing/webhook.ts). Public in middleware: Stripe signs the request,
 * it never carries a session cookie.
 */
import { NextResponse } from "next/server";
import { log } from "@/lib/log";
import { billingConfigured, stripe } from "@/lib/billing/stripe";
import { handleStripeEvent } from "@/lib/billing/webhook";
import { effects, store } from "@/lib/billing/webhook-live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!billingConfigured() || !secret) return new NextResponse("billing not configured", { status: 503 });
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new NextResponse("missing signature", { status: 400 });

  const rawBody = await req.text();
  let event;
  try {
    event = await stripe().webhooks.constructEventAsync(rawBody, signature, secret);
  } catch {
    return new NextResponse("bad signature", { status: 400 });
  }

  try {
    const result = await handleStripeEvent(event, store, effects);
    return NextResponse.json({ received: true, ...result });
  } catch (err) {
    // A 500 asks Stripe to redeliver; the claim row keeps that redelivery safe.
    log.error("stripe webhook failed", { type: event.type, id: event.id, err });
    return new NextResponse("handler failed", { status: 500 });
  }
}
