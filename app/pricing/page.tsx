import Link from "next/link";

const plans = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    cadence: "forever",
    features: [
      "5 files per day",
      "10MB max file size",
      "Documents, audio, images, spreadsheets",
      "No video processing",
    ],
    cta: "Get started",
    href: "/signup",
    highlight: false,
  },
  {
    id: "pro",
    name: "Pro",
    price: "$19",
    cadence: "/ month",
    features: [
      "100 files per day",
      "100MB max file size",
      "Video + full multimodal pipeline",
      "Cloud storage & dashboard",
    ],
    cta: "Upgrade to Pro",
    href: "/login?next=/pricing",
    highlight: true,
  },
  {
    id: "business",
    name: "Business",
    price: "$49",
    cadence: "/ month",
    features: [
      "Unlimited daily files",
      "Priority background processing",
      "REST API access & API keys",
      "Same 100MB per-file cap",
    ],
    cta: "Go Business",
    href: "/login?next=/pricing",
    highlight: false,
  },
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Simple pricing
        </h1>
        <p className="mt-3 text-muted-foreground">
          Choose a plan that matches your volume. Upgrade or cancel anytime.
        </p>
      </div>

      <div className="mt-12 grid gap-6 lg:grid-cols-3">
        {plans.map((p) => (
          <div
            key={p.id}
            className={`relative flex flex-col rounded-2xl border p-6 shadow-sm transition ${
              p.highlight
                ? "border-foreground/25 bg-muted/50 ring-2 ring-foreground/10"
                : "border-border bg-card"
            }`}
          >
            {p.highlight && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-foreground px-3 py-0.5 text-xs font-semibold text-background">
                Most popular
              </span>
            )}
            <h2 className="text-lg font-semibold text-foreground">{p.name}</h2>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-4xl font-bold text-foreground">{p.price}</span>
              <span className="text-sm text-muted-foreground">{p.cadence}</span>
            </div>
            <ul className="mt-6 flex-1 space-y-2 text-sm text-muted-foreground">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400">✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Link
              href={p.href}
              className={`mt-8 block rounded-xl px-4 py-3 text-center text-sm font-semibold transition ${
                p.highlight
                  ? "bg-foreground text-background hover:opacity-90"
                  : "border border-border text-foreground hover:bg-muted"
              }`}
            >
              {p.cta}
            </Link>
          </div>
        ))}
      </div>

      <p className="mt-10 text-center text-xs text-muted-foreground">
        Prices shown are placeholders — connect Stripe products in production.{" "}
        <Link href="/dashboard/billing" className="underline">
          Billing dashboard
        </Link>
      </p>
    </div>
  );
}
