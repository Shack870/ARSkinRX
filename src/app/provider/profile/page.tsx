"use client";

import * as React from "react";
import { doc, updateDoc } from "firebase/firestore";
import { Camera, Loader2, Save } from "lucide-react";
import { db } from "@/lib/firebase/client";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { useAuth } from "@/lib/auth-context";
import { useProviderProfile } from "@/lib/hooks";
import { uploadProviderPhoto } from "@/lib/storage";
import { SERVICES, SERVICE_MAP } from "@/lib/services";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const { user } = useAuth();
  const toast = useToast();
  const { profile, loading } = useProviderProfile(user?.uid);
  const [bio, setBio] = React.useState("");
  const [conditions, setConditions] = React.useState<ServiceType[]>([]);
  const [prices, setPrices] = React.useState<Record<string, string>>({});
  const [photoURL, setPhotoURL] = React.useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const hydrated = React.useRef(false);

  React.useEffect(() => {
    if (loading || hydrated.current || !profile) return;
    setBio(profile.bio ?? "");
    setConditions(profile.conditions ?? []);
    setPhotoURL(profile.photoURL ?? null);
    const initialPrices: Record<string, string> = {};
    for (const s of SERVICES) {
      const override = profile.priceOverrides?.[s.id];
      initialPrices[s.id] = (
        (override ?? s.defaultPriceCents) / 100
      ).toFixed(0);
    }
    setPrices(initialPrices);
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
    setSaving(true);
    try {
      const priceOverrides: Partial<Record<ServiceType, number>> = {};
      for (const id of conditions) {
        const dollars = Number(prices[id]);
        const def = SERVICE_MAP[id].defaultPriceCents;
        if (Number.isFinite(dollars) && dollars > 0) {
          const cents = Math.round(dollars * 100);
          if (cents !== def) priceOverrides[id] = cents;
        }
      }
      await updateDoc(doc(db, COLLECTIONS.providers, user.uid), {
        bio,
        conditions,
        priceOverrides,
        updatedAt: Date.now(),
      });
      toast.success("Profile saved");
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

      <Card className="p-6">
        <h2 className="mb-4 font-semibold">Profile photo</h2>
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
        <h2 className="font-semibold">Credentials on file</h2>
        <p className="mb-4 text-sm text-[var(--muted-foreground)]">
          Contact support to update credentials.
        </p>
        <dl className="grid grid-cols-1 gap-4">
          <Field label="Arkansas license #" value={profile?.licenseNumber} />
        </dl>
      </Card>

      <Card className="p-6">
        <Label htmlFor="bio">Bio</Label>
        <Textarea
          id="bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          className="min-h-[120px]"
        />

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
        <h2 className="font-semibold">Your prices</h2>
        <p className="mb-4 text-sm text-[var(--muted-foreground)]">
          Set a price per visit for each condition you treat. Leave at the
          suggested price or adjust within reason.
        </p>
        {selectedServices.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            Select the conditions you treat above to set prices.
          </p>
        ) : (
          <div className="space-y-3">
            {selectedServices.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{s.name}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Suggested ${(s.defaultPriceCents / 100).toFixed(0)}
                  </p>
                </div>
                <div className="relative w-28">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted-foreground)]">
                    $
                  </span>
                  <Input
                    inputMode="numeric"
                    className="pl-6"
                    value={prices[s.id] ?? ""}
                    onChange={(e) =>
                      setPrices((p) => ({
                        ...p,
                        [s.id]: e.target.value.replace(/[^0-9]/g, ""),
                      }))
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save profile
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
