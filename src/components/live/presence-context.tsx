"use client";

import * as React from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { useAuth } from "@/lib/auth-context";
import { useProviderProfile } from "@/lib/hooks";

interface PresenceValue {
  online: boolean;
  busy: boolean;
  canGoLive: boolean;
  working: boolean;
  goLive: () => Promise<void>;
  goOffline: () => Promise<void>;
}

const PresenceContext = React.createContext<PresenceValue | undefined>(undefined);

const HEARTBEAT_MS = 20_000;

/**
 * Mounted in the provider layout so a nurse's "live" presence persists across
 * every provider page (not just the overview). Heartbeats while online and on
 * tab refocus so they stay in the matching pool reliably.
 */
export function PresenceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { profile } = useProviderProfile(user?.uid);
  const [online, setOnline] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [working, setWorking] = React.useState(false);

  // Mirror the presence doc (also reflects server-set busy during a live visit).
  React.useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, COLLECTIONS.presence, user.uid), (snap) => {
      if (snap.exists()) {
        setOnline(snap.get("online") === true);
        setBusy(snap.get("busy") === true);
      } else {
        setOnline(false);
      }
    });
  }, [user]);

  // Heartbeat while online + immediate ping when the tab regains focus.
  React.useEffect(() => {
    if (!online || !user) return;
    const ping = () =>
      setDoc(
        doc(db, COLLECTIONS.presence, user.uid),
        { lastSeenAt: Date.now() },
        { merge: true },
      ).catch(() => {});
    ping();
    const id = setInterval(ping, HEARTBEAT_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") ping();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [online, user]);

  // Leave the pool when the provider leaves the dashboard entirely.
  React.useEffect(() => {
    return () => {
      if (user) {
        setDoc(
          doc(db, COLLECTIONS.presence, user.uid),
          { online: false, updatedAt: Date.now() },
          { merge: true },
        ).catch(() => {});
      }
    };
  }, [user]);

  const goLive = React.useCallback(async () => {
    if (!user || !profile) return;
    setWorking(true);
    try {
      await setDoc(
        doc(db, COLLECTIONS.presence, user.uid),
        {
          providerId: user.uid,
          online: true,
          busy: false,
          conditions: profile.conditions ?? [],
          lastSeenAt: Date.now(),
          updatedAt: Date.now(),
        },
        { merge: true },
      );
      setOnline(true);
    } finally {
      setWorking(false);
    }
  }, [user, profile]);

  const goOffline = React.useCallback(async () => {
    if (!user) return;
    setWorking(true);
    try {
      await setDoc(
        doc(db, COLLECTIONS.presence, user.uid),
        { online: false, updatedAt: Date.now() },
        { merge: true },
      );
      setOnline(false);
    } finally {
      setWorking(false);
    }
  }, [user]);

  const value: PresenceValue = {
    online,
    busy,
    canGoLive: profile?.status === "approved",
    working,
    goLive,
    goOffline,
  };

  return (
    <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>
  );
}

export function usePresence() {
  const ctx = React.useContext(PresenceContext);
  if (!ctx) throw new Error("usePresence must be used within a PresenceProvider");
  return ctx;
}
