"use client";

import * as React from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { COLLECTIONS } from "@/lib/firebase/collections";

const PRESENCE_TTL_MS = 25_000;

/** Live: is the other party currently heartbeating in this visit's room? */
export function usePeerPresence(
  appointmentId: string | undefined,
  peer: "client" | "provider",
  enabled = true,
) {
  const [lastSeen, setLastSeen] = React.useState(0);
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (!appointmentId || !enabled) return;
    const unsub = onSnapshot(
      doc(db, COLLECTIONS.signaling, appointmentId),
      (snap) => setLastSeen(snap.get(`presence.${peer}`) ?? 0),
      () => {},
    );
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => {
      unsub();
      clearInterval(t);
    };
  }, [appointmentId, peer, enabled]);

  return enabled && now - lastSeen < PRESENCE_TTL_MS;
}

/** Pulsing "waiting" pill for schedule rows. Renders nothing when absent. */
export function WaitingBadge({
  appointmentId,
  peer,
  enabled = true,
}: {
  appointmentId: string;
  peer: "client" | "provider";
  enabled?: boolean;
}) {
  const present = usePeerPresence(appointmentId, peer, enabled);
  if (!present) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" />
      </span>
      {peer === "client" ? "Patient waiting" : "Nurse is in the room"}
    </span>
  );
}
