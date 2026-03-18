import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { SiteBackground } from "@/components/landing/SiteBackground";

const Terms = () => {
  return (
    <div className="min-h-screen bg-background">
      <SiteBackground />
      <Header />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h1 className="text-4xl font-bold mb-2 text-foreground">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: March 18, 2026</p>

        <div className="prose prose-sm max-w-none space-y-8 text-foreground/90">
          <section>
            <h2 className="text-2xl font-semibold text-foreground">1. Acceptance of Terms</h2>
            <p>
              By accessing or using the PaigeAgent.ai platform ("Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree, do not use the Service. PaigeAgent.ai is operated by PaigeAgent.ai ("Company," "we," "us," or "our").
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground">2. Description of Service</h2>
            <p>
              PaigeAgent.ai provides AI-powered credit education, credit repair guidance, business credit building tools, dispute management, and funding readiness assessment services. Our platform utilizes the A.C.C.E.L. and B.U.I.L.D. frameworks to guide users through structured credit improvement and business credit development programs.
            </p>
            <p>
              <strong>Important:</strong> PaigeAgent.ai is not a credit repair organization as defined under the Credit Repair Organizations Act (CROA), 15 U.S.C. § 1679. We provide technology tools and educational resources. We do not guarantee specific credit score improvements or outcomes.
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
            <h2 className="text-2xl font-semibold text-foreground">5. Credit Repair & Dispute Services</h2>
            <p>
              Our platform assists you in exercising your rights under the Fair Credit Reporting Act (FCRA), 15 U.S.C. § 1681, including your right to dispute inaccurate information on your credit reports. You acknowledge that:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>All disputes are filed on your behalf and at your direction.</li>
              <li>We cannot guarantee the removal of any item from your credit report.</li>
              <li>Results vary based on individual circumstances.</li>
              <li>You have the right to dispute items directly with credit bureaus at no cost.</li>
              <li>You may cancel services at any time without penalty per CROA requirements.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground">6. Consent & Authorization</h2>
            <p>
              Certain features require your explicit consent, including but not limited to:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Accessing your credit report data (soft pulls only, which do not affect your credit score).</li>
              <li>Filing disputes on your behalf with credit bureaus.</li>
              <li>Sharing data with third-party funding partners.</li>
              <li>Receiving communications regarding your account.</li>
            </ul>
            <p>
              All consents are logged with timestamps, IP addresses, and session identifiers for compliance purposes. You may revoke consent at any time through your account settings.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground">7. Subscription & Payments</h2>
            <p>
              Access to premium features requires a paid subscription. By subscribing, you agree to pay the applicable fees. Subscriptions automatically renew unless cancelled before the renewal date. Refunds are handled in accordance with our refund policy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground">8. Funding Marketplace</h2>
            <p>
              Our funding marketplace displays offers from third-party lenders and financial institutions. PaigeAgent.ai is not a lender, broker, or financial advisor. All funding decisions are made by the respective financial institutions. Display of offers does not constitute an endorsement or guarantee of approval.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground">9. Prohibited Conduct</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Provide false or misleading information in disputes or applications.</li>
              <li>Use the Service for any fraudulent or illegal purpose.</li>
              <li>Attempt to manipulate credit data or misrepresent your identity.</li>
              <li>Reverse engineer, decompile, or disassemble any part of the Service.</li>
              <li>Share your account credentials or allow unauthorized access.</li>
              <li>Violate any applicable federal, state, or local law or regulation.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground">10. Intellectual Property</h2>
            <p>
              All content, features, and functionality of the Service — including the A.C.C.E.L. and B.U.I.L.D. frameworks, Paige AI assistant, and associated materials — are owned by PaigeAgent.ai and are protected by copyright, trademark, and other intellectual property laws.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground">11. Disclaimer of Warranties</h2>
            <p>
              THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE. WE DO NOT GUARANTEE ANY SPECIFIC CREDIT SCORE IMPROVEMENT, DISPUTE OUTCOME, OR FUNDING APPROVAL.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground">12. Limitation of Liability</h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, PAIGEAGENT.AI SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF THE SERVICE, INCLUDING BUT NOT LIMITED TO LOSS OF DATA, REVENUE, OR CREDIT OPPORTUNITIES.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground">13. Governing Law & Dispute Resolution</h2>
            <p>
              These Terms shall be governed by the laws of the United States and the state in which PaigeAgent.ai is incorporated. Any disputes arising under these Terms shall be resolved through binding arbitration in accordance with the rules of the American Arbitration Association.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground">14. Changes to Terms</h2>
            <p>
              We reserve the right to modify these Terms at any time. We will notify you of material changes via email or in-app notification. Continued use of the Service after changes constitutes acceptance of the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground">15. Contact Information</h2>
            <p>
              If you have questions about these Terms, please contact us at:
            </p>
            <p className="font-medium">
              PaigeAgent.ai<br />
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
