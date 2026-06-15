import "server-only";

import { adminAuth } from "@/lib/firebase/admin";
import type { Role } from "@/lib/types";

export interface VerifiedUser {
  uid: string;
  email?: string;
  role: Role | null;
}

/**
 * Verifies the `Authorization: Bearer <idToken>` header on an API request.
 * Returns the decoded user, or null if missing/invalid.
 */
export async function requireAdmin(req: Request): Promise<VerifiedUser | null> {
  const user = await verifyBearer(req);
  if (!user || user.role !== "admin") return null;
  return user;
}

export async function verifyBearer(req: Request): Promise<VerifiedUser | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return {
      uid: decoded.uid,
      email: decoded.email,
      role: (decoded.role as Role) ?? null,
    };
  } catch {
    return null;
  }
}
