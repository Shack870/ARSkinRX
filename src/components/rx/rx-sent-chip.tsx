"use client";

import * as React from "react";
import { Loader2, Send } from "lucide-react";
import { authedFetch } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { Prescription } from "@/lib/types";

/**
 * Compact prescription state for an appointment row: "Rx unsent" until the
 * prescriber taps Mark sent, then "Rx sent". Renders nothing when the visit
 * has no prescription. `canMarkSent` should be true only for admins (the
 * server rejects everyone else).
 */
export function RxSentChip({
  prescriptions,
  canMarkSent,
}: {
  prescriptions: Prescription[] | undefined;
  canMarkSent: boolean;
}) {
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  if (!prescriptions || prescriptions.length === 0) return null;

  const active = prescriptions.filter((p) => p.status !== "declined");
  const approved = active.filter((p) => p.status === "approved");
  const awaiting = active.filter((p) => p.status === "recommended");

  if (active.length === 0) return <Badge variant="default">Rx declined</Badge>;
  if (active.every((p) => p.status === "sent")) {
    return <Badge variant="success">Rx sent</Badge>;
  }

  async function markSent() {
    setBusy(true);
    try {
      for (const p of approved) {
        const res = await authedFetch(`/api/admin/prescriptions/${p.id}`, {
          method: "PATCH",
          body: JSON.stringify({ action: "sent" }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || "Couldn't mark as sent.");
        }
      }
      toast.success("Marked sent to pharmacy");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't mark as sent.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Badge variant="warning">
        {approved.length > 0 ? "Rx unsent" : "Rx awaiting review"}
      </Badge>
      {canMarkSent && approved.length > 0 && (
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void markSent();
          }}
          disabled={busy}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Mark sent
        </Button>
      )}
      {awaiting.length > 0 && approved.length === 0 && canMarkSent && (
        <a href="/admin/prescriptions" className="text-xs text-[var(--primary)] underline">
          Review
        </a>
      )}
    </span>
  );
}
