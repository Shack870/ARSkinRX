"use client";

import * as React from "react";
import { doc, setDoc } from "firebase/firestore";
import { Radio, Loader2 } from "lucide-react";
import { db } from "@/lib/firebase/client";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { useAuth } from "@/lib/auth-context";
import { useProviderProfile } from "@/lib/hooks";
import { Card } from "@/components/ui/card";

const HEARTBEAT_MS = 20_000;

/**
 * "Go Live" presence toggle for nurses. While on, it writes a heartbeat so the
 * provider appears in the real-time matching pool. Only approved providers can
 * go live.
 */
export function GoLiveToggle() {
  const { user } = useAuth();
  const { profile } = useProviderProfile(user?.uid);
  const [online, setOnline] = React.useState(false);
  const [working, setWorking] = React.useState(false);

  const writePresence = React.useCallback(
    async (isOnline: boolean) => {
      if (!user || !profile) return;
      await setDoc(
        doc(db, COLLECTIONS.presence, user.uid),
        {
          providerId: user.uid,
          online: isOnline,
          busy: false,
          conditions: profile.conditions ?? [],
          lastSeenAt: Date.now(),
          updatedAt: Date.now(),
        },
        { merge: true },
      );
    },
    [user, profile],
  );

  // Heartbeat while online. If the tab closes, the heartbeat stops and the
  // provider naturally falls out of the pool once it goes stale (~45s).
  React.useEffect(() => {
    if (!online || !user) return;
    const id = setInterval(() => {
      setDoc(
        doc(db, COLLECTIONS.presence, user.uid),
        { lastSeenAt: Date.now() },
        { merge: true },
      ).catch(() => {});
    }, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [online, user]);

  // Best effort: go offline when leaving the page/unmounting.
  React.useEffect(() => {
    return () => {
      if (online && user) {
        setDoc(
          doc(db, COLLECTIONS.presence, user.uid),
          { online: false, updatedAt: Date.now() },
          { merge: true },
        ).catch(() => {});
      }
    };
  }, [online, user]);

  async function toggle() {
    if (!profile || profile.status !== "approved") return;
    setWorking(true);
    try {
      const next = !online;
      await writePresence(next);
      setOnline(next);
    } finally {
      setWorking(false);
    }
  }

  const disabled = !profile || profile.status !== "approved";

  return (
    <Card
      className={
        "p-5 transition-colors " +
        (online ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "")
      }
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)]">
            <Radio className="h-5 w-5" />
            {online && (
              <span className="absolute -right-0.5 -top-0.5 h-3 w-3 animate-ping rounded-full bg-emerald-400" />
            )}
          </span>
          <div>
            <p className="font-semibold">
              {online ? "You're live" : "Take real-time bookings"}
            </p>
            <p className="text-sm text-[var(--muted-foreground)]">
              {online
                ? "Patients can connect with you instantly."
                : disabled
                  ? "Approval required before you can go live."
                  : "Go live to accept No-Wait visits right now."}
            </p>
          </div>
        </div>
        <button
          onClick={toggle}
          disabled={disabled || working}
          aria-pressed={online}
          className={
            "relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 " +
            (online ? "bg-[var(--primary)]" : "bg-[var(--border)]")
          }
        >
          <span
            className={
              "inline-flex h-6 w-6 transform items-center justify-center rounded-full bg-white shadow transition-transform " +
              (online ? "translate-x-7" : "translate-x-1")
            }
          >
            {working && <Loader2 className="h-3 w-3 animate-spin text-[var(--primary)]" />}
          </span>
        </button>
      </div>
    </Card>
  );
}
