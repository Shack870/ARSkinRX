import { NextResponse } from "next/server";

/**
 * GET /api/turn — returns ICE servers for the WebRTC connection.
 * Always includes public STUN; includes TURN relay if configured (needed when
 * peers can't connect directly through NATs/firewalls).
 */
export async function GET() {
  const iceServers: RTCIceServer[] = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ];

  const turnUrls = process.env.TURN_URLS;
  if (turnUrls) {
    iceServers.push({
      urls: turnUrls.split(",").map((u) => u.trim()),
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    });
  }

  return NextResponse.json({ iceServers });
}
