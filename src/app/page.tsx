import Link from "next/link";
import {
  CalendarCheck,
  CreditCard,
  Video,
  ClipboardList,
  ShieldCheck,
  Clock,
  Lock,
  BadgeCheck,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ServiceCard } from "@/components/service-card";
import { Faq } from "@/components/faq";
import { StickyBookBar } from "@/components/sticky-book-bar";
import { Button } from "@/components/ui/button";
import { SERVICES } from "@/lib/services";

const BENEFITS = [
  {
    icon: BadgeCheck,
    tint: "tint-teal",
    title: "Licensed Arkansas APRNs",
    body: "Care from nurse practitioners with independent practice authority.",
  },
  {
    icon: Clock,
    tint: "tint-amber",
    title: "Visits in minutes",
    body: "No waiting rooms. Book a 15-minute video visit at a time that works.",
  },
  {
    icon: Lock,
    tint: "tint-violet",
    title: "Private & secure",
    body: "Encrypted, HIPAA-minded, and your video visit is never recorded.",
  },
];

const FAQS = [
  {
    q: "Who can use ARSkinRX?",
    a: "Anyone located in Arkansas who is 18 or older. Our nurse practitioners are licensed in Arkansas and can only treat patients in the state.",
  },
  {
    q: "What happens during a visit?",
    a: "You'll meet your provider on a private video call. They'll review your concern and intake answers, discuss a plan, and prescribe treatment when appropriate.",
  },
  {
    q: "Will I get a prescription?",
    a: "If your provider determines it's appropriate, yes. Prescriptions are at their clinical judgment. We do not prescribe controlled substances online.",
  },
  {
    q: "What if I miss my appointment?",
    a: "No problem — you can reschedule once for free. Note that refunds aren't available within 48 hours of a scheduled visit.",
  },
  {
    q: "How much does it cost?",
    a: "Most visits are $69–$79, shown clearly before you pay. You pay securely at booking.",
  },
];

const STEPS = [
  {
    icon: ClipboardList,
    title: "Tell us about your skin",
    body: "Pick your concern and answer a few quick questions. Add photos so your provider can prepare.",
  },
  {
    icon: CalendarCheck,
    title: "Choose a time",
    body: "See real openings from Arkansas-licensed nurse practitioners and grab the slot that works for you.",
  },
  {
    icon: CreditCard,
    title: "Pay securely",
    body: "Checkout with Stripe. Your spot is locked in the moment payment clears.",
  },
  {
    icon: Video,
    title: "Meet by video",
    body: "Join your private video visit during your appointment window and get your personalized plan.",
  },
];

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[var(--primary-soft)] to-[var(--background)]" />
          <div className="arx-blob -left-16 -top-10 h-72 w-72 bg-[#7fc6b6]" />
          <div className="arx-blob -right-10 top-24 h-72 w-72 bg-[#e7b8a8]" />
          <div className="mx-auto max-w-6xl px-4 py-20 text-center md:py-28">
            <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-xs font-medium text-[var(--muted-foreground)]">
              Licensed in Arkansas · Independent Practice Authority
            </span>
            <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">
              Prescription skin care,{" "}
              <span className="arx-gradient-text">from your phone.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg text-[var(--muted-foreground)]">
              Meet by video with an Arkansas nurse practitioner for acne,
              anti-aging, rosacea, hair, nail health, and more. Book, pay, and
              connect — all online.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/book">
                <Button size="lg">Book a visit</Button>
              </Link>
              <Link href="/#services">
                <Button size="lg" variant="outline">
                  Explore services
                </Button>
              </Link>
            </div>
            <p className="mt-6 inline-flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
              <ShieldCheck className="h-4 w-4 text-[var(--primary)]" />
              Licensed Arkansas providers · Secure & private · No waiting rooms
            </p>
          </div>
        </section>

        {/* Benefits */}
        <section className="mx-auto max-w-6xl px-4 py-12">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {BENEFITS.map((b) => (
              <div
                key={b.title}
                className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-5 transition-all duration-200 hover:-translate-y-0.5 hover:arx-glow"
              >
                <div
                  className={`mb-3 flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] ${b.tint}`}
                >
                  <b.icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold">{b.title}</h3>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  {b.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Services */}
        <section id="services" className="mx-auto max-w-6xl px-4 py-16">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-semibold tracking-tight">
              What we treat
            </h2>
            <p className="mt-2 text-[var(--muted-foreground)]">
              Choose a concern to start your visit.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SERVICES.map((service) => (
              <ServiceCard key={service.id} service={service} />
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="arx-dot-grid bg-[var(--muted)] py-16">
          <div className="mx-auto max-w-6xl px-4">
            <div className="mb-10 text-center">
              <h2 className="text-3xl font-semibold tracking-tight">
                How it works
              </h2>
              <p className="mt-2 text-[var(--muted-foreground)]">
                From concern to care in four simple steps.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step, i) => (
                <div key={step.title} className="relative">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)]">
                    <step.icon className="h-5 w-5" />
                  </div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">
                    Step {i + 1}
                  </div>
                  <h3 className="mt-1 font-semibold">{step.title}</h3>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                    {step.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Provider CTA */}
        <section className="mx-auto max-w-6xl px-4 py-16">
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-gradient-to-br from-[var(--primary)] to-[#27514d] p-10 text-center text-[var(--primary-foreground)]">
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
              Are you an Arkansas APRN?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-[var(--primary-soft)]">
              Join ARSkinRX, set your own hours, and see patients on your
              schedule. We handle booking, payments, and the video — you provide
              the care.
            </p>
            <Link href="/providers/apply" className="mt-6 inline-block">
              <Button size="lg" variant="accent">
                Apply to practice
              </Button>
            </Link>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto max-w-6xl px-4 pb-24 md:pb-16">
          <div className="mb-8 text-center">
            <h2 className="text-3xl font-semibold tracking-tight">
              Frequently asked
            </h2>
            <p className="mt-2 text-[var(--muted-foreground)]">
              Everything you need to know before your first visit.
            </p>
          </div>
          <Faq items={FAQS} />
        </section>
      </main>
      <SiteFooter />
      <StickyBookBar />
    </>
  );
}
