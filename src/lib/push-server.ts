import "server-only";

import { connect, constants as h2 } from "node:http2";
import { createPrivateKey, sign as cryptoSign } from "node:crypto";

import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";

/**
 * Native push notifications (iOS app) over APNs HTTP/2.
 *
 * Device tokens are registered by the Capacitor shell via /api/push/register
 * and stored in `pushTokens/{token}`. Sending is best-effort and no-ops when
 * the APNs key isn't configured, so every call site can fire-and-forget.
 *
 * Env:
 *   APNS_KEY_ID     – 10-char key id from developer.apple.com → Keys
 *   APNS_KEY_P8     – the .p8 contents (PEM, "\n" escapes ok) or base64 of it
 *   APNS_TEAM_ID    – defaults to W5KVNXM2AL
 *   APNS_BUNDLE_ID  – defaults to com.arskinrx.app
 */

const TEAM_ID = process.env.APNS_TEAM_ID ?? "W5KVNXM2AL";
const BUNDLE_ID = process.env.APNS_BUNDLE_ID ?? "com.arskinrx.app";
const KEY_ID = process.env.APNS_KEY_ID;

const HOSTS = {
  production: "https://api.push.apple.com",
  sandbox: "https://api.sandbox.push.apple.com",
} as const;
type ApnsEnv = keyof typeof HOSTS;

export interface PushToken {
  token: string;
  uid: string;
  platform: "ios";
  /** Learned on first successful delivery; unknown tokens try production first. */
  env?: ApnsEnv;
  appVersion?: string;
  createdAt: number;
  updatedAt: number;
}

export interface PushMessage {
  title: string;
  body: string;
  /** In-app path to open when tapped, e.g. "/live/abc". */
  url?: string;
  /** Groups notifications in Notification Center. */
  threadId?: string;
  /** Replaces an earlier notification with the same id. */
  collapseId?: string;
  sound?: string;
  /** Time-sensitive alerts break through Focus (requires the entitlement). */
  interruptionLevel?: "passive" | "active" | "time-sensitive";
}

function loadKey(): ReturnType<typeof createPrivateKey> | null {
  const raw = process.env.APNS_KEY_P8;
  if (!raw || !KEY_ID) return null;
  let pem = raw.includes("BEGIN PRIVATE KEY")
    ? raw.replace(/\\n/g, "\n")
    : Buffer.from(raw, "base64").toString("utf8");
  pem = pem.trim();
  try {
    return createPrivateKey(pem);
  } catch (e) {
    console.error("[push] invalid APNS_KEY_P8", e);
    return null;
  }
}

let cachedKey: ReturnType<typeof createPrivateKey> | null | undefined;
let cachedJwt: { value: string; issuedAt: number } | null = null;

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/** APNs provider token (ES256 JWT), reused for up to 50 minutes. */
function providerJwt(): string | null {
  if (cachedKey === undefined) cachedKey = loadKey();
  if (!cachedKey || !KEY_ID) return null;
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && now - cachedJwt.issuedAt < 50 * 60) return cachedJwt.value;
  const header = b64url(JSON.stringify({ alg: "ES256", kid: KEY_ID }));
  const claims = b64url(JSON.stringify({ iss: TEAM_ID, iat: now }));
  const signature = cryptoSign("sha256", Buffer.from(`${header}.${claims}`), {
    key: cachedKey,
    dsaEncoding: "ieee-p1363",
  });
  const value = `${header}.${claims}.${b64url(signature)}`;
  cachedJwt = { value, issuedAt: now };
  return value;
}

export function pushConfigured(): boolean {
  return Boolean(KEY_ID && process.env.APNS_KEY_P8);
}

interface ApnsResult {
  status: number;
  reason?: string;
}

