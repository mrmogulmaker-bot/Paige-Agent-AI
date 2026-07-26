import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { SiteBackground } from "@/components/landing/SiteBackground";
import { PageHead } from "@/components/seo/PageHead";

const Terms = () => {
  return (
    <div className="min-h-screen bg-background">
      <PageHead
        title="Terms of Service — PaigeAgent.ai"
        description="Platform terms and acceptable use for PaigeAgent.ai — the client-management platform operated by PaigeAgent AI LLC (Wyoming)."
        path="/terms"
      />
      <SiteBackground />
      <Header />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h1 className="text-4xl font-bold mb-2 text-foreground">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mb-10">
          Last updated: July 26, 2026 — the plain-English agreement for running your practice on Paige.
        </p>

        <div className="prose prose-sm max-w-none space-y-10 text-foreground/90">
          <section>
            <h2 className="text-2xl font-semibold text-foreground">1. Acceptance of Terms</h2>
            <p>
              By accessing or using the PaigeAgent.ai platform ("Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree, do not use the Service. PaigeAgent.ai is operated by PaigeAgent AI LLC ("Company," "we," "us," or "our").
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground">2. Description of Service</h2>
            <p>
              PaigeAgent.ai is a client-management platform for coaches, consultants, agencies, thought leaders, and advisors. The Service provides tools to onboard clients, manage relationships and workflows, follow up, schedule, and run the day-to-day of your practice, with Paige — our AI assistant — helping you draft, suggest, and act on your behalf.
            </p>
            <p>
              <strong>Important:</strong> Paige assists with your work but does not replace professional judgment. We provide technology tools and do not guarantee any specific business outcome.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground">3. Eligibility</h2>
            <p>
              You must be at least 18 years of age and a legal resident of the United States to use our Service. By using the Service, you represent and warrant that you meet these requirements.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground">4. Account Registration</h2>
            <p>
              You must create an account to access most features. You agree to provide accurate, current, and complete information during registration. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground">5. Subscription &amp; Payments</h2>
            <p>
              Access to premium features requires a paid subscription. By subscribing, you agree to pay the applicable fees. Subscriptions automatically renew unless cancelled before the renewal date. You may cancel your subscription at any time from your account settings; cancellation takes effect at the end of the then-current billing period and is no harder than signup. Refunds are handled in accordance with our refund policy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground">6. SMS / Text Message Notifications</h2>
            <p>
              Users may opt in to receive SMS notifications from Paige Agent AI LLC by providing their phone number and consent during signup. Msg &amp; data rates may apply. Reply STOP to unsubscribe at any time. Reply HELP for support.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground">7. Prohibited Conduct</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Provide false or misleading information through the Service.</li>
              <li>Use the Service for any fraudulent or illegal purpose.</li>
              <li>Misrepresent your identity or impersonate any person or entity.</li>
              <li>Reverse engineer, decompile, or disassemble any part of the Service.</li>
              <li>Share your account credentials or allow unauthorized access.</li>
              <li>Violate any applicable federal, state, or local law or regulation.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground">8. Intellectual Property</h2>
            <p>
              All content, features, and functionality of the Service — including the Paige AI assistant and associated platform materials — are owned by PaigeAgent AI LLC and are protected by copyright, trademark, and other intellectual property laws. Content and records you create and store in the platform remain yours.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground">9. Disclaimer of Warranties</h2>
            <p>
              THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE. WE DO NOT GUARANTEE ANY SPECIFIC BUSINESS OUTCOME.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground">10. Limitation of Liability</h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, PAIGEAGENT AI LLC SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF THE SERVICE, INCLUDING BUT NOT LIMITED TO LOSS OF DATA, REVENUE, OR BUSINESS OPPORTUNITIES.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground">11. Governing Law &amp; Dispute Resolution</h2>
            <p>
              These Terms shall be governed by the laws of the United States and the state in which PaigeAgent AI LLC is incorporated. Any disputes arising under these Terms shall be resolved through binding arbitration in accordance with the rules of the American Arbitration Association.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground">12. Changes to Terms</h2>
            <p>
              We reserve the right to modify these Terms at any time. We will notify you of material changes via email or in-app notification. Continued use of the Service after changes constitutes acceptance of the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground">13. Contact Information</h2>
            <p>
              If you have questions about these Terms, please contact us at:
            </p>
            <p className="font-medium">
              PaigeAgent AI LLC<br />
              Email: support@paigeagent.ai
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Terms;
