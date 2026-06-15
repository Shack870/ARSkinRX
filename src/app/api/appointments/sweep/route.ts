import { NextResponse } from "next/server";
import { runSweep } from "@/lib/sweep";

/**
 * POST /api/appointments/sweep
 * Maintenance job (call from a scheduler/cron). Protected by CRON_SECRET.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runSweep();
  return NextResponse.json({ ok: true, ...result });
}
