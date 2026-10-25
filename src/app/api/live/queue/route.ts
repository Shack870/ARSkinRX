import { NextResponse } from "next/server";
import { verifyBearer } from "@/lib/api-auth";
import { queueForProvider } from "@/lib/live-queue";

/**
 * GET /api/live/queue
 * The signed-in nurse's line: how many are waiting (with positions and
 * projected starts), their next scheduled visit, and whether the head of the
 * line could start right now under the admission rule. No PHI.
 */
export async function GET(req: Request) {
  const user = await verifyBearer(req);
  if (!user || user.role !== "provider") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const view = await queueForProvider(user.uid);
  return NextResponse.json(view);
}
