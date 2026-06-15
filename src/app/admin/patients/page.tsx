"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, Search } from "lucide-react";
import { authedFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/datetime";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface Patient {
  uid: string;
  displayName: string;
  email: string;
  phone: string;
  createdAt: number;
}

export default function AdminPatientsPage() {
  const [patients, setPatients] = React.useState<Patient[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [q, setQ] = React.useState("");

  React.useEffect(() => {
    authedFetch("/api/admin/patients")
      .then((r) => r.json())
      .then((d) => setPatients(d.patients ?? []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = patients.filter((p) => {
    const s = q.toLowerCase();
    return (
      p.displayName.toLowerCase().includes(s) ||
      p.email.toLowerCase().includes(s) ||
      p.phone.includes(q)
    );
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Patients</h1>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
        <Input
          placeholder="Search by name, email, or phone"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card className="p-6">
        {loading ? (
          <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--muted-foreground)]">
            {patients.length === 0 ? "No patients yet." : "No matches."}
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {filtered.map((p) => (
              <li key={p.uid}>
                <Link
                  href={`/admin/patients/${p.uid}`}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium hover:text-[var(--primary)]">
                      {p.displayName}
                    </p>
                    <p className="truncate text-sm text-[var(--muted-foreground)]">
                      {p.email}
                      {p.phone ? ` · ${p.phone}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-[var(--muted-foreground)]">
                    Joined {formatDate(p.createdAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
