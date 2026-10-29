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
  // Prefer the Messaging Service: it routes through the registered A2P 10DLC
  // campaign and handles STOP/HELP keywords automatically.
  const service = process.env.TWILIO_MESSAGING_SERVICE_SID;
  if (!sid || !token || (!from && !service)) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[notify:sms skipped] -> ${opts.to}: ${opts.body}`);
    }
    return;
  }
  try {
    const params = new URLSearchParams({ To: opts.to, Body: opts.body });
    if (service) params.set("MessagingServiceSid", service);
    else if (from) params.set("From", from);
    const res = await fetch(
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
    if (!res.ok) {
      console.error("sendSms rejected", res.status, await res.text());
    }
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
               <strong>Receipt:</strong> ${opts.amountText} paid · ${opts.serviceName}<br>
               <span style="color:#5d6b67;font-size:13px">Covers your live video visit. If your provider writes a prescription, our partner pharmacy will contact you to take payment for the medication and ship it to you.</span>
             </p>`
          : ""
      }
      <p>${button(`${APP_URL}/dashboard`, "Go to my dashboard")}</p>
      <p style="color:#5d6b67;font-size:13px">Miss your window? Reschedule once for
      free. Refunds aren't available within 24 hours of the visit.</p>
    `),
  };
}

/** After-visit summary with the provider's plan. */
export function visitSummaryEmail(opts: {
  name: string;
  serviceName: string;
  assessment?: string;
  plan?: string;
  prescribed?: string;
  /** True when the nurse recommended a prescription that the prescriber will send. */
  rxPending?: boolean;
}) {
  const block = (label: string, value?: string) =>
    value
      ? `<p style="margin:10px 0"><strong>${label}:</strong><br>${value.replace(/\n/g, "<br>")}</p>`
      : "";
  return {
    subject: `Your ARSkinRX visit summary — ${opts.serviceName}`,
    html: shell(`
      <h2 style="color:#2f6f6a">Your visit summary</h2>
      <p>Hi ${opts.name},</p>
      <p>Thanks for your <strong>${opts.serviceName}</strong> visit. Here's the
      summary from your provider:</p>
      <div style="background:#f1efe9;padding:12px 14px;border-radius:8px">
        ${block("Assessment", opts.assessment)}
        ${block("Plan", opts.plan)}
        ${block("Prescribed", opts.prescribed)}
        ${
          opts.rxPending
            ? `<p style="margin:10px 0"><strong>Prescription:</strong><br>Your prescription is being finalized and sent to your pharmacy. The pharmacy will contact you within 24 hours when it's ready.</p>`
            : ""
        }
      </div>
      <p>${button(`${APP_URL}/dashboard/records`, "View your records")}</p>
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

/** To the prescriber: a nurse has recommended a prescription to review. */
export function rxReviewEmail(opts: {
  nurseName: string;
  patientName: string;
  serviceName: string;
  items: string[];
  pending: number;
}) {
  return {
    subject: `Rx to review: ${opts.patientName} (${opts.serviceName})`,
    html: shell(`
      <h2 style="color:#2f6f6a">Prescription recommendation</h2>
      <p><strong>${opts.nurseName}</strong> recommended the following for
      <strong>${opts.patientName}</strong> after a ${opts.serviceName} visit:</p>
      <ul>${opts.items.map((i) => `<li>${i}</li>`).join("")}</ul>
      <p>${opts.pending} item${opts.pending === 1 ? "" : "s"} waiting for your review.</p>
      <p>${button(`${APP_URL}/admin/prescriptions`, "Review now")}</p>
    `),
  };
}

/** To the prescriber: items have been waiting more than a day. */
export function rxReminderEmail(opts: { pending: number; oldestHours: number }) {
  return {
    subject: `${opts.pending} prescription${opts.pending === 1 ? "" : "s"} waiting for review`,
    html: shell(`
      <h2 style="color:#2f6f6a">Prescriptions waiting</h2>
      <p>${opts.pending} recommendation${opts.pending === 1 ? " has" : "s have"} been
      waiting for review — the oldest for about ${opts.oldestHours} hours. Patients
      were told the pharmacy would reach them within 24 hours.</p>
      <p>${button(`${APP_URL}/admin/prescriptions`, "Open the review queue")}</p>
    `),
  };
}

/** To the nurse: the prescriber declined the recommendation; please call the patient. */
export function rxDeclinedEmail(opts: {
  nurseName: string;
  patientName: string;
  patientPhone: string;
  item: string;
  reason: string;
  refunded: boolean;
  appointmentId: string;
}) {
  return {
    subject: `Action needed: Rx declined for ${opts.patientName}`,
    html: shell(`
      <h2 style="color:#2f6f6a">Prescription declined</h2>
      <p>Hi ${opts.nurseName},</p>
      <p>Crystal declined your recommendation for <strong>${opts.patientName}</strong>:</p>
      <p style="background:#f1efe9;padding:12px 14px;border-radius:8px"><strong>${opts.item}</strong><br>Reason: ${opts.reason}</p>
      <p>${
        opts.refunded
          ? "The visit has been refunded to the patient."
          : "No refund was issued because another prescription from this visit is still active."
      }
      Please call the patient${opts.patientPhone ? ` at <strong>${opts.patientPhone}</strong>` : ""}
      to discuss next steps — they have not been notified.</p>
      <p>${button(`${APP_URL}/provider/appointments/${opts.appointmentId}`, "Open the visit")}</p>
    `),
  };
}
