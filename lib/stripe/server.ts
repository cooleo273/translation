import Stripe from "stripe";

let stripeSingleton: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeSingleton) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("Missing STRIPE_SECRET_KEY");
    }
    stripeSingleton = new Stripe(key);
  }
  return stripeSingleton;
}

export function planNameFromPriceId(priceId: string): "pro" | "business" | null {
  const pro = process.env.STRIPE_PRICE_PRO;
  const bus = process.env.STRIPE_PRICE_BUSINESS;
  if (priceId === pro) return "pro";
  if (priceId === bus) return "business";
  return null;
}
