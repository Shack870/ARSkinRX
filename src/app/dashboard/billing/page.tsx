"use client";

import Link from "next/link";
import { Receipt } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useClientPayments } from "@/lib/hooks";
import { formatDate } from "@/lib/datetime";
import { formatCurrency } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SkeletonRows } from "@/components/ui/skeleton";

export default function BillingPage() {
  const { user } = useAuth();
  const { payments, loading } = useClientPayments(user?.uid);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-[var(--muted-foreground)]">
          Your payment history and receipts.
        </p>
      </div>

      <Card className="p-6">
        {loading ? (
          <SkeletonRows rows={3} />
        ) : payments.length === 0 ? (
          <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] py-10 text-center">
            <Receipt className="mx-auto h-8 w-8 text-[var(--muted-foreground)]" />
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              No payments yet.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {payments.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div>
                  <Link
                    href={`/dashboard/appointments/${p.appointmentId}`}
                    className="font-medium hover:text-[var(--primary)]"
                  >
                    Visit payment
                  </Link>
                  <p className="text-sm text-[var(--muted-foreground)]">
                    {formatDate(p.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {p.status === "refunded" ? (
                    <Badge variant="danger">Refunded</Badge>
                  ) : p.status === "partially_refunded" ? (
                    <Badge variant="warning">Partial refund</Badge>
                  ) : (
                    <Badge variant="success">Paid</Badge>
                  )}
                  <span className="font-medium">
                    {formatCurrency(p.amountCents)}
                    {p.refundedCents > 0 && (
                      <span className="ml-1 text-xs text-[var(--accent)]">
                        (−{formatCurrency(p.refundedCents)})
                      </span>
                    )}
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
