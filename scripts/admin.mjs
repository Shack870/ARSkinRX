#!/usr/bin/env node
/**
 * ARSkinRX admin utility. Uses the service account in .env.local.
 *
 *   node scripts/admin.mjs list-providers
 *   node scripts/admin.mjs approve <email>
 *   node scripts/admin.mjs make-admin <email>
 *   node scripts/admin.mjs create-admin <email> <password>
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
  } catch {}
}
loadEnvLocal();

const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
if (!b64) {
  console.error("FIREBASE_SERVICE_ACCOUNT_BASE64 missing in .env.local");
  process.exit(1);
}
initializeApp({
  credential: cert(JSON.parse(Buffer.from(b64, "base64").toString("utf8"))),
});
const auth = getAuth();
const db = getFirestore();

const [cmd, a, b] = process.argv.slice(2);

async function emailToUid(email) {
  const u = await auth.getUserByEmail(email);
  return u.uid;
}

switch (cmd) {
  case "list-providers": {
    const snap = await db.collection("providers").get();
    if (snap.empty) {
      console.log("No providers yet.");
      break;
    }
    for (const d of snap.docs) {
      const u = await db.collection("users").doc(d.id).get();
      console.log(
        `${u.get("email") ?? "?"}  |  status=${d.get("status")}  |  conditions=${(d.get("conditions") ?? []).join(",")}`,
      );
    }
    break;
  }
  case "approve": {
    const uid = await emailToUid(a);
    await db
      .collection("providers")
      .doc(uid)
      .update({ status: "approved", updatedAt: Date.now() });
    console.log(`✓ Approved provider ${a}`);
    break;
  }
  case "make-admin": {
    const uid = await emailToUid(a);
    await auth.setCustomUserClaims(uid, { role: "admin" });
    await db
      .collection("users")
      .doc(uid)
      .set({ uid, email: a, role: "admin", state: "AR", updatedAt: Date.now() }, { merge: true });
    console.log(`✓ ${a} is now admin. Sign out and back in to refresh.`);
    break;
  }
  case "create-admin": {
    let uid;
    try {
      uid = (await auth.getUserByEmail(a)).uid;
      await auth.updateUser(uid, { password: b });
    } catch {
      uid = (await auth.createUser({ email: a, password: b, emailVerified: true })).uid;
    }
    await auth.setCustomUserClaims(uid, { role: "admin" });
    await db
      .collection("users")
      .doc(uid)
      .set({ uid, email: a, displayName: "ARSkinRX Admin", role: "admin", state: "AR", createdAt: Date.now(), updatedAt: Date.now() }, { merge: true });
    console.log(`✓ Admin account ready: ${a}`);
    break;
  }
  default:
    console.log(
      "Usage: list-providers | approve <email> | make-admin <email> | create-admin <email> <password>",
    );
}
process.exit(0);
