"use client";

import * as React from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  onIdTokenChanged,
  sendEmailVerification,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updatePassword,
  updateProfile,
  type User as FirebaseUser,
} from "firebase/auth";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import { COLLECTIONS } from "@/lib/firebase/collections";
import type { Role, UserProfile } from "@/lib/types";

interface AuthContextValue {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  role: Role | null;
  /** True for role === 'admin' or the additive `admin: true` claim. */
  isAdmin: boolean;
  loading: boolean;
  signUp: (email: string, password: string, displayName: string) => Promise<FirebaseUser>;
  signIn: (email: string, password: string) => Promise<FirebaseUser>;
  signOut: () => Promise<void>;
  refreshClaims: () => Promise<void>;
  resendVerification: () => Promise<void>;
  /** Sign in with a server-minted custom token (guest booking). */
  signInWithToken: (token: string) => Promise<FirebaseUser>;
  /**
   * Set a password on a password-less (guest/admin-created) account. Extra
   * profile fields collected at the same time (e.g. dob) are saved first so
   * they persist even if the password step needs the emailed reset link.
   */
  setPassword: (
    password: string,
    profilePatch?: Partial<Pick<UserProfile, "dob" | "phone">>,
  ) => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

interface ClaimState {
  role: Role | null;
  isAdmin: boolean;
}

function readClaims(claims: Record<string, unknown>): ClaimState {
  const role = (claims.role as Role) ?? null;
  return { role, isAdmin: role === "admin" || claims.admin === true };
}

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
  const [claims, setClaims] = React.useState<ClaimState>({
    role: null,
    isAdmin: false,
  });
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const tokenResult = await u.getIdTokenResult();
        setClaims(readClaims(tokenResult.claims));
      } else {
        setClaims({ role: null, isAdmin: false });
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
    setClaims(readClaims(tokenResult.claims));
  }, []);

  const resendVerification = React.useCallback(async () => {
    if (auth.currentUser) await sendEmailVerification(auth.currentUser);
  }, []);

  const signInWithToken = React.useCallback(async (token: string) => {
    const cred = await signInWithCustomToken(auth, token);
    const tokenResult = await cred.user.getIdTokenResult(true);
    setClaims(readClaims(tokenResult.claims));
    return cred.user;
  }, []);

  const setPassword = React.useCallback(
    async (
      password: string,
      profilePatch?: Partial<Pick<UserProfile, "dob" | "phone">>,
    ) => {
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in.");
      const ref = doc(db, COLLECTIONS.users, u.uid);
      if (profilePatch && Object.keys(profilePatch).length) {
        await updateDoc(ref, { ...profilePatch, updatedAt: Date.now() });
      }
      await updatePassword(u, password);
      await updateDoc(ref, { passwordSet: true, updatedAt: Date.now() });
    },
    [],
  );

  const value: AuthContextValue = {
    user,
    profile,
    role: claims.role,
    isAdmin: claims.isAdmin,
    loading,
    signUp,
    signIn,
    signOut,
    refreshClaims,
    resendVerification,
    signInWithToken,
    setPassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
