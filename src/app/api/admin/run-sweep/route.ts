import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { runSweep } from "@/lib/sweep";

/** POST /api/admin/run-sweep — lets an admin run maintenance on demand. */
export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const result = await runSweep();
  return NextResponse.json({ ok: true, ...result });
}
