#!/usr/bin/env node
/**
 * Grant a role to an existing user. Useful for creating the first admin.
 *
 * Usage:
 *   node scripts/set-role.mjs someone@example.com admin
 *   node scripts/set-role.mjs nurse@example.com provider
 *
 * Reads FIREBASE_SERVICE_ACCOUNT_BASE64 from .env.local.
 */
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function loadEnvLocal() {
  try {
    const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    // ignore
  }
}

loadEnvLocal();

const [, , email, role] = process.argv;
if (!email || !["admin", "provider", "client"].includes(role)) {
  console.error("Usage: node scripts/set-role.mjs <email> <admin|provider|client>");
  process.exit(1);
}

const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
if (!b64) {
  console.error("FIREBASE_SERVICE_ACCOUNT_BASE64 is not set in .env.local");
  process.exit(1);
}

initializeApp({
  credential: cert(JSON.parse(Buffer.from(b64, "base64").toString("utf8"))),
});

const auth = getAuth();
const db = getFirestore();

const user = await auth.getUserByEmail(email);
await auth.setCustomUserClaims(user.uid, { role });
await db
  .collection("users")
  .doc(user.uid)
  .set(
    {
      uid: user.uid,
      email,
      role,
      state: "AR",
      updatedAt: Date.now(),
    },
    { merge: true },
  );

console.log(`✓ ${email} is now '${role}'. They must sign out and back in.`);
process.exit(0);
