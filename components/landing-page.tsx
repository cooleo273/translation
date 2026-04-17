import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

const features = [
  {
    title: "Documents & PDFs",
    description:
      "Extract and translate text from PDFs and office files with layout-aware pipelines.",
  },
  {
    title: "Audio & video",
    description:
      "Transcribe speech and translate subtitles so your media works in any language.",
  },
  {
    title: "Images & scans",
    description:
      "OCR reads text from photos and scans, then translates it in one flow.",
  },
  {
    title: "Spreadsheets",
    description:
      "Translate cell content while keeping structure for exports you can use immediately.",
  },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-card to-background">
      <SiteHeader />
      <main>
        <section className="relative overflow-hidden px-4 pb-20 pt-16 sm:px-6 sm:pb-28 sm:pt-24 lg:px-8">
          <div
            className="pointer-events-none absolute inset-0 -z-10 opacity-40 dark:opacity-30"
            aria-hidden
          >
            <div className="absolute left-1/2 top-0 h-[420px] w-[min(100%,720px)] -translate-x-1/2 rounded-full bg-gradient-to-br from-muted-foreground/15 via-transparent to-transparent blur-3xl" />
          </div>
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-medium text-muted-foreground">
              AI translation for real-world files
            </p>
            <h1 className="mt-4 text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl sm:leading-tight">
              Translate documents, media, and spreadsheets in one place
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg">
              Upload once — we detect the format, run the right pipeline, and deliver
              translated text and exports. Sign in for a dashboard, version history,
              and higher limits.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
              <Link
                href="/login?next=/translate"
                className="inline-flex w-full items-center justify-center rounded-2xl bg-foreground px-8 py-3.5 text-sm font-semibold text-background shadow-md transition hover:opacity-90 active:scale-[0.99] sm:w-auto"
              >
                Start translating
              </Link>
              <Link
                href="/pricing"
                className="inline-flex w-full items-center justify-center rounded-2xl border border-border bg-card px-8 py-3.5 text-sm font-semibold text-foreground transition hover:bg-muted sm:w-auto"
              >
                View pricing
              </Link>
            </div>
            <p className="mt-6 text-sm text-muted-foreground">
              New here?{" "}
              <Link href="/signup" className="font-medium text-foreground underline-offset-4 hover:underline">
                Create an account
              </Link>{" "}
              for the dashboard and saved work.
            </p>
          </div>
        </section>

        <section className="border-t border-border bg-muted/30 px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-center text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Built for mixed content
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">
              One product handles formats that usually need separate tools — so you
              spend less time switching apps.
            </p>
            <ul className="mt-12 grid gap-6 sm:grid-cols-2">
              {features.map((f) => (
                <li
                  key={f.title}
                  className="rounded-2xl border border-border bg-card p-6 shadow-sm transition hover:shadow-md"
                >
                  <h3 className="text-lg font-semibold text-foreground">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {f.description}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-card/80 p-8 text-center shadow-[0_20px_50px_-12px_rgba(0,0,0,0.08)] backdrop-blur-sm dark:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.35)] sm:p-12">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Ready to try it?
            </h2>
            <p className="mt-3 text-muted-foreground">
              Open the translator, upload a file, and pick your target language.
            </p>
            <Link
              href="/login?next=/translate"
              className="mt-8 inline-flex items-center justify-center rounded-2xl bg-foreground px-8 py-3.5 text-sm font-semibold text-background shadow-md transition hover:opacity-90"
            >
              Go to translator
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
