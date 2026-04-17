import { Resend } from "resend";

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

const fromDefault = () =>
  process.env.RESEND_FROM_EMAIL ?? "Translate <onboarding@resend.dev>";

export async function sendPaymentSuccessEmail(
  to: string,
  planName: string,
): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.info("[email] RESEND_API_KEY not set; skip payment success email");
    return;
  }
  await resend.emails.send({
    from: fromDefault(),
    to,
    subject: `Subscription active — ${planName}`,
    html: `<p>Your <strong>${planName}</strong> subscription is now active. Thank you!</p>`,
  });
}

export async function sendPlanExpiryWarningEmail(
  to: string,
  endDate: string,
): Promise<void> {
  const resend = getResend();
  if (!resend) return;
  await resend.emails.send({
    from: fromDefault(),
    to,
    subject: "Your plan renews or ends soon",
    html: `<p>Your subscription period ends on <strong>${endDate}</strong>. Manage billing in your dashboard.</p>`,
  });
}

export async function sendUsageWarningEmail(
  to: string,
  detail: string,
): Promise<void> {
  const resend = getResend();
  if (!resend) return;
  await resend.emails.send({
    from: fromDefault(),
    to,
    subject: "Usage notice",
    html: `<p>${detail}</p>`,
  });
}
