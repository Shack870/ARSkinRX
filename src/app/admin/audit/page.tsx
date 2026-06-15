"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { authedFetch } from "@/lib/api-client";
import { formatDateTime } from "@/lib/datetime";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface LogEntry {
  id: string;
  actor: string;
  action: string;
  targetType: string;
  targetId: string;
  meta: Record<string, unknown> | null;
  timestamp: number;
}

export default function AdminAuditPage() {
  const [logs, setLogs] = React.useState<LogEntry[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    authedFetch("/api/admin/audit")
      .then((r) => r.json())
      .then((d) => setLogs(d.logs ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-[var(--muted-foreground)]">
          A record of sensitive actions across the platform.
        </p>
      </div>

      <Card className="p-6">
        {loading ? (
          <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
        ) : logs.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--muted-foreground)]">
            No activity recorded yet.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {logs.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">
                    <Badge variant="primary" className="mr-2">
                      {l.action}
                    </Badge>
                    <span className="text-[var(--muted-foreground)]">
                      {l.targetType}/{l.targetId.slice(0, 8)}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                    by {l.actor}
                    {l.meta ? ` · ${JSON.stringify(l.meta)}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-[var(--muted-foreground)]">
                  {l.timestamp ? formatDateTime(l.timestamp) : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
