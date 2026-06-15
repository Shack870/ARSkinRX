import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-4 py-24 text-center">
        <div>
          <p className="text-sm font-semibold text-[var(--primary)]">404</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Page not found
          </h1>
          <p className="mt-2 text-[var(--muted-foreground)]">
            The page you&apos;re looking for doesn&apos;t exist or has moved.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href="/">
              <Button variant="outline">Go home</Button>
            </Link>
            <Link href="/book">
              <Button>Book a visit</Button>
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
