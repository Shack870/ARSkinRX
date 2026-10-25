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
          Missed visits are not refunded.
        </p>
      </LegalSection>
      <LegalSection heading="5. Cancellation & refund policy">
        <p>
          <strong>Scheduled visits.</strong> Cancel at least 24 hours before
          your visit and you receive a full refund to your original payment
          method. Cancellations made less than 24 hours before the visit, and
          missed visits, are not refunded; a missed visit may instead be
          rescheduled once for free as described above. If your provider
          cancels, you are refunded in full.
        </p>
        <p>
          <strong>No-Wait Live visits.</strong> If you pay for a live visit and
          are never seen by a provider, you are refunded in full. If the
          projected wait is 30 minutes or more and you choose to schedule a
          visit instead, you receive a $20 refund and the remainder is applied
          to your scheduled visit.
        </p>
        <p>
          Refunds are issued automatically when they apply and typically appear
          on your statement within 5–10 business days.
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
      <LegalSection heading="8. SMS / text message program">
        <p>
          <strong>Program:</strong> ARSkinRX Appointment Texts. If you opt in
          (by checking the SMS box when booking or in your profile), ARSkinRX
          sends automated appointment-related text messages to the mobile
          number you provide: booking confirmations, visit reminders, a notice
          when your nurse is ready for your video visit, and queue updates while
          you wait. We do not send marketing texts.
        </p>
        <p>
          <strong>Frequency:</strong> up to 4 messages per visit; frequency
          varies with your appointments. <strong>Message and data rates may
          apply.</strong> Consent is not a condition of purchase.
        </p>
        <p>
          <strong>Reply STOP to cancel</strong> at any time; you will receive
          one final confirmation and no further texts.{" "}
          <strong>Reply HELP for help</strong>, or contact us at{" "}
          <a href="mailto:crystal@arskinrx.com" className="underline">
            crystal@arskinrx.com
          </a>
          . You can also turn texts off in your profile settings.
        </p>
        <p>
          Carriers are not liable for delayed or undelivered messages. See our{" "}
          <a href="/legal/privacy" className="underline">
            Privacy Policy
          </a>{" "}
          for how we handle your information. We do not sell or share your SMS
          opt-in data or mobile number with third parties for marketing
          purposes.
        </p>
      </LegalSection>
      <LegalSection heading="9. Changes">
        <p>
          We may update these Terms from time to time. Continued use after
          changes constitutes acceptance.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
