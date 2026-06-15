"use client";

import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, Star } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Steps } from "@/components/ui/steps";
import { HoldTimer } from "@/components/hold-timer";
import { LiveConnectCard } from "@/components/live/live-connect-card";
import { useAuth } from "@/lib/auth-context";
import { authedFetch } from "@/lib/api-client";
import { uploadIntakePhoto } from "@/lib/storage";
import { SERVICES, getServiceBySlug, getService } from "@/lib/services";
import { formatCurrency } from "@/lib/utils";
import { formatRelativeDay, formatTime } from "@/lib/datetime";
import type { ServiceType } from "@/lib/types";

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const STEP_LABELS = ["Service", "Provider", "Intake", "Time", "Pay"];

interface PublicProvider {
  uid: string;
  displayName: string;
  bio: string;
  photoURL?: string | null;
  conditions: ServiceType[];
  ratingAvg: number;
  ratingCount: number;
  priceCents: number;
}

interface Slot {
  start: number;
  end: number;
}

export default function BookPage() {
  return (
    <Suspense>
      <BookInner />
    </Suspense>
  );
}

function BookInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, loading: authLoading } = useAuth();

  const initialService = params.get("service")
    ? getServiceBySlug(params.get("service")!)?.id ?? null
    : null;

  const [step, setStep] = React.useState(initialService ? 1 : 0);
  const [serviceId, setServiceId] = React.useState<ServiceType | null>(
    initialService,
  );
  const [catalog, setCatalog] =
    React.useState<(typeof SERVICES[number] & { enabled?: boolean })[]>(SERVICES);

  React.useEffect(() => {
    fetch("/api/services")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.services) && d.services.length) setCatalog(d.services);
      })
      .catch(() => {});
  }, []);
  const [providers, setProviders] = React.useState<PublicProvider[]>([]);
  const [provider, setProvider] = React.useState<PublicProvider | null>(null);
  const [slots, setSlots] = React.useState<Slot[]>([]);
  const [slot, setSlot] = React.useState<Slot | null>(null);
  const [loadingProviders, setLoadingProviders] = React.useState(false);
  const [loadingSlots, setLoadingSlots] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [creatingHold, setCreatingHold] = React.useState(false);
  const [appointmentId, setAppointmentId] = React.useState<string | null>(null);
  const [holdExpiresAt, setHoldExpiresAt] = React.useState<number | null>(null);
  const [holdExpired, setHoldExpired] = React.useState(false);
  const heldSlotRef = React.useRef<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [intake, setIntake] = React.useState({
    concern: "",
    duration: "",
    medications: "",
    allergies: "",
    pregnant: "",
  });
  const [photoPaths, setPhotoPaths] = React.useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = React.useState(false);
  const [liveAvailable, setLiveAvailable] = React.useState(false);
  const [livePriceCents, setLivePriceCents] = React.useState(7500);
  const [startingLive, setStartingLive] = React.useState(false);

  const service = serviceId ? getService(serviceId) : null;

  // Load providers when entering the provider step.
  React.useEffect(() => {
    if (step !== 1 || !serviceId) return;
    setLoadingProviders(true);
    fetch(`/api/providers?serviceId=${serviceId}`)
      .then((r) => r.json())
      .then((d) => setProviders(d.providers ?? []))
      .finally(() => setLoadingProviders(false));
  }, [step, serviceId]);

  // Re-check live availability on the provider and time steps.
  React.useEffect(() => {
    if (!serviceId || (step !== 1 && step !== 3)) return;
    fetch(`/api/live/availability?serviceId=${serviceId}`)
      .then((r) => r.json())
      .then((d) => {
        setLiveAvailable(!!d.available);
        if (d.realtimePriceCents) setLivePriceCents(d.realtimePriceCents);
      })
      .catch(() => setLiveAvailable(false));
  }, [step, serviceId]);

  // Load slots when entering the time step.
  React.useEffect(() => {
    if (step !== 3 || !provider || !serviceId) return;
    setLoadingSlots(true);
    fetch(`/api/slots?providerId=${provider.uid}&serviceId=${serviceId}`)
      .then((r) => r.json())
      .then((d) => setSlots(d.slots ?? []))
      .finally(() => setLoadingSlots(false));
  }, [step, provider, serviceId]);

  function next() {
    setError(null);
    setStep((s) => Math.min(s + 1, STEP_LABELS.length - 1));
  }
  async function back() {
    setError(null);
    // Leaving the Pay step backward releases the held slot.
    if (step === 4 && appointmentId && !holdExpired) {
      await releaseHold();
    }
    setStep((s) => Math.max(s - 1, 0));
  }

  async function releaseHold() {
    const id = appointmentId;
    setAppointmentId(null);
    setHoldExpiresAt(null);
    setHoldExpired(false);
    heldSlotRef.current = null;
    if (id) {
      try {
        await authedFetch(`/api/appointments/${id}/cancel-hold`, {
          method: "POST",
        });
      } catch {
        // best effort — it will also expire on its own
      }
    }
  }

  async function handlePhotos(files: FileList | null) {
    if (!files || !user) return;
    setUploadingPhoto(true);
    setError(null);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        if (file.size > 15 * 1024 * 1024) {
          setError("Photos must be under 15 MB.");
          continue;
        }
        uploaded.push(await uploadIntakePhoto(user.uid, file));
      }
      setPhotoPaths((p) => [...p, ...uploaded]);
    } catch {
      setError("Couldn't upload a photo. Please try again.");
    } finally {
      setUploadingPhoto(false);
    }
  }

  function removePhoto(i: number) {
    setPhotoPaths((p) => p.filter((_, idx) => idx !== i));
  }

  // Reserve the slot (creates a 15-minute hold) then advance to payment.
  async function holdSlotAndContinue() {
    if (!provider || !serviceId || !slot) return;
    // Reuse an existing valid hold for the same slot.
    if (
      appointmentId &&
      heldSlotRef.current === slot.start &&
      !holdExpired
    ) {
      next();
      return;
    }
    if (appointmentId) await releaseHold();

    setCreatingHold(true);
    setError(null);
    try {
      const res = await authedFetch("/api/appointments", {
        method: "POST",
        body: JSON.stringify({
          providerId: provider.uid,
          serviceId,
          start: slot.start,
          intake,
          photoPaths,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not hold this time.");
      setAppointmentId(data.appointmentId);
      setHoldExpiresAt(data.holdExpiresAt);
      setHoldExpired(false);
      heldSlotRef.current = slot.start;
      next();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setCreatingHold(false);
    }
  }

  // No-Wait Live: create the request, take payment, head to the search screen.
  async function startLiveVisit() {
    if (!serviceId) return;
    setStartingLive(true);
    setError(null);
    try {
      const reqRes = await authedFetch("/api/live/request", {
        method: "POST",
        body: JSON.stringify({ serviceId, intake, photoPaths }),
      });
      const reqData = await reqRes.json();
      if (!reqRes.ok)
        throw new Error(reqData.error ?? "No live nurses are available.");

      const coRes = await authedFetch("/api/live/checkout", {
        method: "POST",
        body: JSON.stringify({ liveRequestId: reqData.liveRequestId }),
      });
      const coData = await coRes.json();
      if (!coRes.ok) throw new Error(coData.error ?? "Payment failed.");
      window.location.href = coData.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setStartingLive(false);
    }
  }

  async function confirmAndPay() {
    if (!appointmentId || holdExpired) return;
    setError(null);
    setSubmitting(true);
    try {
      const checkoutRes = await authedFetch("/api/checkout", {
        method: "POST",
        body: JSON.stringify({ appointmentId }),
      });
      const checkout = await checkoutRes.json();
      if (!checkoutRes.ok) throw new Error(checkout.error ?? "Payment failed.");
      window.location.href = checkout.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  // Gate booking behind auth.
  if (authLoading) {
    return (
      <>
        <SiteHeader />
        <main className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
        </main>
      </>
    );
  }
  if (!user) {
    const nextUrl = `/book${serviceId ? `?service=${getService(serviceId)?.slug}` : ""}`;
    return (
      <>
        <SiteHeader />
        <main className="flex flex-1 items-center justify-center bg-[var(--muted)] px-4 py-16">
          <Card className="w-full max-w-md p-8 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">
              Sign in to book
            </h1>
            <p className="mt-2 text-[var(--muted-foreground)]">
              Create an account or log in to schedule your visit.
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <Link href={`/register?next=${encodeURIComponent(nextUrl)}`}>
                <Button className="w-full">Create account</Button>
              </Link>
              <Link href={`/login?next=${encodeURIComponent(nextUrl)}`}>
                <Button variant="outline" className="w-full">
                  Log in
                </Button>
              </Link>
            </div>
          </Card>
        </main>
      </>
    );
  }

  const slotsByDay = groupByDay(slots);

  return (
    <>
      <SiteHeader />
      <main className="flex-1 bg-[var(--muted)]">
        <div className="mx-auto max-w-2xl px-4 py-10">
          <div className="mb-6">
            <Steps steps={STEP_LABELS} current={step} />
          </div>

          {service && step > 0 && (
            <div className="mb-4 flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm">
              <span className="font-medium">{service.name}</span>
              <span className="text-[var(--muted-foreground)]">
                {formatCurrency(provider?.priceCents ?? service.defaultPriceCents)} ·{" "}
                {service.durationMinutes} min
              </span>
            </div>
          )}

          <Card className="p-6">
            {/* Step 0: Service */}
            {step === 0 && (
              <div>
                <h2 className="mb-4 text-lg font-semibold">
                  What can we help with?
                </h2>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {catalog
                    .filter((s) => s.enabled !== false)
                    .map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setServiceId(s.id);
                        setProvider(null);
                        next();
                      }}
                      className="rounded-[var(--radius-md)] border border-[var(--border)] p-4 text-left transition-colors hover:border-[var(--primary)] hover:bg-[var(--primary-soft)]"
                    >
                      <p className="font-medium">{s.name}</p>
                      <p className="text-sm text-[var(--muted-foreground)]">
                        {formatCurrency(s.defaultPriceCents)} · {s.durationMinutes}{" "}
                        min
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 1: Provider */}
            {step === 1 && (
              <div>
                <h2 className="mb-4 text-lg font-semibold">Choose a provider</h2>
                {loadingProviders ? (
                  <Loader2 className="mx-auto my-8 h-6 w-6 animate-spin text-[var(--primary)]" />
                ) : providers.length === 0 ? (
                  <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] py-10 text-center text-sm text-[var(--muted-foreground)]">
                    No providers are accepting {service?.name} visits yet. Please
                    check back soon.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {providers.map((p) => (
                      <div key={p.uid} className="relative">
                      <button
                        onClick={() => {
                          setProvider(p);
                          setSlot(null);
                          next();
                        }}
                        className="flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] p-4 text-left transition-colors hover:border-[var(--primary)] hover:bg-[var(--primary-soft)]"
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--primary-soft)] text-sm font-semibold text-[var(--primary)]">
                          {p.photoURL ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={p.photoURL}
                              alt={p.displayName}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            initials(p.displayName)
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{p.displayName}</p>
                          <p className="line-clamp-2 text-sm text-[var(--muted-foreground)]">
                            {p.bio}
                          </p>
                          {p.ratingCount > 0 && (
                            <span className="mt-1 inline-flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
                              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                              {p.ratingAvg.toFixed(1)} ({p.ratingCount})
                            </span>
                          )}
                        </div>
                        <span className="ml-2 shrink-0 font-medium text-[var(--primary)]">
                          {formatCurrency(p.priceCents)}
                        </span>
                      </button>
                      <Link
                        href={`/providers/${p.uid}`}
                        target="_blank"
                        className="absolute bottom-2 right-4 text-xs text-[var(--muted-foreground)] underline hover:text-[var(--primary)]"
                      >
                        View profile
                      </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Intake */}
            {step === 2 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">Tell us about it</h2>
                <div>
                  <Label htmlFor="concern">
                    What&apos;s your main concern?
                  </Label>
                  <Textarea
                    id="concern"
                    value={intake.concern}
                    onChange={(e) =>
                      setIntake({ ...intake, concern: e.target.value })
                    }
                    placeholder="Describe what you're experiencing…"
                  />
                </div>
                <div>
                  <Label htmlFor="duration">How long has this been going on?</Label>
                  <Input
                    id="duration"
                    value={intake.duration}
                    onChange={(e) =>
                      setIntake({ ...intake, duration: e.target.value })
                    }
                    placeholder="e.g. 3 months"
                  />
                </div>
                <div>
                  <Label htmlFor="medications">Current medications</Label>
                  <Input
                    id="medications"
                    value={intake.medications}
                    onChange={(e) =>
                      setIntake({ ...intake, medications: e.target.value })
                    }
                    placeholder="List any medications, or 'none'"
                  />
                </div>
                <div>
                  <Label htmlFor="allergies">Allergies</Label>
                  <Input
                    id="allergies"
                    value={intake.allergies}
                    onChange={(e) =>
                      setIntake({ ...intake, allergies: e.target.value })
                    }
                    placeholder="List any allergies, or 'none'"
                  />
                </div>
                <div>
                  <Label htmlFor="pregnant">
                    Are you pregnant or breastfeeding?
                  </Label>
                  <select
                    id="pregnant"
                    value={intake.pregnant}
                    onChange={(e) =>
                      setIntake({ ...intake, pregnant: e.target.value })
                    }
                    className="flex h-11 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-sm outline-none focus-visible:border-[var(--ring)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]/30"
                  >
                    <option value="">Select…</option>
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                    <option value="na">Not applicable</option>
                  </select>
                </div>
                <div>
                  <Label>Photos (optional)</Label>
                  <p className="mb-2 text-xs text-[var(--muted-foreground)]">
                    Add clear photos of the area so your provider can prepare.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {photoPaths.map((_, i) => (
                      <div
                        key={i}
                        className="flex h-16 w-16 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--primary-soft)] text-xs text-[var(--primary)]"
                      >
                        <button
                          type="button"
                          onClick={() => removePhoto(i)}
                          className="underline"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] text-2xl text-[var(--muted-foreground)] hover:border-[var(--primary)]">
                      {uploadingPhoto ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        "+"
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        disabled={uploadingPhoto}
                        onChange={(e) => handlePhotos(e.target.files)}
                      />
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Time */}
            {step === 3 && (
              <div>
                <div className="mb-6">
                  <LiveConnectCard
                    providers={providers}
                    available={liveAvailable}
                    priceCents={livePriceCents}
                    starting={startingLive}
                    onStart={startLiveVisit}
                  />
                  <div className="my-5 flex items-center gap-3 text-xs text-[var(--muted-foreground)]">
                    <span className="h-px flex-1 bg-[var(--border)]" />
                    OR SCHEDULE AHEAD
                    <span className="h-px flex-1 bg-[var(--border)]" />
                  </div>
                </div>
                <h2 className="mb-4 text-lg font-semibold">Pick a time</h2>
                {loadingSlots ? (
                  <Loader2 className="mx-auto my-8 h-6 w-6 animate-spin text-[var(--primary)]" />
                ) : slots.length === 0 ? (
                  <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] py-10 text-center text-sm text-[var(--muted-foreground)]">
                    {provider?.displayName} has no open times in the next two
                    weeks. Try another provider.
                  </div>
                ) : (
                  <div className="space-y-5">
                    {slotsByDay.map(([day, daySlots]) => (
                      <div key={day}>
                        <p className="mb-2 text-sm font-medium text-[var(--muted-foreground)]">
                          {day}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {daySlots.map((s) => (
                            <button
                              key={s.start}
                              onClick={() => setSlot(s)}
                              className={
                                "rounded-[var(--radius-md)] border px-3 py-2 text-sm transition-colors " +
                                (slot?.start === s.start
                                  ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
                                  : "border-[var(--border)] hover:border-[var(--primary)]")
                              }
                            >
                              {formatTime(s.start)}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step 4: Pay */}
            {step === 4 && service && provider && slot && (
              <div>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold">Review & pay</h2>
                  {holdExpiresAt && !holdExpired && (
                    <HoldTimer
                      expiresAt={holdExpiresAt}
                      onExpire={() => setHoldExpired(true)}
                    />
                  )}
                </div>
                {holdExpired && (
                  <div className="mb-4 rounded-[var(--radius-md)] bg-[var(--accent-soft)] p-4 text-sm text-[var(--accent)]">
                    <p className="font-medium">Your 15-minute hold expired.</p>
                    <p className="mt-1">
                      We released the time so someone else could book it. Pick a
                      new time to continue.
                    </p>
                    <Button
                      variant="accent"
                      size="sm"
                      className="mt-3"
                      onClick={async () => {
                        await releaseHold();
                        setSlot(null);
                        setStep(3);
                      }}
                    >
                      Pick a new time
                    </Button>
                  </div>
                )}
                <dl className="space-y-3 rounded-[var(--radius-md)] bg-[var(--muted)] p-4 text-sm">
                  <Row label="Service" value={service.name} />
                  <Row label="Provider" value={provider.displayName} />
                  <Row
                    label="When"
                    value={`${formatRelativeDay(slot.start)} at ${formatTime(slot.start)}`}
                  />
                  <div className="border-t border-[var(--border)] pt-3">
                    <Row
                      label="Total"
                      value={formatCurrency(provider.priceCents)}
                      bold
                    />
                  </div>
                </dl>
                <p className="mt-4 text-xs text-[var(--muted-foreground)]">
                  By booking you agree to our{" "}
                  <Link href="/legal/terms" className="underline" target="_blank">
                    Terms
                  </Link>{" "}
                  and{" "}
                  <Link
                    href="/legal/consent"
                    className="underline"
                    target="_blank"
                  >
                    telehealth consent
                  </Link>
                  . Free reschedule if you miss your window; no refunds within 48
                  hours of the visit.
                </p>
              </div>
            )}

            {error && (
              <p className="mt-4 rounded-[var(--radius-md)] bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--accent)]">
                {error}
              </p>
            )}

            {/* Nav */}
            <div className="mt-8 flex items-center justify-between">
              {step > 0 ? (
                <Button variant="ghost" onClick={back} disabled={submitting}>
                  <ArrowLeft className="h-4 w-4" /> Back
                </Button>
              ) : (
                <span />
              )}
              {step === 2 && (
                <Button onClick={next} disabled={!intake.concern.trim()}>
                  Continue <ArrowRight className="h-4 w-4" />
                </Button>
              )}
              {step === 3 && (
                <Button
                  onClick={holdSlotAndContinue}
                  disabled={!slot || creatingHold}
                >
                  {creatingHold && <Loader2 className="h-4 w-4 animate-spin" />}
                  Continue <ArrowRight className="h-4 w-4" />
                </Button>
              )}
              {step === 4 && (
                <Button
                  onClick={confirmAndPay}
                  disabled={submitting || holdExpired}
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Confirm & pay {provider && formatCurrency(provider.priceCents)}
                </Button>
              )}
            </div>
          </Card>
        </div>
      </main>
    </>
  );
}

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <dt className="text-[var(--muted-foreground)]">{label}</dt>
      <dd className={bold ? "font-semibold" : "font-medium"}>{value}</dd>
    </div>
  );
}

function groupByDay(slots: Slot[]): [string, Slot[]][] {
  const map = new Map<string, Slot[]>();
  for (const s of slots) {
    const key = formatRelativeDay(s.start);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(s);
  }
  return Array.from(map.entries());
}
