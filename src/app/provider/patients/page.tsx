"use client";

import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronRight, Search, Users } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { authedFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/datetime";
import { SERVICE_MAP } from "@/lib/services";
import type { ProviderPatientSummary } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDob } from "./_components/format-dob";

export default function ProviderPatientsPage() {
  return (
    <Suspense>
      <PatientsList />
    </Suspense>
  );
}

function PatientsList() {
  const { user, isAdmin } = useAuth();
  const search = useSearchParams();
  const providerId = isAdmin ? search.get("providerId") : null;
  const [patients, setPatients] = React.useState<ProviderPatientSummary[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");

  React.useEffect(() => {
    if (!user) return;
    let active = true;
    const qs = providerId ? `?providerId=${encodeURIComponent(providerId)}` : "";
    authedFetch(`/api/provider/patients${qs}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d?.error || "Couldn't load patients");
        return d.patients as ProviderPatientSummary[];
      })
      .then((list) => {
        if (active) setPatients(list);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : "Couldn't load patients");
      });
    return () => {
      active = false;
    };
  }, [user, providerId]);

  const needle = q.trim().toLowerCase();
  const digits = needle.replace(/\D/g, "");
  const filtered = (patients ?? []).filter((p) => {
    if (!needle) return true;
    return (
      p.displayName.toLowerCase().includes(needle) ||
      p.email.toLowerCase().includes(needle) ||
      (digits.length > 0 && p.phone.replace(/\D/g, "").includes(digits))
    );
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Patients</h1>
        <p className="text-[var(--muted-foreground)]">
          Everyone you&apos;ve seen, with their visit history and notes.
        </p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, email or phone"
          className="pl-9"
          aria-label="Search patients"
        />
      </div>

      <Card className="p-0">
        {error ? (
          <p className="py-10 text-center text-sm text-[var(--accent)]">{error}</p>
        ) : patients === null ? (
          <ul className="divide-y divide-[var(--border)]">
            {Array.from({ length: 4 }).map((_, i) => (
              <li key={i} className="flex items-center gap-4 px-5 py-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-4 w-24" />
              </li>
            ))}
          </ul>
        ) : filtered.length === 0 ? (
          <div className="py-14 text-center">
            <Users className="mx-auto h-8 w-8 text-[var(--muted-foreground)]" />
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              {patients.length === 0
                ? "No patients yet. Once you complete a visit, the patient shows up here."
                : "No patients match your search."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {filtered.map((p) => (
              <li key={p.uid}>
                <Link
                  href={`/provider/patients/${p.uid}`}
                  className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-[var(--muted)]"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-sm font-semibold text-[var(--primary)]">
                    {initials(p.displayName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.displayName}</p>
                    <p className="truncate text-sm text-[var(--muted-foreground)]">
                      {[
                        p.dob ? `DOB ${formatDob(p.dob)}${p.age !== null ? ` (${p.age})` : ""}` : null,
                        p.phone || null,
                        p.email || null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="hidden text-right text-sm sm:block">
                    <p className="font-medium">
                      {p.visitCount} visit{p.visitCount === 1 ? "" : "s"}
                    </p>
                    <p className="text-[var(--muted-foreground)]">
                      {p.lastVisitAt ? (
                        <>
                          {formatDate(p.lastVisitAt)}
                          {p.lastServiceId && SERVICE_MAP[p.lastServiceId]
                            ? ` · ${SERVICE_MAP[p.lastServiceId].name}`
                            : ""}
                        </>
                      ) : (
                        "—"
                      )}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}
