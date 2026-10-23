import "server-only";

import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase/admin";
import { claimsGrantAdmin } from "@/lib/api-auth";
import type { Role } from "@/lib/types";

export const SESSION_COOKIE = "arskinrx_session";

export interface ServerUser {
  uid: string;
  email?: string;
  role: Role | null;
  /** role === 'admin' or the additive `admin: true` claim. */
  isAdmin: boolean;
}

/**
 * Reads and verifies the Firebase session cookie. Returns null if there is no
 * valid session. Safe to call from server components, route handlers, and
 * layouts.
 */
export async function getServerUser(): Promise<ServerUser | null> {
  const store = await cookies();
  const session = store.get(SESSION_COOKIE)?.value;
  if (!session) return null;

  try {
    const decoded = await adminAuth.verifySessionCookie(session, true);
    return {
      uid: decoded.uid,
      email: decoded.email,
      role: (decoded.role as Role) ?? null,
      isAdmin: claimsGrantAdmin(decoded),
    };
  } catch {
    return null;
  }
}

export async function requireRole(role: Role): Promise<ServerUser | null> {
  const user = await getServerUser();
  if (!user) return null;
  if (role === "admin" ? !user.isAdmin : user.role !== role) return null;
  return user;
}
