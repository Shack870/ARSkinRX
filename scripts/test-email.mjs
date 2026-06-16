#!/usr/bin/env node
// Send a test email via SendGrid. Usage: node scripts/test-email.mjs you@example.com
import { readFileSync } from "node:fs";

const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = {};
for (const line of raw.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const key = env.SENDGRID_API_KEY;
const fromRaw = env.NOTIFY_FROM_EMAIL || "ARSkinRX <care@arskinrx.com>";
const to = process.argv[2] || "care@arskinrx.com";
if (!key) {
  console.error("No SENDGRID_API_KEY in .env.local");
  process.exit(1);
}
const fm = fromRaw.match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);
const from = fm ? { name: fm[1], email: fm[2] } : { email: fromRaw.trim() };

const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    personalizations: [{ to: [{ email: to }] }],
    from,
    subject: "ARSkinRX email test ✅",
    content: [
      {
        type: "text/html",
        value:
          "<p>This is a test from ARSkinRX. If you're reading this, transactional email is working.</p>",
      },
    ],
  }),
});
console.log(`SendGrid status: ${res.status} ${res.statusText}`);
if (res.status !== 202) console.log(await res.text());
else console.log(`Accepted — sent to ${to} from ${from.email}`);
process.exit(0);
