"use client";

import * as React from "react";
import { doc, setDoc } from "firebase/firestore";
import { CalendarOff, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { db } from "@/lib/firebase/client";
import { COLLECTIONS } from "@/lib/firebase/collections";
import { useAuth } from "@/lib/auth-context";
import { useProviderAvailability } from "@/lib/hooks";
import { WEEKDAYS, formatDate } from "@/lib/datetime";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AvailabilityWindow } from "@/lib/types";

export default function AvailabilityPage() {
  const { user } = useAuth();
  const toast = useToast();
  const { availability, loading } = useProviderAvailability(user?.uid);
  const [windows, setWindows] = React.useState<AvailabilityWindow[]>([]);
  const [timezone, setTimezone] = React.useState("America/Chicago");
  const [blackoutDates, setBlackoutDates] = React.useState<string[]>([]);
  const [newDate, setNewDate] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const hydrated = React.useRef(false);

  React.useEffect(() => {
    if (loading || hydrated.current) return;
    if (availability) {
      setWindows(availability.windows ?? []);
      setTimezone(availability.timezone ?? "America/Chicago");
      setBlackoutDates(availability.blackoutDates ?? []);
    }
    hydrated.current = true;
  }, [availability, loading]);

  function addWindow(weekday: number) {
    setWindows((w) => [...w, { weekday, startTime: "09:00", endTime: "12:00" }]);
  }
  function updateWindow(idx: number, patch: Partial<AvailabilityWindow>) {
    setWindows((w) => w.map((win, i) => (i === idx ? { ...win, ...patch } : win)));
  }
  function removeWindow(idx: number) {
    setWindows((w) => w.filter((_, i) => i !== idx));
  }

  function addBlackout() {
    if (!newDate || blackoutDates.includes(newDate)) return;
    setBlackoutDates((d) => [...d, newDate].sort());
    setNewDate("");
  }
  function removeBlackout(date: string) {
    setBlackoutDates((d) => d.filter((x) => x !== date));
  }

  async function save() {
    if (!user) return;
    setSaving(true);
    try {
      await setDoc(doc(db, COLLECTIONS.availability, user.uid), {
        providerId: user.uid,
        timezone,
        windows,
        blackoutDates,
        updatedAt: Date.now(),
      });
      toast.success("Availability saved");
    } catch {
      toast.error("Couldn't save availability");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Availability</h1>
        <p className="text-[var(--muted-foreground)]">
          Set the weekly hours you&apos;re open for visits. Patients can only
          book inside these windows.
        </p>
      </div>

      <Card className="p-6">
        <div className="mb-6 max-w-xs">
          <Label htmlFor="tz">Time zone</Label>
          <select
            id="tz"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="flex h-11 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-sm outline-none focus-visible:border-[var(--ring)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]/30"
          >
            <option value="America/Chicago">Central (Arkansas)</option>
            <option value="America/New_York">Eastern</option>
            <option value="America/Denver">Mountain</option>
            <option value="America/Los_Angeles">Pacific</option>
          </select>
        </div>

        <div className="space-y-4">
          {WEEKDAYS.map((day, weekday) => {
            const dayWindows = windows
              .map((w, idx) => ({ w, idx }))
              .filter(({ w }) => w.weekday === weekday);
            return (
              <div
                key={day}
                className="rounded-[var(--radius-md)] border border-[var(--border)] p-4"
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium">{day}</p>
                  <Button variant="ghost" size="sm" onClick={() => addWindow(weekday)}>
                    <Plus className="h-4 w-4" /> Add hours
                  </Button>
                </div>
                {dayWindows.length === 0 ? (
                  <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                    Unavailable
                  </p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {dayWindows.map(({ w, idx }) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Input
                          type="time"
                          value={w.startTime}
                          onChange={(e) =>
                            updateWindow(idx, { startTime: e.target.value })
                          }
                          className="max-w-[140px]"
                        />
                        <span className="text-[var(--muted-foreground)]">to</span>
                        <Input
                          type="time"
                          value={w.endTime}
                          onChange={(e) =>
                            updateWindow(idx, { endTime: e.target.value })
                          }
                          className="max-w-[140px]"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeWindow(idx)}
                          aria-label="Remove"
                        >
                          <Trash2 className="h-4 w-4 text-[var(--accent)]" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-6">
        <div className="mb-2 flex items-center gap-2">
          <CalendarOff className="h-4 w-4 text-[var(--primary)]" />
          <h2 className="font-semibold">Time off</h2>
        </div>
        <p className="mb-4 text-sm text-[var(--muted-foreground)]">
          Block specific dates — patients won&apos;t be able to book you on these
          days even if they fall within your weekly hours.
        </p>
        <div className="flex items-end gap-2">
          <div>
            <Label htmlFor="blackout">Add a date</Label>
            <Input
              id="blackout"
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="max-w-[200px]"
            />
          </div>
          <Button variant="outline" onClick={addBlackout} disabled={!newDate}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
        {blackoutDates.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {blackoutDates.map((d) => (
              <span
                key={d}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--muted)] px-3 py-1 text-sm"
              >
                {formatDate(new Date(`${d}T12:00:00`).getTime())}
                <button
                  onClick={() => removeBlackout(d)}
                  aria-label="Remove date"
                  className="text-[var(--muted-foreground)] hover:text-[var(--accent)]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </span>
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
          Save availability
        </Button>
      </div>
    </div>
  );
}
