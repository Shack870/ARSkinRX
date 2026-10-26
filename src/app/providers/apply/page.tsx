"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Camera, Loader2, ShieldCheck } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox, CheckboxIndicator } from "@/components/ui/checkbox";
import { Steps } from "@/components/ui/steps";
import { useAuth } from "@/lib/auth-context";
import { SERVICES } from "@/lib/services";
import { uploadProviderPhoto } from "@/lib/storage";
import { BIO_MIN_CHARS, providerApplicationSchema } from "@/lib/validation";
import type { ServiceType } from "@/lib/types";

const STEP_LABELS = ["Account", "Credentials", "Profile", "Photo", "Attest"];

interface FormState {
  displayName: string;
  email: string;
  password: string;
  phone: string;
  licenseNumber: string;
  credentials: string;
  yearsExperience: string;
  bio: string;
  conditions: ServiceType[];
  followsArkansasNursingRules: boolean;
  hasPrescriptiveAuthority: boolean;
  agreesToTerms: boolean;
}

const INITIAL: FormState = {
  displayName: "",
  email: "",
  password: "",
  phone: "",
  licenseNumber: "",
  credentials: "",
  yearsExperience: "",
  bio: "",
  conditions: [],
  followsArkansasNursingRules: false,
  hasPrescriptiveAuthority: false,
  agreesToTerms: false,
};

