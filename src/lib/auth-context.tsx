"use client";

import * as React from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  onIdTokenChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updateProfile,
  type User as FirebaseUser,
} from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import { COLLECTIONS } from "@/lib/firebase/collections";
import type { Role, UserProfile } from "@/lib/types";

interface AuthContextValue {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  role: Role | null;
  loading: boolean;
  signUp: (email: string, password: string, displayName: string) => Promise<FirebaseUser>;
  signIn: (email: string, password: string) => Promise<FirebaseUser>;
  signOut: () => Promise<void>;
  refreshClaims: () => Promise<void>;
  resendVerification: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

/** Sync the Firebase ID token into an HTTP-only session cookie for SSR. */
async function postSession(token: string | null) {
  try {
    if (token) {
      await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: token }),
      });
    } else {
      await fetch("/api/auth/session", { method: "DELETE" });
    }
  } catch {
    // Non-fatal: client auth still works without the SSR cookie.
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<FirebaseUser | null>(null);
  const [profile, setProfile] = React.useState<UserProfile | null>(null);
  const [role, setRole] = React.useState<Role | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const tokenResult = await u.getIdTokenResult();
        setRole((tokenResult.claims.role as Role) ?? null);
      } else {
        setRole(null);
        setProfile(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  // Keep the SSR session cookie in sync with token refreshes.
  React.useEffect(() => {
    return onIdTokenChanged(auth, async (u) => {
      const token = u ? await u.getIdToken() : null;
      await postSession(token);
    });
  }, []);

  // Live-subscribe to the user's profile document.
  React.useEffect(() => {
    if (!user) return;
    const ref = doc(db, COLLECTIONS.users, user.uid);
    return onSnapshot(ref, (snap) => {
      setProfile(snap.exists() ? (snap.data() as UserProfile) : null);
    });
  }, [user]);

  const signUp = React.useCallback(
    async (email: string, password: string, displayName: string) => {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName });
      try {
        await sendEmailVerification(cred.user);
      } catch {
        // non-fatal
      }
      return cred.user;
    },
    [],
  );

  const signIn = React.useCallback(async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  }, []);

  const signOut = React.useCallback(async () => {
    await fbSignOut(auth);
    await postSession(null);
  }, []);

  const refreshClaims = React.useCallback(async () => {
    if (!auth.currentUser) return;
    const tokenResult = await auth.currentUser.getIdTokenResult(true);
    setRole((tokenResult.claims.role as Role) ?? null);
  }, []);

  const resendVerification = React.useCallback(async () => {
    if (auth.currentUser) await sendEmailVerification(auth.currentUser);
  }, []);

  const value: AuthContextValue = {
    user,
    profile,
    role,
    loading,
    signUp,
    signIn,
    signOut,
    refreshClaims,
    resendVerification,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
