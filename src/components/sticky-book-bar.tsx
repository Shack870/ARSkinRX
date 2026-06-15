"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Sticky bottom call-to-action shown only on small screens, so "Book a visit"
 * is always one tap away while browsing on a phone.
 */
export function StickyBookBar({ label = "Book a visit" }: { label?: string }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[var(--background)]/95 p-3 backdrop-blur md:hidden">
      <Link href="/book" className="block">
        <Button size="lg" className="w-full">
          {label}
        </Button>
      </Link>
    </div>
  );
}
