import "server-only";

/**
 * Lightweight notification helpers. They call Resend (email) and Twilio (SMS)
 * over HTTP so we don't add SDK dependencies. If the relevant env vars aren't
 * set, they no-op (and log in dev) so the app works before providers are wired.
 */

const FROM_EMAIL = process.env.NOTIFY_FROM_EMAIL ?? "ARSkinRX <care@arskinrx.com>";

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[notify:email skipped] -> ${opts.to}: ${opts.subject}`);
    }
    return;
  }
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
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
    console.error("sendEmail failed", e);
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

export function bookingConfirmedEmail(opts: {
  name: string;
  serviceName: string;
  whenText: string;
}) {
  return {
    subject: `Your ARSkinRX visit is booked — ${opts.serviceName}`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:520px">
        <h2 style="color:#2f6f6a">You're booked!</h2>
        <p>Hi ${opts.name},</p>
        <p>Your <strong>${opts.serviceName}</strong> visit is confirmed for
        <strong>${opts.whenText}</strong>.</p>
        <p>When it's time, head to your dashboard and join the video visit.</p>
        <p><a href="${APP_URL}/dashboard"
          style="background:#2f6f6a;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">
          Go to my dashboard</a></p>
        <p style="color:#5d6b67;font-size:13px">If you miss your window, you can
        reschedule once for free. Refunds aren't available within 48 hours of the visit.</p>
      </div>`,
  };
}
