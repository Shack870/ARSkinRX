"use client";

import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CalendarPlus, Check, Loader2, UserPlus, UserCheck } from "lucide-react";
import { authedFetch } from "@/lib/api-client";
import { SERVICES, SERVICE_MAP } from "@/lib/services";
import { formatCurrency } from "@/lib/utils";
import { formatRelativeDay, formatTime } from "@/lib/datetime";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ServiceType } from "@/lib/types";

interface ProviderRow {
  uid: string;
  displayName: string;
  conditions: ServiceType[];
  status: string;
}
interface Slot {
  start: number;
  end: number;
}
interface FoundPatient {
  uid: string;
  displayName: string;
  phone: string;
  role: string;
}

const selectCls =
  "flex h-11 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-sm outline-none focus-visible:border-[var(--ring)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]/30";

export default function NewAppointmentPage() {
  return (
    <Suspense>
      <NewAppointmentInner />
    </Suspense>
  );
}

function NewAppointmentInner() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();

  // Patient
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [found, setFound] = React.useState<FoundPatient | null | undefined>(undefined);
  const [looking, setLooking] = React.useState(false);

  // Visit
  const [providers, setProviders] = React.useState<ProviderRow[]>([]);
  const [providerId, setProviderId] = React.useState(params.get("provider") ?? "");
  const [serviceId, setServiceId] = React.useState<ServiceType | "">("");
  const [priceMap, setPriceMap] = React.useState<Record<string, number>>({});

  // Time
  const [mode, setMode] = React.useState<"slots" | "custom">("slots");
  const [slots, setSlots] = React.useState<Slot[]>([]);
  const [start, setStart] = React.useState<number | null>(null);
  const [custom, setCustom] = React.useState("");

  // Payment
  const [payment, setPayment] = React.useState<"offline" | "comp">("offline");
  const [amount, setAmount] = React.useState("");
  const [note, setNote] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    authedFetch("/api/admin/providers")
      .then((r) => r.json())
      .then((d) =>
        setProviders(
          (d.providers ?? []).filter((p: ProviderRow) => p.status === "approved"),
        ),
      )
      .catch(() => {});
    fetch("/api/services")
      .then((r) => r.json())
      .then((d) => {
        const m: Record<string, number> = {};
        for (const s of d.services ?? []) m[s.id] = s.defaultPriceCents;
        setPriceMap(m);
      })
      .catch(() => {});
  }, []);

  // Debounced patient lookup by email (all state updates happen in callbacks).
  React.useEffect(() => {
    const e = email.trim().toLowerCase();
    const valid = /^\S+@\S+\.\S+$/.test(e);
    const t = setTimeout(
      () => {
        if (!valid) {
          setFound(undefined);
          return;
        }
        setLooking(true);
        authedFetch(`/api/admin/patients?email=${encodeURIComponent(e)}`)
          .then((r) => r.json())
          .then((d) => {
            setFound(d.patient ?? null);
            if (d.patient) {
              setName((n) => n || d.patient.displayName);
              setPhone((p) => p || d.patient.phone);
            }
          })
          .catch(() => setFound(null))
          .finally(() => setLooking(false));
      },
      valid ? 400 : 0,
    );
    return () => clearTimeout(t);
  }, [email]);

  const provider = providers.find((p) => p.uid === providerId);
  const services = SERVICES.filter(
    (s) => !provider || provider.conditions.includes(s.id),
  );
  const listPrice = serviceId ? priceMap[serviceId] ?? SERVICE_MAP[serviceId].defaultPriceCents : 0;

  function chooseService(id: ServiceType | "") {
    setServiceId(id);
    setStart(null);
    if (id) {
      const p = priceMap[id] ?? SERVICE_MAP[id].defaultPriceCents;
      setAmount((p / 100).toFixed(2));
    }
  }

  // Load open slots. `slotsFor` records which provider/service the loaded
  // slots belong to, so "loading" is derived rather than set in the effect.
  const slotsKey = providerId && serviceId ? `${providerId}:${serviceId}` : "";
  const [slotsFor, setSlotsFor] = React.useState("");
  React.useEffect(() => {
    if (!slotsKey) return;
    const [pid, sid] = slotsKey.split(":");
    let cancelled = false;
    fetch(`/api/slots?providerId=${pid}&serviceId=${sid}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setSlots(d.slots ?? []);
        setSlotsFor(slotsKey);
      })
      .catch(() => {
        if (cancelled) return;
        setSlots([]);
        setSlotsFor(slotsKey);
      });
    return () => {
      cancelled = true;
    };
  }, [slotsKey]);
  const loadingSlots = !!slotsKey && slotsFor !== slotsKey;

  const effectiveStart =
    mode === "custom" ? (custom ? new Date(custom).getTime() : null) : start;

  const canSubmit =
    /^\S+@\S+\.\S+$/.test(email) &&
    (found ? true : name.trim().length >= 2) &&
    !!providerId &&
    !!serviceId &&
    !!effectiveStart &&
    Number.isFinite(effectiveStart) &&
    !submitting;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !effectiveStart) return;
    setSubmitting(true);
    try {
      const res = await authedFetch("/api/admin/appointments", {
        method: "POST",
        body: JSON.stringify({
          clientEmail: email.trim(),
          clientName: name.trim(),
          clientPhone: phone.trim(),
          providerId,
          serviceId,
          start: effectiveStart,
          payment,
          amountCents:
            payment === "offline" ? Math.round(parseFloat(amount || "0") * 100) : 0,
          note,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not book.");
      toast.success(
        "Visit booked",
        data.clientCreated
          ? "New patient account created; they'll get a confirmation email."
          : "Confirmation email sent to the patient.",
      );
      router.push(`/admin/appointments/${data.appointmentId}`);
    } catch (err) {
      toast.error("Booking failed", err instanceof Error ? err.message : "Try again.");
      setSubmitting(false);
    }
  }

  const slotsByDay = React.useMemo(() => {
    const m = new Map<string, Slot[]>();
    for (const s of slots) {
      const k = formatRelativeDay(s.start);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(s);
    }
    return Array.from(m.entries());
  }, [slots]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/admin/appointments"
        className="inline-flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
      >
        <ArrowLeft className="h-4 w-4" /> Appointments
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New appointment</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Book on a patient&apos;s behalf — phone bookings, comps, or payments
          collected outside the app.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-6">
        {/* Patient */}
        <Card className="p-6">
          <h2 className="font-semibold">Patient</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="patient@example.com"
                autoComplete="off"
              />
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
                {looking ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" /> Looking up…
                  </>
                ) : found ? (
                  <>
                    <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
                    Existing patient: <strong>{found.displayName}</strong>
                    {found.role !== "client" && (
                      <span className="text-amber-700">
                        {" "}
                        (this is a {found.role} account)
                      </span>
                    )}
                  </>
                ) : found === null ? (
                  <>
                    <UserPlus className="h-3.5 w-3.5 text-[var(--primary)]" />
                    New patient — an account will be created and they&apos;ll be
                    invited to set a password.
                  </>
                ) : (
                  "We'll match an existing patient or create a new account."
                )}
              </p>
            </div>
            <div>
              <Label htmlFor="name">Full name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!!found}
              />
            </div>
            <div>
              <Label htmlFor="phone">Phone (optional)</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={!!found}
              />
            </div>
          </div>
        </Card>

        {/* Visit */}
        <Card className="p-6">
          <h2 className="font-semibold">Visit</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="provider">Nurse</Label>
              <select
                id="provider"
                className={selectCls}
                value={providerId}
                onChange={(e) => {
                  setProviderId(e.target.value);
                  chooseService("");
                }}
              >
                <option value="">Select a nurse…</option>
                {providers.map((p) => (
                  <option key={p.uid} value={p.uid}>
                    {p.displayName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="service">Service</Label>
              <select
                id="service"
                className={selectCls}
                value={serviceId}
                onChange={(e) => chooseService(e.target.value as ServiceType | "")}
                disabled={!providerId}
              >
                <option value="">Select a service…</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {formatCurrency(priceMap[s.id] ?? s.defaultPriceCents)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        {/* Time */}
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Time</h2>
            <div className="flex rounded-[var(--radius-md)] border border-[var(--border)] p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setMode("slots")}
                className={`rounded-[6px] px-3 py-1.5 ${mode === "slots" ? "bg-[var(--primary)] text-white" : "text-[var(--muted-foreground)]"}`}
              >
                Open slots
              </button>
              <button
                type="button"
                onClick={() => setMode("custom")}
                className={`rounded-[6px] px-3 py-1.5 ${mode === "custom" ? "bg-[var(--primary)] text-white" : "text-[var(--muted-foreground)]"}`}
              >
                Custom time
              </button>
            </div>
          </div>

          {mode === "slots" ? (
            <div className="mt-4">
              {!providerId || !serviceId ? (
                <p className="text-sm text-[var(--muted-foreground)]">
                  Pick a nurse and service to see open times.
                </p>
              ) : loadingSlots ? (
                <Loader2 className="h-5 w-5 animate-spin text-[var(--primary)]" />
              ) : slots.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)]">
                  No open times in the next two weeks. Use a custom time instead.
                </p>
              ) : (
                <div className="space-y-4">
                  {slotsByDay.map(([day, list]) => (
                    <div key={day}>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                        {day}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {list.map((s) => {
                          const active = start === s.start;
                          return (
                            <button
                              key={s.start}
                              type="button"
                              onClick={() => setStart(s.start)}
                              className={`rounded-[var(--radius-md)] border px-3 py-1.5 text-sm ${
                                active
                                  ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                                  : "border-[var(--border)] hover:border-[var(--primary)]"
                              }`}
                            >
                              {formatTime(s.start)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="mt-4">
              <Label htmlFor="custom">Date &amp; time</Label>
              <Input
                id="custom"
                type="datetime-local"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
              />
              <p className="mt-1.5 text-xs text-[var(--muted-foreground)]">
                Outside the nurse&apos;s posted hours is allowed; the time is still
                checked for conflicts with her other visits.
              </p>
            </div>
          )}
        </Card>

        {/* Payment */}
        <Card className="p-6">
          <h2 className="font-semibold">Payment</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <PayOption
              active={payment === "offline"}
              onClick={() => setPayment("offline")}
              title="Collected offline"
              desc="Paid by phone, card reader, Zelle, etc. Counts toward revenue and the nurse's payout."
            />
            <PayOption
              active={payment === "comp"}
              onClick={() => setPayment("comp")}
              title="Complimentary"
              desc="No charge. Recorded as $0 so reports stay accurate."
            />
          </div>
          {payment === "offline" && (
            <div className="mt-4 max-w-xs">
              <Label htmlFor="amount">Amount collected</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted-foreground)]">
                  $
                </span>
                <Input
                  id="amount"
                  inputMode="decimal"
                  className="pl-7"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              {serviceId && (
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                  List price {formatCurrency(listPrice)}. Nurse receives 50%.
                </p>
              )}
            </div>
          )}
          <div className="mt-4">
            <Label htmlFor="note">Note for the nurse (optional)</Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Reason for visit, anything mentioned on the phone…"
            />
          </div>
        </Card>

        <div className="flex items-center justify-end gap-3">
          <Link href="/admin/appointments">
            <Button type="button" variant="ghost">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={!canSubmit}>
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CalendarPlus className="h-4 w-4" />
            )}
            Book visit
          </Button>
        </div>
      </form>
    </div>
  );
}

function PayOption({
  active,
  onClick,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-start gap-3 rounded-[var(--radius-md)] border p-3 text-left ${
        active
          ? "border-[var(--primary)] bg-[var(--primary-soft)]/50"
          : "border-[var(--border)] hover:border-[var(--primary)]/50"
      }`}
    >
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
          active ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[var(--border)]"
        }`}
      >
        {active && <Check className="h-3 w-3" />}
      </span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-[var(--muted-foreground)]">{desc}</span>
      </span>
    </button>
  );
}
