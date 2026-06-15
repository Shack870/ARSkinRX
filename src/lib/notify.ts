import "server-only";

/**
 * Notification helpers. Email goes through SendGrid (preferred) or Resend;
 * SMS through Twilio. All are HTTP calls (no SDK deps). If the relevant env
 * vars aren't set they no-op (and log in dev) so the app works before the
 * providers are wired — flip them on by adding keys.
 */

const FROM_EMAIL = process.env.NOTIFY_FROM_EMAIL ?? "ARSkinRX <care@arskinrx.com>";

function parseFrom(value: string): { email: string; name?: string } {
  const m = value.match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);
  if (m) return { name: m[1] || undefined, email: m[2] };
  return { email: value.trim() };
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const from = parseFrom(FROM_EMAIL);

  // 1) SendGrid
  const sendgridKey = process.env.SENDGRID_API_KEY;
  if (sendgridKey) {
    try {
      await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sendgridKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: opts.to }] }],
          from,
          subject: opts.subject,
          content: [{ type: "text/html", value: opts.html }],
        }),
      });
    } catch (e) {
      console.error("sendEmail (SendGrid) failed", e);
    }
    return;
  }

  // 2) Resend
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: opts.to,
          subject: opts.subject,
          html: opts.html,
        }),
      });
    } catch (e) {
      console.error("sendEmail (Resend) failed", e);
    }
    return;
  }

  if (process.env.NODE_ENV !== "production") {
    console.log(`[notify:email skipped] -> ${opts.to}: ${opts.subject}`);
  }
}

export async function sendSms(opts: { to: string; body: string }): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[notify:sms skipped] -> ${opts.to}: ${opts.body}`);
    }
    return;
  }
  try {
    const params = new URLSearchParams({
      To: opts.to,
      From: from,
      Body: opts.body,
    });
    await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      },
    );
  } catch (e) {
    console.error("sendSms failed", e);
  }
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

function shell(inner: string) {
  return `<div style="font-family:system-ui,sans-serif;max-width:520px;color:#1c2b2a">${inner}
    <p style="color:#5d6b67;font-size:12px;margin-top:24px">
      You can manage these emails anytime in your ARSkinRX
      <a href="${APP_URL}/dashboard/profile" style="color:#2f6f6a">notification settings</a>.
    </p>
  </div>`;
}

function button(href: string, label: string) {
  return `<a href="${href}" style="display:inline-block;background:#2f6f6a;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">${label}</a>`;
}

/** Booking confirmation that doubles as a receipt. */
export function bookingConfirmedEmail(opts: {
  name: string;
  serviceName: string;
  whenText: string;
  amountText?: string;
}) {
  return {
    subject: `Your ARSkinRX visit is booked — ${opts.serviceName}`,
    html: shell(`
      <h2 style="color:#2f6f6a">You're booked!</h2>
      <p>Hi ${opts.name},</p>
      <p>Your <strong>${opts.serviceName}</strong> visit is confirmed for
      <strong>${opts.whenText}</strong>.</p>
      ${
        opts.amountText
          ? `<p style="background:#f1efe9;padding:12px 14px;border-radius:8px">
               <strong>Receipt:</strong> ${opts.amountText} paid · ${opts.serviceName}
             </p>`
          : ""
      }
      <p>${button(`${APP_URL}/dashboard`, "Go to my dashboard")}</p>
      <p style="color:#5d6b67;font-size:13px">Miss your window? Reschedule once for
      free. Refunds aren't available within 48 hours of the visit.</p>
    `),
  };
}

/** Pre-visit reminder. `daysLabel` is the human distance, e.g. "in 3 days". */
export function reminderEmail(opts: {
  name: string;
  serviceName: string;
  whenText: string;
  daysLabel: string;
}) {
  return {
    subject: `Reminder: your ARSkinRX visit is ${opts.daysLabel}`,
    html: shell(`
      <h2 style="color:#2f6f6a">Visit reminder</h2>
      <p>Hi ${opts.name},</p>
      <p>This is a friendly reminder that your <strong>${opts.serviceName}</strong>
      visit is <strong>${opts.daysLabel}</strong> — on
      <strong>${opts.whenText}</strong>.</p>
      <p>${button(`${APP_URL}/dashboard`, "View my visit")}</p>
    `),
  };
}
