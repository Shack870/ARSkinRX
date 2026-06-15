"use client";

import { Wallet } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useProviderAppointments } from "@/lib/hooks";
import { SERVICE_MAP } from "@/lib/services";
import { formatDate } from "@/lib/datetime";
import { formatCurrency } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LiveBadge } from "@/components/live/live-badge";

export default function EarningsPage() {
  const { user } = useAuth();
  const { appointments } = useProviderAppointments(user?.uid);

  const completed = appointments.filter((a) => a.status === "completed");
  const net = (cents: number, fee: number) => cents - fee;

  const paidOut = completed
    .filter((a) => a.providerPaidAt)
    .reduce((s, a) => s + net(a.priceCents, a.platformFeeCents), 0);
  const pending = completed
    .filter((a) => !a.providerPaidAt)
    .reduce((s, a) => s + net(a.priceCents, a.platformFeeCents), 0);
  const lifetime = paidOut + pending;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Earnings</h1>
        <p className="text-[var(--muted-foreground)]">
          Your visit income and payout status.
        </p>
      </div>

      <Card className="p-6">
        <div className="flex items-start gap-3">
          <Wallet className="mt-0.5 h-5 w-5 text-[var(--primary)]" />
          <div>
            <h2 className="font-semibold">How payouts work</h2>
            <p className="text-sm text-[var(--muted-foreground)]">
              ARSkinRX issues your payouts directly and marks them here once
              sent — you&apos;ll get a confirmation by email/text each time. No
              bank setup needed for now.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Lifetime (net)" value={formatCurrency(lifetime)} />
        <Stat label="Paid out" value={formatCurrency(paidOut)} />
        <Stat label="Pending payout" value={formatCurrency(pending)} highlight />
        <Stat label="Completed visits" value={String(completed.length)} />
      </div>

      <Card className="p-6">
        <h2 className="mb-4 font-semibold">Visit history</h2>
        {completed.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">
            No completed visits yet.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {completed
              .slice()
              .reverse()
              .map((a) => (
                <li key={a.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="flex items-center gap-2 font-medium">
                      {SERVICE_MAP[a.serviceId]?.name ?? a.serviceId}
                      {a.isLive && <LiveBadge />}
                    </p>
                    <p className="text-sm text-[var(--muted-foreground)]">
                      {formatDate(a.start)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {a.providerPaidAt ? (
                      <Badge variant="success">Paid</Badge>
                    ) : (
                      <Badge variant="warning">Pending</Badge>
                    )}
                    <span className="font-medium text-[var(--primary)]">
                      +{formatCurrency(net(a.priceCents, a.platformFeeCents))}
                    </span>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <Card className="p-4">
      <p
        className={
          "text-2xl font-semibold tracking-tight " +
          (highlight ? "text-[var(--primary)]" : "")
        }
      >
        {value}
      </p>
      <p className="text-xs text-[var(--muted-foreground)]">{label}</p>
    </Card>
  );
}
