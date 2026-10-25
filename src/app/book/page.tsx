"use client";

import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, Pill, Star } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Steps } from "@/components/ui/steps";
import { HoldTimer } from "@/components/hold-timer";
import { LiveConnectCard } from "@/components/live/live-connect-card";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth-context";
import { authedFetch } from "@/lib/api-client";
import { auth } from "@/lib/firebase/client";
import { uploadIntakePhoto } from "@/lib/storage";
import { SERVICES, getServiceBySlug, getService } from "@/lib/services";
import { formatCurrency } from "@/lib/utils";
import { formatRelativeDay, formatTime } from "@/lib/datetime";
import { normalizeUsPhone } from "@/lib/phone";
import type { LiveEstimate, ServiceType } from "@/lib/types";

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
  const toast = useToast();
  const { user, loading: authLoading, signInWithToken, signIn } = useAuth();

  // Guest booking: capture identity at intake; account is created silently and
  // the patient sets a password after paying.
  const [guest, setGuest] = React.useState({
    displayName: "",
    email: "",
    phone: "",
    consent: false,
  });
  const [guestPassword, setGuestPassword] = React.useState("");
  const [existingAccount, setExistingAccount] = React.useState(false);
  const [creatingAccount, setCreatingAccount] = React.useState(false);

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
  const [liveEstimate, setLiveEstimate] = React.useState<LiveEstimate | null>(null);
  const [livePriceCents, setLivePriceCents] = React.useState(9900);
  const [startingLive, setStartingLive] = React.useState(false);
  const slotsRef = React.useRef<HTMLHeadingElement>(null);

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

  // Re-check live availability on the provider and time steps; poll on the
  // time step so the card flips to "available" as soon as a nurse goes live.
  React.useEffect(() => {
    if (!serviceId || (step !== 1 && step !== 3)) return;
    const check = () =>
      fetch(`/api/live/availability?serviceId=${serviceId}`)
        .then((r) => r.json())
        .then((d) => {
          setLiveAvailable(!!d.available);
          setLiveEstimate((d.estimate as LiveEstimate | null) ?? null);
          if (d.realtimePriceCents) setLivePriceCents(d.realtimePriceCents);
        })
        .catch(() => {
          setLiveAvailable(false);
          setLiveEstimate(null);
        });
    check();
    if (step !== 3) return;
    const id = setInterval(check, 12000);
    return () => clearInterval(id);
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

  /**
   * Make sure the visitor has a signed-in account before anything that needs
   * one (photo upload, holding a slot, Live Connect). Returns true if signed in.
   * For a brand-new email this silently creates the account; for a known email
   * it reveals a password field instead.
   */
  async function ensureAccount(): Promise<boolean> {
    if (user) return true;
    setError(null);
    const email = guest.email.trim();
    if (guest.displayName.trim().length < 2) {
      setError("Enter your name.");
      return false;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("Enter a valid email.");
      return false;
    }
    const phone = normalizeUsPhone(guest.phone);
    if (!existingAccount && !phone) {
      setError("Enter a valid 10-digit US mobile number.");
      return false;
    }
    if (!guest.consent) {
      setError("Please agree to the Terms and Telehealth Consent.");
      return false;
    }
    setCreatingAccount(true);
    try {
      if (existingAccount) {
        if (guestPassword.length < 1) {
          setError("Enter your password to continue.");
          return false;
        }
        await signIn(email, guestPassword);
        return true;
      }
      const res = await fetch("/api/auth/guest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          displayName: guest.displayName.trim(),
          phone,
          consent: true,
        }),
      });
      const data = await res.json();
      if (res.status === 409 && data.exists) {
        setExistingAccount(true);
        setError(
          data.needsPassword
            ? "You've booked with us before but haven't set a password yet. Use \"Forgot password\" below to set one, then continue."
            : "Welcome back! Enter your password to continue.",
        );
        return false;
      }
      if (!res.ok) throw new Error(data.error ?? "Couldn't create your account.");
      await signInWithToken(data.customToken);
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setError(
        /wrong-password|invalid-credential|invalid-login/.test(msg)
          ? "That password doesn't match. Try again or use \"Forgot password\"."
          : msg,
      );
      return false;
    } finally {
      setCreatingAccount(false);
    }
  }

  async function continueFromIntake() {
    if (await ensureAccount()) next();
  }

  async function handlePhotos(files: FileList | null) {
    if (!files) return;
    if (!(await ensureAccount())) return;
    // `user` from context may lag one render behind a just-completed sign-in.
    const uid = user?.uid ?? auth.currentUser?.uid;
    if (!uid) return;
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
        uploaded.push(await uploadIntakePhoto(uid, file));
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
    // Guests on the Provider step haven't given us a name/email yet — send
    // them to Intake (Live Connect is offered again right after it).
    if (!user && step < 2) {
      setStep(2);
      toast.info(
        "Almost there",
        "Add your name and email, then tap Live Connect on the next screen.",
      );
      return;
    }
    if (!(await ensureAccount())) return;
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
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setError(msg);
      toast.error("Live Connect unavailable", msg);
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
  const loginHref = `/login?next=${encodeURIComponent(
    `/book${serviceId ? `?service=${getService(serviceId)?.slug}` : ""}`,
  )}`;
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
                <h2 className="mb-1 text-lg font-semibold">
                  What can we help with?
                </h2>
                <p className="mb-4 flex items-center gap-1.5 text-sm text-[var(--muted-foreground)]">
                  <Pill className="h-3.5 w-3.5 text-[var(--tint-gold-fg)]" />
                  Every price includes the live video visit and your prescription.
                </p>
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
                {!user && (
                  <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--primary-soft)]/40 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-semibold">Your details</h2>
                        <p className="text-xs text-[var(--muted-foreground)]">
                          We&apos;ll use these for your visit confirmation. You can
                          set a password after booking.
                        </p>
                      </div>
                      <Link
                        href={loginHref}
                        className="shrink-0 text-xs text-[var(--primary)] underline"
                      >
                        Have an account? Log in
                      </Link>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label htmlFor="g-name">Full name</Label>
                        <Input
                          id="g-name"
                          value={guest.displayName}
                          onChange={(e) =>
                            setGuest({ ...guest, displayName: e.target.value })
                          }
                          autoComplete="name"
                        />
                      </div>
                      <div>
                        <Label htmlFor="g-email">Email</Label>
                        <Input
                          id="g-email"
                          type="email"
                          value={guest.email}
                          onChange={(e) => {
                            setGuest({ ...guest, email: e.target.value });
                            setExistingAccount(false);
                          }}
                          autoComplete="email"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Label htmlFor="g-phone">
                          Mobile phone{" "}
                          <span className="font-normal text-[var(--muted-foreground)]">
                            (required — your nurse may need to reach you)
                          </span>
                        </Label>
                        <Input
                          id="g-phone"
                          type="tel"
                          required
                          inputMode="tel"
                          placeholder="(501) 555-0123"
                          value={guest.phone}
                          onChange={(e) =>
                            setGuest({ ...guest, phone: e.target.value })
                          }
                          autoComplete="tel"
                        />
                      </div>
                      {existingAccount && (
                        <div className="sm:col-span-2">
                          <Label htmlFor="g-password">Password</Label>
                          <Input
                            id="g-password"
                            type="password"
                            value={guestPassword}
                            onChange={(e) => setGuestPassword(e.target.value)}
                            autoComplete="current-password"
                          />
                          <Link
                            href="/forgot-password"
                            className="mt-1 inline-block text-xs text-[var(--primary)] underline"
                          >
                            Forgot password?
                          </Link>
                        </div>
                      )}
                    </div>
                    <label className="flex cursor-pointer items-start gap-3">
                      <span className="mt-0.5">
                        <Checkbox
                          checked={guest.consent}
                          onCheckedChange={(v) =>
                            setGuest({ ...guest, consent: v === true })
                          }
                        />
                      </span>
                      <span className="text-xs leading-relaxed text-[var(--muted-foreground)]">
                        I agree to the{" "}
                        <Link href="/legal/terms" target="_blank" className="text-[var(--primary)] underline">
                          Terms
                        </Link>
                        ,{" "}
                        <Link href="/legal/privacy" target="_blank" className="text-[var(--primary)] underline">
                          Privacy Policy
                        </Link>
                        , and{" "}
                        <Link href="/legal/consent" target="_blank" className="text-[var(--primary)] underline">
                          Telehealth Consent
                        </Link>
                        . ARSkinRX serves Arkansas residents and is not for
                        emergencies.
                      </span>
                    </label>
                  </div>
                )}
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
                <LiveConnectCard
                  providers={providers}
                  available={liveAvailable}
                  estimate={liveEstimate}
                  priceCents={livePriceCents}
                  scheduledPriceCents={
                    provider?.priceCents ?? service?.defaultPriceCents ?? 0
                  }
                  starting={startingLive}
                  onStart={startLiveVisit}
                  onSchedule={() =>
                    slotsRef.current?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    })
                  }
                />

                {/* Clear "or save by scheduling" alternative */}
                <div className="my-6 flex items-center gap-3">
                  <span className="h-px flex-1 bg-[var(--border)]" />
                  <span className="text-sm font-semibold text-[var(--muted-foreground)]">
                    OR
                  </span>
                  <span className="h-px flex-1 bg-[var(--border)]" />
                </div>

                {(() => {
                  const sched =
                    provider?.priceCents ?? service?.defaultPriceCents ?? 0;
                  const save = livePriceCents - sched;
                  return (
                    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h2 className="text-lg font-semibold tracking-tight">
                            Schedule ahead &amp; save
                          </h2>
                          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                            Not in a rush? Book a time below for just{" "}
                            <span className="font-semibold text-[var(--foreground)]">
                              {formatCurrency(sched)}
                            </span>{" "}
                            when you plan at least a day ahead.
                          </p>
                        </div>
                        {save > 0 && (
                          <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700">
                            Save {formatCurrency(save)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })()}

                <h3
                  ref={slotsRef}
                  className="mb-3 mt-6 scroll-mt-24 text-sm font-semibold uppercase tracking-wide text-[var(--muted-foreground)]"
                >
                  Available times
                </h3>
                {loadingSlots ? (
                  <Loader2 className="mx-auto my-8 h-6 w-6 animate-spin text-[var(--primary)]" />
                ) : slots.length === 0 ? (
                  <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted-foreground)]">
                    <p className="font-medium text-[var(--foreground)]">
                      No open times in the next two weeks
                    </p>
                    <p className="mt-1">
                      Try{" "}
                      <span className="font-semibold text-[#9a7d18]">
                        Live Connect
                      </span>{" "}
                      above to see {provider?.displayName ?? "a nurse"} now, or go
                      back to choose another provider.
                    </p>
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
                <div className="arx-rx-band mt-3 flex items-start gap-3 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--gold)_35%,transparent)] p-3 text-sm">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--gold)] text-white">
                    <Pill className="h-3.5 w-3.5" />
                  </span>
                  <p>
                    <span className="font-medium">Prescription included.</span>{" "}
                    <span className="text-[var(--muted-foreground)]">
                      Your total covers the live video visit and any
                      prescription your provider writes — sent to your pharmacy
                      at no extra charge.
                    </span>
                  </p>
                </div>
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
                  . Free reschedule if you miss your window; no refunds within 24
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
                <Button
                  onClick={continueFromIntake}
                  disabled={!intake.concern.trim() || creatingAccount}
                >
                  {creatingAccount && <Loader2 className="h-4 w-4 animate-spin" />}
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
