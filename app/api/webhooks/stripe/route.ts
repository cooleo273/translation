import { createServiceSupabaseClient } from "@/lib/supabase/admin";
import { getStripe, planNameFromPriceId } from "@/lib/stripe/server";
import { sendPaymentSuccessEmail } from "@/lib/email/resend";
import type Stripe from "stripe";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function mapStripeStatus(
  s: Stripe.Subscription.Status,
): "active" | "canceled" | "past_due" | "trialing" {
  switch (s) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "canceled":
    case "unpaid":
    case "incomplete_expired":
      return "canceled";
    default:
      return "past_due";
  }
}

async function upsertSubscriptionFromStripe(sub: Stripe.Subscription) {
  const admin = createServiceSupabaseClient();
  const userId =
    sub.metadata?.user_id ??
    (typeof sub.metadata?.userId === "string" ? sub.metadata.userId : null);
  if (!userId) {
    const priceId = sub.items.data[0]?.price?.id;
    console.warn("[stripe] subscription without user metadata", sub.id, priceId);
    return;
  }

  const priceId = sub.items.data[0]?.price?.id;
  const planFromPrice = priceId ? planNameFromPriceId(priceId) : null;
  const planFromMeta = sub.metadata?.plan_name as "pro" | "business" | undefined;
  const planName =
    planFromMeta === "pro" || planFromMeta === "business"
      ? planFromMeta
      : planFromPrice ?? "pro";

  const status = mapStripeStatus(sub.status);
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer?.id;

  const cpe = (sub as unknown as { current_period_end?: number })
    .current_period_end;
  const endIso = cpe ? new Date(cpe * 1000).toISOString() : null;

  const { error } = await admin.from("subscriptions").upsert(
    {
      user_id: userId,
      plan_name: planName,
      status,
      stripe_customer_id: customerId ?? null,
      stripe_subscription_id: sub.id,
      start_date: new Date(sub.created * 1000).toISOString(),
      end_date: endIso,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error("[stripe] upsert subscription", error);
  }
}

async function markSubscriptionCanceled(sub: Stripe.Subscription) {
  const admin = createServiceSupabaseClient();
  const userId = sub.metadata?.user_id;
  if (!userId) return;

  await admin
    .from("subscriptions")
    .update({
      status: "canceled",
      plan_name: "free",
      stripe_subscription_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
}

export async function POST(request: Request) {
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!whSecret) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const body = await request.text();
  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, sig, whSecret);
  } catch (e) {
    console.error("[stripe webhook]", e);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  const admin = createServiceSupabaseClient();

  const { data: seen } = await admin
    .from("stripe_events")
    .select("id")
    .eq("id", event.id)
    .maybeSingle();
  if (seen) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  const { error: idemErr } = await admin
    .from("stripe_events")
    .insert({ id: event.id });
  if (idemErr) {
    console.error("[stripe_events]", idemErr);
    return NextResponse.json({ received: true });
  }

  const stripe = getStripe();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const subId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          await upsertSubscriptionFromStripe(sub);
          const email = session.customer_email ?? session.customer_details?.email;
          if (email) {
            await sendPaymentSuccessEmail(email, session.metadata?.plan_name ?? "pro");
          }
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const sub = event.data.object as Stripe.Subscription;
        await upsertSubscriptionFromStripe(sub);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await markSubscriptionCanceled(sub);
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.error("[stripe webhook handler]", e);
    return NextResponse.json({ error: "Handler failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
