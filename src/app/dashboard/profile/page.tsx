"use client";

import * as React from "react";
import { doc, updateDoc } from "firebase/firestore";
import { Loader2, Save } from "lucide-react";
import { db } from "@/lib/firebase/client";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";

export default function ClientProfilePage() {
  const { user, profile } = useAuth();
  const toast = useToast();
  const [displayName, setDisplayName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const hydrated = React.useRef(false);

  React.useEffect(() => {
    if (hydrated.current || !profile) return;
    setDisplayName(profile.displayName ?? "");
    setPhone(profile.phone ?? "");
    hydrated.current = true;
  }, [profile]);

  async function save() {
    if (!user) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, COLLECTIONS.users, user.uid), {
        displayName,
        phone,
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
        <div className="mt-6 flex items-center gap-3">
          <Button onClick={save} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save
          </Button>
        </div>
      </Card>
    </div>
  );
}
