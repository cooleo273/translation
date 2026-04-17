import { requireUser } from "@/lib/controllers/require-user";
import { getStripe } from "@/lib/stripe/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { data: sub, error } = await auth.supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (error || !sub?.stripe_customer_id) {
    return NextResponse.json(
      {
        error:
          "No Stripe customer on file. Subscribe to a paid plan from the pricing page first.",
      },
      { status: 400 },
    );
  }

  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

  try {
    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${base}/dashboard/billing`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("[billing portal]", e);
    return NextResponse.json(
      { error: "Could not open billing portal." },
      { status: 500 },
    );
  }
}