export default function ProviderApplyPage() {
  const router = useRouter();
  const { signUp, refreshClaims } = useAuth();
  const [step, setStep] = React.useState(0);
  const [form, setForm] = React.useState<FormState>(INITIAL);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [photo, setPhoto] = React.useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = React.useState<string | null>(null);

  // Revoke the last object URL when the component unmounts.
  const previewRef = React.useRef<string | null>(null);
  React.useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

  function choosePhoto(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Please choose an image file.");
    if (file.size > 5 * 1024 * 1024) return setError("Photo must be under 5 MB.");
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    const url = URL.createObjectURL(file);
    previewRef.current = url;
    setPhoto(file);
    setPhotoPreview(url);
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleCondition(id: ServiceType) {
    setForm((f) => ({
      ...f,
      conditions: f.conditions.includes(id)
        ? f.conditions.filter((c) => c !== id)
        : [...f.conditions, id],
    }));
  }

  function validateStep(): string | null {
    if (step === 0) {
      if (form.displayName.trim().length < 2) return "Enter your full name.";
      if (!/^\S+@\S+\.\S+$/.test(form.email)) return "Enter a valid email.";
      if (form.password.length < 8)
        return "Password must be at least 8 characters.";
      if (form.phone.trim().length < 7) return "Enter a valid phone number.";
    }
    if (step === 1) {
      if (form.licenseNumber.trim().length < 3)
        return "Enter your Arkansas license number.";
      if (form.credentials.trim().length < 2)
        return "Enter your credentials (e.g. APRN, FNP-C).";
      const yrs = Number(form.yearsExperience);
      if (form.yearsExperience.trim() === "" || !Number.isInteger(yrs) || yrs < 0 || yrs > 60)
        return "Enter your years of experience as a whole number.";
    }
    if (step === 2) {
      if (form.conditions.length === 0)
        return "Select at least one condition you treat.";
      if (form.bio.trim().length < BIO_MIN_CHARS)
        return `Your bio needs at least ${BIO_MIN_CHARS} characters so patients can get to know you.`;
    }
    if (step === 3) {
      if (!photo) return "A profile photo is required.";
    }
    return null;
  }

  function next() {
    const err = validateStep();
    if (err) return setError(err);
    setError(null);
    setStep((s) => Math.min(s + 1, STEP_LABELS.length - 1));
  }

  function back() {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  async function submit() {
    setError(null);
    if (
      !form.followsArkansasNursingRules ||
      !form.hasPrescriptiveAuthority ||
      !form.agreesToTerms
    ) {
      return setError("Please confirm all three attestations to continue.");
    }

    if (!photo) return setError("A profile photo is required.");

    const base = {
      displayName: form.displayName,
      phone: form.phone,
      licenseNumber: form.licenseNumber,
      credentials: form.credentials.trim(),
      yearsExperience: Number(form.yearsExperience),
      bio: form.bio.trim(),
      conditions: form.conditions,
      attestations: {
        followsArkansasNursingRules: true as const,
        hasPrescriptiveAuthority: true as const,
        agreesToTerms: true as const,
      },
    };
    // Validate everything except the photo URL, which only exists after upload.
    const check = providerApplicationSchema
      .omit({ photoURL: true })
      .safeParse(base);
    if (!check.success) {
      return setError(
        check.error.issues[0]?.message ?? "Please review your answers.",
      );
    }

    setSubmitting(true);
    try {
      const user = await signUp(form.email, form.password, form.displayName);
      const { url: photoURL } = await uploadProviderPhoto(user.uid, photo);
      const payload = { ...base, photoURL };
      const token = await user.getIdToken();
      const res = await fetch("/api/providers/apply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not submit your application.");
      }
      await refreshClaims();
      router.push("/provider?welcome=1");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Something went wrong. Try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="flex-1 bg-[var(--muted)]">
        <div className="mx-auto max-w-2xl px-4 py-12">
          <div className="mb-6 text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary-soft)] px-3 py-1 text-xs font-medium text-[var(--primary)]">
              <ShieldCheck className="h-3.5 w-3.5" /> Arkansas APRNs
            </span>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight">
              Apply to practice on ARSkinRX
            </h1>
            <p className="mt-2 text-[var(--muted-foreground)]">
              Set your own hours and see patients on your schedule. Approval is
              required before you go live.
            </p>
          </div>

          <Card className="p-6">
            <div className="mb-8">
              <Steps steps={STEP_LABELS} current={step} />
            </div>

            {step === 0 && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="displayName">Full name</Label>
                  <Input
                    id="displayName"
                    value={form.displayName}
                    onChange={(e) => update("displayName", e.target.value)}
                    placeholder="B. Crystal Shackelford, APRN"
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
                <div>
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={form.password}
                    onChange={(e) => update("password", e.target.value)}
                    placeholder="At least 8 characters"
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={form.phone}
                    onChange={(e) => update("phone", e.target.value)}
                    placeholder="(501) 555-0123"
                  />
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <p className="text-sm text-[var(--muted-foreground)]">
                  Your credentials are stored securely and reviewed by our team
                  before approval.
                </p>
                <div>
                  <Label htmlFor="license">Arkansas APRN license number</Label>
                  <Input
                    id="license"
                    value={form.licenseNumber}
                    onChange={(e) => update("licenseNumber", e.target.value)}
                    placeholder="APRN license #"
                  />
                </div>
                <div>
                  <Label htmlFor="credentials">Credentials</Label>
                  <Input
                    id="credentials"
                    value={form.credentials}
                    onChange={(e) => update("credentials", e.target.value)}
                    placeholder="APRN, FNP-C"
                  />
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                    Shown after your name on your public profile.
                  </p>
                </div>
                <div>
                  <Label htmlFor="years">Years of experience</Label>
                  <Input
                    id="years"
                    type="number"
                    min={0}
                    max={60}
                    inputMode="numeric"
                    value={form.yearsExperience}
                    onChange={(e) => update("yearsExperience", e.target.value)}
                    placeholder="8"
                    className="max-w-[140px]"
                  />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <Label>Which conditions will you treat?</Label>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {SERVICES.map((s) => {
                      const checked = form.conditions.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          aria-pressed={checked}
                          onClick={() => toggleCondition(s.id)}
                          className={
                            "flex items-center gap-3 rounded-[var(--radius-md)] border p-3 text-left text-sm transition-colors " +
                            (checked
                              ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                              : "border-[var(--border)] hover:bg-[var(--muted)]")
                          }
                        >
                          <CheckboxIndicator checked={checked} />
                          <span className="font-medium">{s.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <Label htmlFor="bio">Bio for your public profile</Label>
                  <Textarea
                    id="bio"
                    value={form.bio}
                    onChange={(e) => update("bio", e.target.value)}
                    className="min-h-[140px]"
                    placeholder="Where you trained, how long you've practiced, what you love about skin care, and how you approach visits. Patients read this when choosing a nurse."
                  />
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                    {form.bio.trim().length} / {BIO_MIN_CHARS} characters minimum
                  </p>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <p className="text-sm text-[var(--muted-foreground)]">
                  Patients pick their nurse from a list — a clear, friendly
                  headshot is required. Use a well-lit photo of your face,
                  ideally in scrubs or professional attire.
                </p>
                <div className="flex items-center gap-5">
                  <span className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
                    {photoPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photoPreview}
                        alt="Your profile photo"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Camera className="h-8 w-8" />
                    )}
                  </span>
                  <div className="space-y-2">
                    <label className="inline-flex">
                      <span className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-[var(--radius-md)] bg-[var(--primary)] px-4 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90">
                        <Camera className="h-4 w-4" />
                        {photo ? "Change photo" : "Choose photo"}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => choosePhoto(e.target.files?.[0])}
                      />
                    </label>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      JPG or PNG, up to 5 MB.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4">
                <p className="text-sm text-[var(--muted-foreground)]">
                  Please confirm the following to complete your application.
                </p>
                <Attestation
                  checked={form.followsArkansasNursingRules}
                  onChange={(v) => update("followsArkansasNursingRules", v)}
                  label="I agree to follow the Arkansas State Board of Nursing rules and regulations, and practice within my scope of practice."
                />
                <Attestation
                  checked={form.hasPrescriptiveAuthority}
                  onChange={(v) => update("hasPrescriptiveAuthority", v)}
                  label="I attest that I hold valid prescriptive authority to prescribe the skin care treatments offered on ARSkinRX."
                />
                <Attestation
                  checked={form.agreesToTerms}
                  onChange={(v) => update("agreesToTerms", v)}
                  label={
                    <>
                      I agree to the ARSkinRX{" "}
                      <Link
                        href="/legal/terms"
                        className="text-[var(--primary)] underline"
                        target="_blank"
                      >
                        Terms & Conditions
                      </Link>{" "}
                      and provider agreement.
                    </>
                  }
                />
              </div>
            )}

            {error && (
              <p className="mt-4 rounded-[var(--radius-md)] bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--accent)]">
                {error}
              </p>
            )}

            <div className="mt-8 flex items-center justify-between">
              {step > 0 ? (
                <Button variant="ghost" onClick={back} disabled={submitting}>
                  <ArrowLeft className="h-4 w-4" /> Back
                </Button>
              ) : (
                <span />
              )}
              {step < STEP_LABELS.length - 1 ? (
                <Button onClick={next}>
                  Continue <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button onClick={submit} disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Submit application
                </Button>
              )}
            </div>
          </Card>

          <p className="mt-4 text-center text-sm text-[var(--muted-foreground)]">
            Already have an account?{" "}
            <Link href="/login" className="text-[var(--primary)] underline">
              Log in
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}

function Attestation({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border border-[var(--border)] p-4">
      <span className="mt-0.5">
        <Checkbox checked={checked} onCheckedChange={onChange} />
      </span>
      <span className="text-sm leading-relaxed">{label}</span>
    </label>
  );
}
