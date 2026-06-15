# ARSkinRX

Online skin-care virtual clinic for Arkansas — booking, payments, live video
visits, and "No-Wait Live" on-demand matching, with patient, nurse (APRN), and
admin dashboards.

## Stack

- **Next.js (App Router) + TypeScript + Tailwind v4**
- **Firebase**: Auth, Firestore, Storage, Admin SDK; deployed on **App Hosting**
- **Stripe** (Connect-ready) for payments — currently dev-bypass until keys added
- **Raw WebRTC** video (Firestore signaling + optional TURN)
- **SendGrid/Resend** (email) + **Twilio** (SMS) for notifications

## Local development

```bash
npm install
cp .env.example .env.local   # fill in values (see below)
npm run dev                  # http://localhost:3000
```

### Required env (`.env.local`)

- `NEXT_PUBLIC_FIREBASE_*` — Firebase web config (public)
- `FIREBASE_SERVICE_ACCOUNT_BASE64` — base64 of a service-account JSON (server)
- Optional until go-live: `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`,
  `STRIPE_WEBHOOK_SECRET`, `TURN_URLS`/`TURN_USERNAME`/`TURN_CREDENTIAL`,
  `SENDGRID_API_KEY` (or `RESEND_API_KEY`), `TWILIO_*`, `CRON_SECRET`
- `PLATFORM_FEE_BPS` — platform's share in basis points (`5000` = 50/50 split)

## Configuring API keys (easy path)

Fill keys in one place and apply them with one command:

```bash
cp keys.example.txt keys.local.txt    # then paste your keys (git-ignored)
node scripts/set-keys.mjs             # → writes .env.local for local dev
node scripts/set-keys.mjs --prod      # → also pushes to App Hosting (secrets + yaml)
git push                              # deploy the production config
```

Secret keys (Stripe, SendGrid/Resend, Twilio token, TURN credential) go into
Cloud Secret Manager; non-secret values go into `apphosting.yaml`. Re-run any
time you add more keys.

## Useful scripts

```bash
node scripts/admin.mjs list-providers
node scripts/admin.mjs approve <email>
node scripts/admin.mjs create-admin <email> <password>   # creates an admin login
node scripts/set-role.mjs <email> <admin|provider|client>
node scripts/set-live-price.mjs 99                         # set Live Connect price
node scripts/check-live.mjs                                # debug live presence
```

## Roles & dashboards

- **Patient** (`/dashboard`) — book, pay, waiting room, video visit, receipts, prefs
- **Nurse** (`/provider`) — Go Live toggle, schedule, availability, earnings, in-call clinical panel
- **Admin** (`/admin`) — revenue, providers, patients, appointments, payments, payouts, services, audit log

Roles are enforced by a custom claim on the Firebase token and mirrored in
`users/{uid}.role`. Firestore/Storage rules in `firestore.rules` / `storage.rules`.

## Deploy

App Hosting builds automatically on **push to `main`** (GitHub `Shack870/ARSkinRX`).
Production env/secrets are configured in `apphosting.yaml` (public vars) and Cloud
Secret Manager (`FIREBASE_SERVICE_ACCOUNT_BASE64`, `CRON_SECRET`, and Stripe/Twilio
when added).

```bash
git push origin main                                  # triggers a rollout
firebase deploy --only firestore:rules,firestore:indexes,storage --project arskinrx
```

The maintenance sweep (no-show detection, hold release, reminders) runs every 5
minutes via Cloud Scheduler job `arskinrx-sweep` → `POST /api/appointments/sweep`.

## Go-live checklist

Engineering is complete; these are the remaining account/compliance steps:

- [ ] **Stripe live mode**: add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and
      `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` as secrets; enable Connect; add the webhook
      endpoint (`/api/stripe/webhook`). (Test first with `sk_test_…` + card `4242…`.)
- [ ] **TURN server** (Twilio/Metered/coturn): set `TURN_URLS/USERNAME/CREDENTIAL`
      so video connects reliably across networks.
- [ ] **Email/SMS**: add `SENDGRID_API_KEY` (or `RESEND_API_KEY`) + verified domain,
      and `TWILIO_*` with an **A2P 10DLC-registered** number.
- [ ] **Google Cloud BAA** signed (HIPAA), using only covered services.
- [ ] **Attorney review** of Terms, Privacy/HIPAA, and Telehealth Consent (templates).
- [ ] Create the admin account and approve providers.
- [ ] Optional: custom domain on the App Hosting backend.
```
