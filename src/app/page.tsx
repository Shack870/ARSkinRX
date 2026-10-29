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
  Pill,
  Sparkles,
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
    icon: Pill,
    tint: "tint-gold",
    bar: "var(--gold)",
    title: "Prescription sent for you",
    body: "If treatment calls for a prescription — and for most skin concerns it does — your nurse writes it and sends it to our partner pharmacy, who contacts you to fill and ship it.",
  },
  {
    icon: BadgeCheck,
    tint: "tint-teal",
    bar: "var(--primary)",
    title: "Licensed Arkansas APRNs",
    body: "Care from nurse practitioners with independent practice authority.",
  },
  {
    icon: Clock,
    tint: "tint-sky",
    bar: "var(--tint-sky-fg)",
    title: "Visits in minutes",
    body: "No waiting rooms. Book a 15-minute video visit at a time that works.",
  },
  {
    icon: Lock,
    tint: "tint-violet",
    bar: "var(--tint-violet-fg)",
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
    a: "You'll meet your provider on a private video call. They'll review your concern and intake answers, talk through a plan, and — when treatment calls for it — write a prescription and send it to our partner pharmacy.",
  },
  {
    q: "What does the visit price cover?",
    a: "The visit price pays for your live video visit with the nurse practitioner — nothing else is owed to ARSkinRX. If your provider writes a prescription, it's sent to our partner pharmacy, and the pharmacy contacts you directly (usually within 24 hours) to take payment for the medication and ship it to you. Medication cost is paid to the pharmacy, not to us. What's prescribed is always your provider's clinical decision, and we don't prescribe controlled substances online.",
  },
  {
    q: "What if I miss my appointment?",
    a: "No problem — you can reschedule once for free. Note that refunds aren't available within 24 hours of a scheduled visit.",
  },
  {
    q: "How much does it cost?",
    a: "Most visits are $69–$79, shown clearly before you pay. You pay securely at booking. Any medication is paid for separately through the pharmacy that fills it.",
  },
];

const STEPS = [
  {
    icon: ClipboardList,
    color: "bg-[var(--tint-violet-fg)]",
    title: "Tell us about your skin",
    body: "Pick your concern and answer a few quick questions. Add photos so your provider can prepare.",
  },
  {
    icon: CalendarCheck,
    color: "bg-[var(--tint-sky-fg)]",
    title: "Choose a time",
    body: "See real openings from Arkansas-licensed nurse practitioners and grab the slot that works for you.",
  },
  {
    icon: CreditCard,
    color: "bg-[var(--primary)]",
    title: "Pay securely",
    body: "One flat price for the visit, shown up front. Your spot is locked in the moment payment clears.",
  },
  {
    icon: Video,
    color: "bg-[var(--accent)]",
    title: "Meet by video",
    body: "Join your private video visit and get your personalized plan. If a prescription is part of it, it goes to our partner pharmacy, who contacts you to fill and ship it.",
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
          <div className="arx-blob left-1/2 top-64 h-64 w-64 -translate-x-1/2 bg-[#f1d58a]" />
          <div className="mx-auto max-w-6xl px-4 py-20 text-center md:py-28">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-xs font-medium text-[var(--muted-foreground)]">
                Licensed in Arkansas · Independent Practice Authority
              </span>
              <span className="arx-rx-pill">
                <Pill className="h-3.5 w-3.5" /> Prescriptions sent to our pharmacy
              </span>
            </div>
            <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">
              Prescription skin care,{" "}
              <span className="arx-gradient-text">from your phone.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg text-[var(--muted-foreground)]">
              A live video visit with an Arkansas nurse practitioner for acne,
              anti-aging, rosacea, hair, nail health, and more. One flat price
              for the visit — your prescription is sent to our partner pharmacy,
              who fills it and ships it to you.
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {BENEFITS.map((b) => (
              <div
                key={b.title}
                style={{ ["--bar" as string]: b.bar }}
                className="arx-bar rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-5 pt-6 transition-all duration-200 hover:-translate-y-0.5 hover:arx-glow"
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

        {/* What's included */}
        <section className="mx-auto max-w-6xl px-4 pb-4">
          <div className="arx-rx-band relative overflow-hidden rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--gold)_35%,transparent)] p-8 md:p-10">
            <Sparkles className="absolute -right-6 -top-6 h-32 w-32 text-[var(--gold)] opacity-20" />
            <div className="grid gap-8 md:grid-cols-[1.2fr_1fr] md:items-center">
              <div>
                <span className="arx-rx-pill">
                  <Pill className="h-3.5 w-3.5" /> One flat price for the visit.
                </span>
                <h2 className="mt-4 text-2xl font-semibold tracking-tight md:text-3xl">
                  You pay for the visit.{" "}
                  <span className="text-[var(--tint-gold-fg)]">The pharmacy</span>{" "}
                  handles the rest.
                </h2>
                <p className="mt-3 max-w-xl text-[var(--muted-foreground)]">
                  Nearly every concern we treat — acne, rosacea, pigmentation,
                  aging skin, hair loss, nail fungus, eczema — is managed with
                  prescription therapy. When your provider prescribes, it goes
                  straight to our partner pharmacy, who contacts you to pay for
                  your medication and ships it to your door. No prescribing fee,
                  no upsell.
                </p>
              </div>
              <ul className="grid gap-3 text-sm">
                {[
                  ["Live video consultation", "15 minutes, one-on-one with an Arkansas APRN"],
                  ["Prescription sent to our pharmacy", "Whenever it's part of your plan — the pharmacy contacts you to fill and ship it"],
                  ["Written treatment plan", "In your dashboard right after the visit"],
                  ["Free reschedule", "Life happens — move your visit once at no charge"],
                ].map(([t, d]) => (
                  <li
                    key={t}
                    className="flex items-start gap-3 rounded-[var(--radius-md)] bg-[var(--card)]/80 p-3 backdrop-blur"
                  >
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--gold)] text-white">
                      <BadgeCheck className="h-3.5 w-3.5" />
                    </span>
                    <span>
                      <span className="block font-medium">{t}</span>
                      <span className="text-[var(--muted-foreground)]">{d}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="mt-6 text-xs text-[var(--muted-foreground)]">
              Prescriptions are at your provider&apos;s clinical judgment. We
              don&apos;t prescribe controlled substances online. Medication is
              paid for separately, directly to the pharmacy that fills it.
            </p>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="arx-wash py-16">
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
                  <div
                    className={`mb-4 flex h-11 w-11 items-center justify-center rounded-full text-white shadow-md ${step.color}`}
                  >
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
