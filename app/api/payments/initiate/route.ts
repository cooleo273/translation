import { requireUser } from "@/lib/controllers/require-user";
import { getStripe } from "@/lib/stripe/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
  plan: z.enum(["pro", "business"]),
});

export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Body must be { plan: \"pro\" | \"business\" }." },
      { status: 400 },
    );
  }

  const priceId =
    parsed.data.plan === "pro"
      ? process.env.STRIPE_PRICE_PRO
      : process.env.STRIPE_PRICE_BUSINESS;

  if (!priceId) {
    console.error("[payments/initiate] Missing STRIPE_PRICE_* env");
    return NextResponse.json(
      { error: "Payments are not configured." },
      { status: 503 },
    );
  }

  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base}/dashboard/billing?checkout=success`,
      cancel_url: `${base}/pricing?checkout=canceled`,
      client_reference_id: auth.user.id,
      metadata: {
        user_id: auth.user.id,
        plan_name: parsed.data.plan,
      },
      subscription_data: {
        metadata: {
          user_id: auth.user.id,
          plan_name: parsed.data.plan,
        },
      },
      customer_email: auth.user.email ?? undefined,
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Could not create checkout session." },
        { status: 500 },
      );
    }

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (e) {
    console.error("[payments/initiate]", e);
    return NextResponse.json(
      { error: "Payment initiation failed." },
      { status: 500 },
    );
  }
}
