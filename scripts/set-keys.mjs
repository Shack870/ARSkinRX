#!/usr/bin/env node
/**
 * Apply API keys from keys.local.txt.
 *
 *   node scripts/set-keys.mjs           → write them into .env.local (local dev)
 *   node scripts/set-keys.mjs --prod    → also push to App Hosting (live site)
 *
 * After --prod, run `git push` so App Hosting rebuilds with the new config.
 * Secrets go into Cloud Secret Manager; non-secret values go into apphosting.yaml.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const PROJECT = "arskinrx";
const BACKEND = "arskin";
const ROOT = new URL("..", import.meta.url).pathname;
const prod = process.argv.includes("--prod");

// kind: "secret" → Secret Manager; "public" → apphosting value (BUILD+RUNTIME);
//       "value" → apphosting value (RUNTIME only)
const SPECS = {
  STRIPE_SECRET_KEY: "secret",
  STRIPE_WEBHOOK_SECRET: "secret",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "public",
  SENDGRID_API_KEY: "secret",
  RESEND_API_KEY: "secret",
  NOTIFY_FROM_EMAIL: "value",
  TWILIO_ACCOUNT_SID: "secret",
  TWILIO_AUTH_TOKEN: "secret",
  TWILIO_FROM_NUMBER: "value",
  TURN_URLS: "value",
  TURN_USERNAME: "secret",
  TURN_CREDENTIAL: "secret",
};

const keysFile = `${ROOT}keys.local.txt`;
if (!existsSync(keysFile)) {
  console.error(
    "No keys.local.txt found.\n  cp keys.example.txt keys.local.txt   then fill it in.",
  );
  process.exit(1);
}

// Parse KEY=VALUE lines.
const provided = {};
for (const line of readFileSync(keysFile, "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  const val = m[2].trim();
  if (val) provided[m[1]] = val;
}
const entries = Object.entries(provided).filter(([k]) => k in SPECS);
if (entries.length === 0) {
  console.log("No keys filled in yet. Add values to keys.local.txt and re-run.");
  process.exit(0);
}

// 1) Always update .env.local for local dev.
const envPath = `${ROOT}.env.local`;
let env = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
for (const [k, v] of entries) {
  if (new RegExp(`^${k}=.*$`, "m").test(env)) {
    env = env.replace(new RegExp(`^${k}=.*$`, "m"), `${k}=${v}`);
  } else {
    env += `${env.endsWith("\n") || env === "" ? "" : "\n"}${k}=${v}\n`;
  }
}
writeFileSync(envPath, env);
console.log(`✓ Updated .env.local (${entries.length} key${entries.length > 1 ? "s" : ""})`);

if (!prod) {
  console.log("\nLocal only. Restart `npm run dev` to pick them up.");
  console.log("Run with --prod to push these to the live site.");
  process.exit(0);
}

// 2) Push to production.
const sh = (cmd, input) =>
  execSync(cmd, { input, stdio: ["pipe", "pipe", "pipe"] }).toString();

const yamlEntries = [];
for (const [k, v] of entries) {
  const kind = SPECS[k];
  if (kind === "secret") {
    try {
      sh(`gcloud secrets describe ${k} --project=${PROJECT}`);
    } catch {
      sh(
        `gcloud secrets create ${k} --replication-policy=automatic --project=${PROJECT}`,
      );
    }
    sh(`gcloud secrets versions add ${k} --data-file=- --project=${PROJECT}`, v);
    sh(
      `firebase apphosting:secrets:grantaccess ${k} --project ${PROJECT} --backend ${BACKEND}`,
    );
    yamlEntries.push(`  - variable: ${k}\n    secret: ${k}\n    availability: [RUNTIME]`);
    console.log(`✓ secret set: ${k}`);
  } else {
    const avail = kind === "public" ? "[BUILD, RUNTIME]" : "[RUNTIME]";
    const safe = v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    yamlEntries.push(`  - variable: ${k}\n    value: "${safe}"\n    availability: ${avail}`);
    console.log(`✓ value set: ${k}`);
  }
}

// 3) Write a managed block into apphosting.yaml (replace if present).
const yamlPath = `${ROOT}apphosting.yaml`;
let yaml = readFileSync(yamlPath, "utf8");
const START = "  # >>> set-keys managed (do not edit by hand) >>>";
const END = "  # <<< set-keys managed <<<";
const block = `${START}\n${yamlEntries.join("\n")}\n${END}`;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Remove ALL existing managed blocks (avoids duplicate env vars), then append one.
const re = new RegExp(`\\n*${escapeRe(START)}[\\s\\S]*?${escapeRe(END)}`, "g");
yaml = yaml.replace(re, "").trimEnd();
yaml = `${yaml}\n\n${block}\n`;
writeFileSync(yamlPath, yaml);
console.log("✓ Updated apphosting.yaml");

console.log("\nNext: commit & deploy →  git add -A && git commit -m 'keys' && git push");
