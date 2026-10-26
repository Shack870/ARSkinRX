"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { doc, updateDoc } from "firebase/firestore";
import { AlertTriangle, Camera, Loader2, Save } from "lucide-react";
import { db } from "@/lib/firebase/client";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { useAuth } from "@/lib/auth-context";
import { useProviderProfile } from "@/lib/hooks";
import { uploadProviderPhoto } from "@/lib/storage";
import { SERVICES } from "@/lib/services";
import { formatCurrency } from "@/lib/utils";
import { BIO_MIN_CHARS } from "@/lib/validation";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckboxIndicator } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import type { ProviderStatus, ServiceType } from "@/lib/types";

const STATUS_LABEL: Record<ProviderStatus, { label: string; variant: "warning" | "success" | "danger" }> = {
  pending: { label: "Pending review", variant: "warning" },
  approved: { label: "Approved", variant: "success" },
  suspended: { label: "Suspended", variant: "danger" },
};

export default function ProviderProfilePage() {
  return (
    <React.Suspense fallback={null}>
      <ProviderProfilePageInner />
    </React.Suspense>
  );
}

function ProviderProfilePageInner() {
  const { user } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const inSetup = useSearchParams().get("setup") === "1";
  const { profile, loading } = useProviderProfile(user?.uid);
  const [bio, setBio] = React.useState("");
  const [credentials, setCredentials] = React.useState("");
  const [yearsExperience, setYearsExperience] = React.useState("");
  const [conditions, setConditions] = React.useState<ServiceType[]>([]);
  const [photoURL, setPhotoURL] = React.useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [priceMap, setPriceMap] = React.useState<Record<string, number>>(() =>
    Object.fromEntries(SERVICES.map((s) => [s.id, s.defaultPriceCents])),
  );
  const hydrated = React.useRef(false);

  // Prices are set by ARSkinRX (admin) — fetch the current catalog to display.
  React.useEffect(() => {
    fetch("/api/services")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.services)) {
          setPriceMap(
            Object.fromEntries(
              d.services.map((s: { id: string; defaultPriceCents: number }) => [
                s.id,
                s.defaultPriceCents,
              ]),
            ),
          );
        }
      })
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    if (loading || hydrated.current || !profile) return;
    setBio(profile.bio ?? "");
    setCredentials(profile.credentials ?? "");
    setYearsExperience(
      profile.yearsExperience != null ? String(profile.yearsExperience) : "",
    );
    setConditions(profile.conditions ?? []);
    setPhotoURL(profile.photoURL ?? null);
    hydrated.current = true;
  }, [profile, loading]);

  function toggle(id: ServiceType) {
    setConditions((c) =>
      c.includes(id) ? c.filter((x) => x !== id) : [...c, id],
    );
  }

  async function handlePhoto(file: File | undefined) {
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) return;
    setUploadingPhoto(true);
    try {
      const { url } = await uploadProviderPhoto(user.uid, file);
      await updateDoc(doc(db, COLLECTIONS.providers, user.uid), {
        photoURL: url,
        updatedAt: Date.now(),
      });
      setPhotoURL(url);
      toast.success("Photo updated");
    } catch {
      toast.error("Couldn't upload photo");
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function save() {
    if (!user) return;
    if (bio.trim().length < BIO_MIN_CHARS) {
      toast.error(`Your bio needs at least ${BIO_MIN_CHARS} characters.`);
      return;
    }
    if (credentials.trim().length < 2) {
      toast.error("Enter your credentials (e.g. APRN, FNP-C).");
      return;
    }
    const yrs = Number(yearsExperience);
    if (yearsExperience.trim() === "" || !Number.isInteger(yrs) || yrs < 0 || yrs > 60) {
      toast.error("Enter your years of experience as a whole number.");
      return;
    }
    if (conditions.length === 0) {
      toast.error("Select at least one condition you treat.");
      return;
    }
    if (inSetup && !photoURL) {
      toast.error("Upload a profile photo to finish setup.");
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, COLLECTIONS.providers, user.uid), {
        bio: bio.trim(),
        credentials: credentials.trim(),
        yearsExperience: yrs,
        conditions,
        updatedAt: Date.now(),
      });
      toast.success("Profile saved");
      if (inSetup) router.replace("/provider");
    } catch {
      toast.error("Couldn't save profile");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  const status = profile ? STATUS_LABEL[profile.status] : null;
  const selectedServices = SERVICES.filter((s) => conditions.includes(s.id));
  const missing: string[] = [];
  if (!photoURL) missing.push("a profile photo");
  if ((profile?.bio ?? "").trim().length < BIO_MIN_CHARS) missing.push("a fuller bio");
  if (!profile?.credentials) missing.push("your credentials");
  if (profile?.yearsExperience == null) missing.push("years of experience");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your profile</h1>
          <p className="text-[var(--muted-foreground)]">
            What patients see and the credentials we have on file.
          </p>
        </div>
        {status && <Badge variant={status.variant}>{status.label}</Badge>}
      </div>

      {missing.length > 0 && (
        <Card className="border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
            <div>
              <p className="font-medium text-amber-800">
                {inSetup ? "Finish your profile to continue" : "Finish your profile"}
              </p>
              <p className="text-sm text-amber-700">
                Patients choose their nurse from this page. Please add{" "}
                {missing.join(", ")} so your profile is complete.
              </p>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-6">
        <h2 className="mb-1 font-semibold">Profile photo</h2>
        <p className="mb-4 text-sm text-[var(--muted-foreground)]">
          Required. A clear, friendly headshot patients will see when booking.
        </p>
        <div className="flex items-center gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
            {photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoURL} alt="Profile" className="h-full w-full object-cover" />
            ) : (
              <Camera className="h-6 w-6" />
            )}
          </span>
          <label className="inline-flex">
            <span className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] px-4 text-sm font-medium hover:bg-[var(--muted)]">
              {uploadingPhoto ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
              {photoURL ? "Change photo" : "Upload photo"}
            </span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploadingPhoto}
              onChange={(e) => handlePhoto(e.target.files?.[0])}
            />
          </label>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-semibold">Credentials</h2>
        <p className="mb-4 text-sm text-[var(--muted-foreground)]">
          Contact support to update your license number.
        </p>
        <dl className="grid grid-cols-1 gap-4">
          <Field label="Arkansas license #" value={profile?.licenseNumber} />
        </dl>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="credentials">Credentials shown to patients</Label>
            <Input
              id="credentials"
              value={credentials}
              onChange={(e) => setCredentials(e.target.value)}
              placeholder="APRN, FNP-C"
            />
          </div>
          <div>
            <Label htmlFor="years">Years of experience</Label>
            <Input
              id="years"
              type="number"
              min={0}
              max={60}
              inputMode="numeric"
              value={yearsExperience}
              onChange={(e) => setYearsExperience(e.target.value)}
              className="max-w-[140px]"
            />
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <Label htmlFor="bio">Bio</Label>
        <Textarea
          id="bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          className="min-h-[140px]"
          placeholder="Where you trained, how long you've practiced, what you love about skin care, and how you approach visits."
        />
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          {bio.trim().length} / {BIO_MIN_CHARS} characters minimum
        </p>

        <div className="mt-6">
          <Label>Conditions you treat</Label>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {SERVICES.map((s) => {
              const checked = conditions.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={checked}
                  onClick={() => toggle(s.id)}
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
      </Card>

      <Card className="p-6">
        <h2 className="font-semibold">Visit prices</h2>
        <p className="mb-4 text-sm text-[var(--muted-foreground)]">
          Prices are set by ARSkinRX. Here&apos;s what patients pay for each
          condition you treat.
        </p>
        {selectedServices.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            Select the conditions you treat above to see their prices.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {selectedServices.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between py-2.5 text-sm"
              >
                <span className="font-medium">{s.name}</span>
                <span className="font-medium text-[var(--primary)]">
                  {formatCurrency(priceMap[s.id] ?? s.defaultPriceCents)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {inSetup ? "Save and continue" : "Save profile"}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
        {label}
      </dt>
      <dd className="mt-1 font-medium">{value || "—"}</dd>
    </div>
  );
}
