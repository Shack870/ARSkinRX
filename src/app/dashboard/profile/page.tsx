"use client";

import * as React from "react";
import { doc, updateDoc } from "firebase/firestore";
import { Loader2, Save } from "lucide-react";
import { db } from "@/lib/firebase/client";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { useAuth } from "@/lib/auth-context";
import {
  DEFAULT_NOTIFICATION_PREFS,
  NOTIFICATION_OPTIONS,
  resolvePrefs,
} from "@/lib/notifications";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/toast";
import type { NotificationPrefs } from "@/lib/types";

export default function ClientProfilePage() {
  const { user, profile } = useAuth();
  const toast = useToast();
  const [displayName, setDisplayName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [prefs, setPrefs] = React.useState<NotificationPrefs>(
    DEFAULT_NOTIFICATION_PREFS,
  );
  const [smsOptIn, setSmsOptIn] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const hydrated = React.useRef(false);

  React.useEffect(() => {
    if (hydrated.current || !profile) return;
    setDisplayName(profile.displayName ?? "");
    setPhone(profile.phone ?? "");
    setPrefs(resolvePrefs(profile.notificationPrefs));
    setSmsOptIn(profile.smsOptIn === true);
    hydrated.current = true;
  }, [profile]);

  function togglePref(key: keyof NotificationPrefs) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
  }

  const allOn = Object.values(prefs).every(Boolean);
  function setAll(value: boolean) {
    setPrefs({
      receipt: value,
      reminder3Day: value,
      reminder1Day: value,
      reminderDayOf: value,
    });
  }

  async function save() {
    if (!user) return;
    setSaving(true);
    try {
      const wasOptedIn = profile?.smsOptIn === true;
      await updateDoc(doc(db, COLLECTIONS.users, user.uid), {
        displayName,
        phone,
        notificationPrefs: prefs,
        smsOptIn,
        // Record consent time when newly opting in.
        ...(smsOptIn && !wasOptedIn ? { smsOptInAt: Date.now() } : {}),
        updatedAt: Date.now(),
      });
      toast.success("Profile saved");
    } catch {
      toast.error("Couldn't save", "Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Your profile</h1>

      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <Label htmlFor="name">Full name</Label>
            <Input
              id="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="phone">Phone (for visit reminders)</Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={profile?.email ?? ""} disabled />
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Email notifications</h2>
            <p className="text-sm text-[var(--muted-foreground)]">
              Choose which emails you&apos;d like to receive.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAll(!allOn)}
            className="text-sm text-[var(--primary)] hover:underline"
          >
            {allOn ? "Turn all off" : "Turn all on"}
          </button>
        </div>
        <ul className="space-y-2">
          {NOTIFICATION_OPTIONS.map((opt) => (
            <li key={opt.key}>
              <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border border-[var(--border)] p-3 hover:bg-[var(--muted)]">
                <span className="mt-0.5">
                  <Checkbox
                    checked={prefs[opt.key]}
                    onCheckedChange={() => togglePref(opt.key)}
                  />
                </span>
                <span>
                  <span className="block text-sm font-medium">{opt.label}</span>
                  <span className="block text-sm text-[var(--muted-foreground)]">
                    {opt.description}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-6">
        <h2 className="mb-2 font-semibold">Text messages (SMS)</h2>
        <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border border-[var(--border)] p-3 hover:bg-[var(--muted)]">
          <span className="mt-0.5">
            <Checkbox checked={smsOptIn} onCheckedChange={setSmsOptIn} />
          </span>
          <span className="text-xs leading-relaxed text-[var(--muted-foreground)]">
            Text me appointment updates and reminders. By enabling this, I agree
            to receive automated SMS messages from ARSkinRX at my number on file.
            Consent is not a condition of purchase. Message frequency varies;
            message &amp; data rates may apply. Reply STOP to unsubscribe or HELP
            for help.
          </span>
        </label>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save
        </Button>
      </div>
    </div>
  );
}