function postToApns(
  env: ApnsEnv,
  token: string,
  payload: unknown,
  msg: PushMessage,
  jwt: string,
): Promise<ApnsResult> {
  return new Promise((resolve) => {
    const client = connect(HOSTS[env]);
    const finish = (r: ApnsResult) => {
      client.close();
      resolve(r);
    };
    client.on("error", (e) => finish({ status: 0, reason: String(e) }));
    const headers: Record<string, string> = {
      [h2.HTTP2_HEADER_METHOD]: "POST",
      [h2.HTTP2_HEADER_PATH]: `/3/device/${token}`,
      [h2.HTTP2_HEADER_CONTENT_TYPE]: "application/json",
      authorization: `bearer ${jwt}`,
      "apns-topic": BUNDLE_ID,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-expiration": String(Math.floor(Date.now() / 1000) + 60 * 60),
    };
    if (msg.collapseId) headers["apns-collapse-id"] = msg.collapseId.slice(0, 64);
    const req = client.request(headers);
    let status = 0;
    let body = "";
    req.on("response", (h) => {
      status = Number(h[h2.HTTP2_HEADER_STATUS] ?? 0);
    });
    req.setEncoding("utf8");
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let reason: string | undefined;
      if (body) {
        try {
          reason = (JSON.parse(body) as { reason?: string }).reason;
        } catch {
          reason = body;
        }
      }
      finish({ status, reason });
    });
    req.on("error", (e) => finish({ status: 0, reason: String(e) }));
    req.setTimeout(10_000, () => {
      req.close();
      finish({ status: 0, reason: "timeout" });
    });
    req.end(JSON.stringify(payload));
  });
}

function buildPayload(msg: PushMessage) {
  return {
    aps: {
      alert: { title: msg.title, body: msg.body },
      sound: msg.sound ?? "default",
      "thread-id": msg.threadId,
      "interruption-level": msg.interruptionLevel,
    },
    url: msg.url,
  };
}

async function deliver(tokenDoc: PushToken, msg: PushMessage): Promise<void> {
  const jwt = providerJwt();
  if (!jwt) return;
  const payload = buildPayload(msg);
  const ref = adminDb.collection(COLLECTIONS.pushTokens).doc(tokenDoc.token);
  const order: ApnsEnv[] = tokenDoc.env
    ? [tokenDoc.env]
    : ["production", "sandbox"];

  for (const env of order) {
    const r = await postToApns(env, tokenDoc.token, payload, msg, jwt);
    if (r.status === 200) {
      if (tokenDoc.env !== env) {
        await ref.set({ env, updatedAt: Date.now() }, { merge: true }).catch(() => {});
      }
      return;
    }
    // Token belongs to the other environment (dev build vs. App Store build).
    if (r.status === 400 && r.reason === "BadDeviceToken" && !tokenDoc.env) continue;
    // Permanently dead token: user deleted the app or revoked permission.
    if (r.status === 410 || (r.status === 400 && r.reason === "BadDeviceToken")) {
      await ref.delete().catch(() => {});
      return;
    }
    console.error(`[push] APNs ${env} ${r.status} ${r.reason ?? ""} for ${tokenDoc.uid}`);
    return;
  }
}

/** Sends a push to every registered device for `uid`. Never throws. */
export async function sendPush(uid: string, msg: PushMessage): Promise<number> {
  if (!pushConfigured()) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[push skipped] -> ${uid}: ${msg.title} — ${msg.body}`);
    }
    return 0;
  }
  try {
    const snap = await adminDb
      .collection(COLLECTIONS.pushTokens)
      .where("uid", "==", uid)
      .get();
    if (snap.empty) return 0;
    await Promise.all(snap.docs.map((d) => deliver(d.data() as PushToken, msg)));
    return snap.size;
  } catch (e) {
    console.error("[push] send failed", e);
    return 0;
  }
}

/** Same message to several users (e.g. all admins). */
export async function sendPushToMany(uids: string[], msg: PushMessage): Promise<void> {
  await Promise.all([...new Set(uids)].map((uid) => sendPush(uid, msg)));
}

/** Upsert a device token for a signed-in user. */
export async function registerPushToken(opts: {
  uid: string;
  token: string;
  platform: "ios";
  appVersion?: string;
}): Promise<void> {
  const token = opts.token.trim();
  if (!/^[a-f0-9]{32,256}$/i.test(token)) throw new Error("Invalid token");
  const ref = adminDb.collection(COLLECTIONS.pushTokens).doc(token);
  const now = Date.now();
  const existing = await ref.get();
  await ref.set(
    {
      token,
      uid: opts.uid,
      platform: opts.platform,
      appVersion: opts.appVersion ?? null,
      createdAt: (existing.get("createdAt") as number | undefined) ?? now,
      updatedAt: now,
    },
    { merge: true },
  );
}

export async function unregisterPushToken(uid: string, token: string): Promise<void> {
  const ref = adminDb.collection(COLLECTIONS.pushTokens).doc(token.trim());
  const snap = await ref.get();
  if (snap.exists && snap.get("uid") === uid) await ref.delete();
}
