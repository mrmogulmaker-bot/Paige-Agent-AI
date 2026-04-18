import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { SiteBackground } from "@/components/landing/SiteBackground";

const Privacy = () => {
  return (
    <div className="min-h-screen bg-background">
      <SiteBackground />
      <Header />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h1 className="text-4xl font-bold mb-2 text-foreground">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: April 18, 2026</p>

        <div className="prose prose-sm max-w-none space-y-8 text-foreground/90">
          {/* === Repositioning Addendum (April 18, 2026) === */}
          <section className="border-l-4 border-accent bg-accent/5 p-5 rounded-r-lg">
            <h2 className="text-xl font-semibold text-foreground mt-0">
              Important Update — April 18, 2026
            </h2>
            <p className="text-sm">
              <strong>PaigeAgent.ai has been repositioned as a business funding intelligence platform.</strong>{" "}
              We are <strong>not</strong> a Credit Repair Organization (CRO) as defined under the Credit Repair Organizations Act (CROA), 15 U.S.C. § 1679. We do not perform, offer, or sell credit repair services.
            </p>
            <p className="text-sm">
              We help small business owners understand how their personal and business credit profiles affect funding eligibility, and we connect them with appropriate capital sources. We do not generate dispute letters, file disputes with credit bureaus, or attempt to remove or modify items on your credit report.
            </p>
            <p className="text-sm">
              For free, self-help credit dispute resources, please use the Consumer Financial Protection Bureau's templates at{" "}
              <a
                href="https://www.consumerfinance.gov/consumer-tools/credit-reports-and-scores/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                consumerfinance.gov/consumer-tools/credit-reports-and-scores
              </a>.
            </p>
            <p className="text-xs text-muted-foreground mt-3">
              This addendum is being reviewed with our fintech counsel; the full policy below will be rewritten in a subsequent update. In any conflict between this addendum and the legacy text below, this addendum controls.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground">1. Introduction</h2>
            <p>
              PaigeAgent.ai ("Company," "we," "us," or "our") is committed to protecting the privacy and security of your personal information. This Privacy Policy describes how we collect, use, disclose, and safeguard your information when you use the PaigeAgent.ai platform ("Service").
            </p>
            <p>
              We comply with the Gramm-Leach-Bliley Act (GLBA), the Equal Credit Opportunity Act (ECOA), the California Consumer Privacy Act (CCPA/CPRA), and applicable state privacy laws.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground">2. Information We Collect</h2>
            <h3 className="text-lg font-medium text-foreground mt-4">2.1 Information You Provide</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Account Information:</strong> Name, email address, phone number, and login credentials.</li>
              <li><strong>Identity Verification:</strong> Last four digits of Social Security Number, date of birth (used solely for credit report access).</li>
              <li><strong>Business Information:</strong> Legal business name, EIN, state of formation, NAICS code, and entity type.</li>
              <li><strong>Financial Information:</strong> Credit report data (obtained with your consent via soft pull), bank statement uploads, and payment information processed through Stripe.</li>
              <li><strong>Documents:</strong> Uploaded files such as business formation documents, tax returns, and financial statements.</li>
            </ul>

            <h3 className="text-lg font-medium text-foreground mt-4">2.2 Information Collected Automatically</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Usage Data:</strong> Pages visited, features used, session duration, and interaction patterns.</li>
              <li><strong>Device Information:</strong> IP address, browser type, operating system, and device identifiers.</li>
              <li><strong>Consent Logs:</strong> Timestamps, IP addresses, and session IDs associated with consent actions.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground">3. How We Use Your Information</h2>
            <p>We use your information to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Provide and improve the Service, including AI-powered credit analysis and guidance.</li>
              <li>Access your credit reports with your authorization (soft pulls only — no impact to your credit score).</li>
              <li>Generate and file credit disputes on your behalf under the FCRA.</li>
              <li>Match you with funding opportunities based on your creditworthiness and business profile.</li>
              <li>Process payments and manage your subscription.</li>
              <li>Communicate service updates, task reminders, and educational content.</li>
              <li>Maintain compliance with FCRA, CROA, GLBA, and other regulatory requirements.</li>
              <li>Prevent fraud and ensure platform security.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground">4. Information Sharing & Disclosure</h2>
            <p>We do not sell your personal information. We may share your information with:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Credit Bureaus:</strong> Equifax, Experian, and TransUnion — for credit report access and dispute filing, only with your explicit consent.</li>
              <li><strong>Financial Partners:</strong> Third-party lenders displayed in our funding marketplace, only when you choose to apply.</li>
              <li><strong>Service Providers:</strong> Stripe (payment processing) and infrastructure providers operating under strict data processing agreements.</li>
              <li><strong>Legal Compliance:</strong> When required by law, regulation, legal process, or government request.</li>
              <li><strong>Business Transfers:</strong> In the event of a merger, acquisition, or sale of assets.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground">5. Data Security</h2>
            <p>We implement industry-standard security measures including:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Encryption of data in transit (TLS 1.2+) and at rest (AES-256).</li>
              <li>Tokenization of sensitive identifiers — we never store raw Social Security Numbers.</li>
              <li>Role-based access control (RBAC) and multi-factor authentication.</li>
              <li>Regular security audits and vulnerability assessments.</li>
              <li>Full audit trails for all data access and modification events.</li>
              <li>Quarterly rotation of API keys and secrets.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground">6. Data Retention</h2>
            <p>
              We retain your personal information for as long as your account is active or as needed to provide the Service. Our default retention period is 24 months from last account activity. After this period, data is anonymized or securely deleted.
            </p>
            <p>
              Compliance-related records (consent logs, dispute records, audit trails) may be retained for up to 7 years as required by applicable regulations.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground">7. Your Rights</h2>
            <p>You have the right to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Access:</strong> Request a copy of the personal information we hold about you.</li>
              <li><strong>Correction:</strong> Request correction of inaccurate or incomplete information.</li>
              <li><strong>Deletion:</strong> Request deletion of your personal data, subject to legal retention requirements.</li>
              <li><strong>Revoke Consent:</strong> Withdraw consent for credit report access, data sharing, or communications at any time through your account settings.</li>
              <li><strong>Data Portability:</strong> Request your data in a portable, machine-readable format.</li>
              <li><strong>Opt-Out:</strong> Opt out of marketing communications at any time.</li>
            </ul>
            <p>
              To exercise any of these rights, contact us at <strong>support@paigeagent.ai</strong> or use the Data Deletion Request feature in your account settings.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground">8. Cookies & Tracking</h2>
            <p>
              We use essential cookies to maintain your session and preferences. We may use analytics tools to understand usage patterns. We do not use third-party advertising trackers. You can manage cookie preferences through your browser settings.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground">9. Children's Privacy</h2>
            <p>
              The Service is not intended for individuals under 18 years of age. We do not knowingly collect personal information from minors. If we learn that we have collected information from a child under 18, we will promptly delete it.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground">10. GLBA Privacy Notice</h2>
            <p>
              In accordance with the Gramm-Leach-Bliley Act, we provide this notice regarding our information-sharing practices. We collect nonpublic personal information from the following sources:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Information you provide on applications and forms.</li>
              <li>Information from credit reporting agencies.</li>
              <li>Information from your transactions with us or our partners.</li>
            </ul>
            <p>
              We do not disclose nonpublic personal information about our customers or former customers to anyone, except as permitted by law and as described in this policy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground">11. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of material changes via email or in-app notification at least 30 days before changes take effect. Continued use of the Service constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-foreground">12. Contact Us</h2>
            <p>
              If you have questions about this Privacy Policy or our data practices, contact us at:
            </p>
            <p className="font-medium">
              PaigeAgent.ai<br />
              Email: privacy@paigeagent.ai
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Privacy;
