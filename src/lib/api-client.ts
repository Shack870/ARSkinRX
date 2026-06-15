"use client";

import { auth } from "@/lib/firebase/client";

/**
 * fetch() wrapper that attaches the current user's Firebase ID token as a
 * Bearer header. Throws if the user isn't signed in.
 */
export async function authedFetch(input: string, init: RequestInit = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be signed in.");
  const token = await user.getIdToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(input, { ...init, headers });
}
