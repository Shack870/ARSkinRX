import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { findOrCreateClient } from "@/lib/clients-server";
import { rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/auth/guest { email, displayName, phone?, consent }
 *
 * Guest booking: creates a password-less client account for a new email and
 * returns a custom token so the browser is signed in immediately and can
 * continue through hold → pay. The patient sets a password after paying.
 *
 * If the email already belongs to an account, returns 409 { exists: true } so
 * the UI can ask for their password instead (we never hand out a session for
 * an existing account on the strength of an email alone).
 */
export async function POST(req: Request) {
  const limited = rateLimit(req, "guest", 10);
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const displayName = String(body.displayName ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const consent = body.consent === true;

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }
  if (displayName.length < 2) {
    return NextResponse.json({ error: "Enter your name." }, { status: 400 });
  }
  if (!consent) {
    return NextResponse.json(
      { error: "Please agree to the Terms and Telehealth Consent." },
      { status: 400 },
    );
  }

  const client = await findOrCreateClient({
    email,
    displayName,
    phone,
    consent,
    createdVia: "booking",
  });

  if (!client.created) {
    return NextResponse.json(
      { exists: true, needsPassword: client.needsPassword },
      { status: 409 },
    );
  }

  const customToken = await adminAuth.createCustomToken(client.uid, {
    role: "client",
  });
  return NextResponse.json({ customToken, uid: client.uid });
}
