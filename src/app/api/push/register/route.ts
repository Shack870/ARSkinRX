import { NextResponse } from "next/server";

import { verifyBearer } from "@/lib/api-auth";
import { registerPushToken, unregisterPushToken } from "@/lib/push-server";

export const runtime = "nodejs";

/** Native app registers (POST) or removes (DELETE) its APNs device token. */
export async function POST(req: Request) {
  const user = await verifyBearer(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as {
    token?: string;
    platform?: string;
    appVersion?: string;
  };
  if (!body.token || body.platform !== "ios") {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  try {
    await registerPushToken({
      uid: user.uid,
      token: body.token,
      platform: "ios",
      appVersion: typeof body.appVersion === "string" ? body.appVersion.slice(0, 32) : undefined,
    });
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await verifyBearer(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { token?: string };
  if (!body.token) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  await unregisterPushToken(user.uid, body.token);
  return NextResponse.json({ ok: true });
}
