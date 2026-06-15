import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { verifyBearer } from "@/lib/api-auth";
import { getEffectiveService } from "@/lib/services-server";
import { platformFeeCents } from "@/lib/stripe";
import { countAvailableProviders, getLivePriceCents } from "@/lib/live-server";
import { rateLimit } from "@/lib/rate-limit";
import type { ServiceType } from "@/lib/types";

/**
 * POST /api/live/request { serviceId, intake, photoPaths }
 * Creates a pending-payment live request after confirming a nurse is available.
 */
export async function POST(req: Request) {
  const limited = rateLimit(req, "live-request", 20);
  if (limited) return limited;

  const user = await verifyBearer(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const serviceId = body.serviceId as ServiceType;
  const service = await getEffectiveService(serviceId);
  if (!service || service.enabled === false) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 400 });
  }

  // Re-confirm a nurse is available right now before creating the request.
  const count = await countAvailableProviders(serviceId);
  if (count === 0) {
    return NextResponse.json(
      { error: "No live nurses are available right now." },
      { status: 409 },
    );
  }

  // Real-time visits use the flat premium price set by admin.
  const priceCents = await getLivePriceCents();

  const now = Date.now();
  const ref = adminDb.collection(COLLECTIONS.liveRequests).doc();
  await ref.set({
    id: ref.id,
    clientId: user.uid,
    serviceId,
    status: "pending_payment",
    priceCents,
    platformFeeCents: platformFeeCents(priceCents),
    intake: body.intake ?? {},
    photoPaths: Array.isArray(body.photoPaths) ? body.photoPaths : [],
    createdAt: now,
    updatedAt: now,
  });

  return NextResponse.json({ liveRequestId: ref.id, priceCents });
}
