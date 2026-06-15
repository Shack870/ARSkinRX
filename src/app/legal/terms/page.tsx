import { LegalShell, LegalSection } from "@/components/legal-shell";

export const metadata = { title: "Terms & Conditions — ARSkinRX" };

export default function TermsPage() {
  return (
    <LegalShell title="Terms & Conditions" updated="June 2026">
      <p>
        These Terms govern your use of ARSkinRX, a virtual skin care service
        connecting Arkansas residents with licensed Arkansas nurse practitioners
        (APRNs). By creating an account or booking a visit, you agree to these
        Terms.
      </p>
      <LegalSection heading="1. Eligibility & location">
        <p>
          ARSkinRX services are available only to individuals physically located
          in Arkansas at the time of their visit. You must be 18 or older to
          create an account.
        </p>
      </LegalSection>
      <LegalSection heading="2. Not for emergencies">
        <p>
          ARSkinRX does not provide emergency care. If you have a medical
          emergency, call 911 or go to the nearest emergency room.
        </p>
      </LegalSection>
      <LegalSection heading="3. Payment">
        <p>
          Visit fees are charged at the time of booking through our payment
          processor, Stripe. Prices are shown before you pay.
        </p>
      </LegalSection>
      <LegalSection heading="4. Missed visits & rescheduling">
        <p>
          If you miss your appointment window, you may reschedule once at no
          additional charge. To reschedule, use the link in your dashboard.
        </p>
      </LegalSection>
      <LegalSection heading="5. Refund policy">
        <p>
          Refunds are not available within 48 hours of a scheduled visit.
          Outside of that window, refund requests are handled on a case-by-case
          basis. Missed visits are eligible for a free reschedule rather than a
          refund.
        </p>
      </LegalSection>
      <LegalSection heading="6. Prescriptions">
        <p>
          Prescriptions are issued at the independent clinical judgment of the
          treating provider and are not guaranteed. Controlled substances are
          not prescribed through ARSkinRX.
        </p>
      </LegalSection>
      <LegalSection heading="7. Provider relationship">
        <p>
          Providers on ARSkinRX are independent licensed practitioners. ARSkinRX
          provides the technology platform and does not practice medicine.
        </p>
      </LegalSection>
      <LegalSection heading="8. Changes">
        <p>
          We may update these Terms from time to time. Continued use after
          changes constitutes acceptance.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
