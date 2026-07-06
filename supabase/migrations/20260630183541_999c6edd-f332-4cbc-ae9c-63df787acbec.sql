
-- ============================================================
-- Legal documents + acceptances (signup consent system)
-- ============================================================

CREATE TABLE public.legal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  version integer NOT NULL,
  title text NOT NULL,
  summary text,
  body_md text NOT NULL,
  audience text NOT NULL DEFAULT 'all' CHECK (audience IN ('all','tenant_owner','contextual')),
  required_at_signup boolean NOT NULL DEFAULT false,
  effective_date timestamptz NOT NULL DEFAULT now(),
  is_current boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slug, version)
);

GRANT SELECT ON public.legal_documents TO anon, authenticated;
GRANT ALL ON public.legal_documents TO service_role;
ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;

-- Public can read current (and historical) documents — they are intentionally public.
CREATE POLICY "legal_documents public read"
  ON public.legal_documents
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "legal_documents admin write"
  ON public.legal_documents
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX legal_documents_slug_current_idx
  ON public.legal_documents (slug) WHERE is_current = true;

CREATE TRIGGER trg_legal_documents_updated
  BEFORE UPDATE ON public.legal_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================

CREATE TABLE public.legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_slug text NOT NULL,
  document_version integer NOT NULL,
  document_id uuid REFERENCES public.legal_documents(id),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.legal_acceptances TO authenticated;
GRANT ALL ON public.legal_acceptances TO service_role;
ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;

-- Users can read & insert their own acceptances. Append-only — no UPDATE/DELETE policy.
CREATE POLICY "legal_acceptances self read"
  ON public.legal_acceptances
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid()
         OR public.has_role(auth.uid(), 'admin'::app_role)
         OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "legal_acceptances self insert"
  ON public.legal_acceptances
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE INDEX legal_acceptances_user_slug_idx
  ON public.legal_acceptances (user_id, document_slug, document_version DESC);

-- ============================================================
-- Helper: list signup-required docs the caller still needs to (re-)accept.
-- Returns one row per outstanding doc.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_outstanding_consents(_user_id uuid)
RETURNS TABLE (slug text, version integer, title text, summary text, effective_date timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.slug, d.version, d.title, d.summary, d.effective_date
  FROM public.legal_documents d
  WHERE d.is_current = true
    AND d.required_at_signup = true
    AND d.audience IN ('all')
    AND NOT EXISTS (
      SELECT 1 FROM public.legal_acceptances a
      WHERE a.user_id = _user_id
        AND a.document_slug = d.slug
        AND a.document_version >= d.version
    )
  ORDER BY d.slug;
$$;

GRANT EXECUTE ON FUNCTION public.get_outstanding_consents(uuid) TO authenticated;

-- ============================================================
-- Seed v1 documents
-- ============================================================
INSERT INTO public.legal_documents (slug, version, title, summary, body_md, audience, required_at_signup, is_current)
VALUES
('terms', 1, 'Terms of Service',
 'The rules for using PaigeAgent.ai, including acceptable use, billing, and limitation of liability.',
$md$# Terms of Service

**Effective Date:** June 30, 2026
**Version:** 1.0

These Terms of Service ("Terms") govern your access to and use of the PaigeAgent.ai platform ("Service"), operated by Paige Agent AI, LLC ("Company", "we", "us"). By creating an account or using the Service, you agree to these Terms.

## 1. Eligibility & Account
You must be at least 18 years old and legally able to enter contracts. You are responsible for safeguarding your credentials and for all activity under your account. Notify us immediately of any unauthorized use.

## 2. The Service
PaigeAgent.ai provides AI-assisted business growth tools including, but not limited to, fundability scoring, credit intelligence dashboards, coaching workflows, and tenant management features. The Service is provided "as is" and we may add, remove, or modify features at any time.

## 3. Subscriptions & Billing
Paid plans are billed in advance on a recurring basis through our payment processor. You authorize us to charge your payment method for the applicable fees, taxes, and any plan changes. Subscriptions renew automatically until cancelled. Refunds are at our discretion and governed by our published refund policy.

## 4. Acceptable Use
You agree not to: (a) use the Service to violate any law or third-party right; (b) attempt to bypass security controls, rate limits, or access controls; (c) reverse engineer the platform or its AI models; (d) submit information you do not have the right to submit; (e) use the Service to send spam, harass others, or transmit malware; or (f) use AI outputs to make unlawful credit, lending, or hiring decisions.

## 5. Your Content & Data
You retain ownership of data you submit ("Customer Data"). You grant us a worldwide, non-exclusive license to host, process, and display Customer Data solely to operate and improve the Service for you. We will not sell Customer Data to third parties. Aggregated, de-identified analytics may be used to improve the platform.

## 6. AI Outputs
Paige's responses, recommendations, and generated documents are produced by AI and are for informational and operational purposes only. They are not legal, financial, tax, accounting, credit-repair, or investment advice. You are solely responsible for verifying outputs and for any decisions you make based on them. See the AI Advisory Disclaimer for details.

## 7. Tenant & Multi-User Accounts
If you create a workspace ("Tenant"), you are the Tenant Owner and are responsible for the conduct of users you invite, for the lawful basis for any client data you upload, and for any additional terms you impose on your end users. The separate Tenant Master Services Agreement and Data Processing Addendum apply.

## 8. Suspension & Termination
We may suspend or terminate your access for breach of these Terms, suspected fraud, non-payment, or to protect the Service or other users. You may cancel at any time from your account settings. Sections that by their nature should survive termination will survive.

## 9. Disclaimers
TO THE FULLEST EXTENT PERMITTED BY LAW, THE SERVICE IS PROVIDED WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT GUARANTEE ANY SPECIFIC CREDIT, FUNDING, OR BUSINESS OUTCOME.

## 10. Limitation of Liability
TO THE FULLEST EXTENT PERMITTED BY LAW, OUR TOTAL LIABILITY FOR ANY CLAIMS ARISING OUT OF OR RELATED TO THE SERVICE IS LIMITED TO THE AMOUNTS YOU PAID US IN THE 12 MONTHS PRECEDING THE CLAIM. WE ARE NOT LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES.

## 11. Indemnification
You will defend and indemnify us against claims arising from your misuse of the Service, your Customer Data, or your violation of these Terms or applicable law.

## 12. Governing Law & Disputes
These Terms are governed by the laws of the State of Georgia, USA, without regard to conflicts of law. Disputes will be resolved in the state or federal courts located in Fulton County, Georgia, unless otherwise required by law.

## 13. Changes
We may update these Terms. Material changes will be presented in-app and require your acknowledgment before continued use. Continued use after non-material changes constitutes acceptance.

## 14. Contact
Paige Agent AI, LLC — support@paigeagent.ai — +1 (470) 594-4470.
$md$,
 'all', true, true),

('privacy', 1, 'Privacy Policy',
 'What information we collect, how we use it, and your rights — including GLBA-aligned financial data handling.',
$md$# Privacy Policy

**Effective Date:** June 30, 2026
**Version:** 1.0

This Privacy Policy describes how Paige Agent AI, LLC ("we") collects, uses, discloses, and protects information when you use PaigeAgent.ai (the "Service").

## 1. Information We Collect
- **Account information:** name, email, phone, password hash, role.
- **Profile & business information:** business details, EIN, industry, entity structure, owner identity attributes you choose to provide.
- **Financial information:** credit reports, scores, bureau data, banking and statement data, funding application data ("Financial Information").
- **Usage data:** pages visited, features used, device, IP address, user agent, timestamps.
- **Communications:** messages you send to Paige, support tickets, email and SMS correspondence.

## 2. How We Use Information
- Provide, operate, and personalize the Service, including AI-assisted insights and workflows.
- Verify identity, prevent fraud, secure accounts, and enforce our Terms.
- Process payments and manage subscriptions.
- Send service messages, transactional emails, and (with consent) product updates.
- Comply with legal obligations and respond to lawful requests.

## 3. GLBA & Financial Information
Financial Information is "nonpublic personal information" under the Gramm-Leach-Bliley Act. We:
- Use Financial Information only to deliver the Service you requested or as you direct.
- Do **not** sell Financial Information.
- Share Financial Information only with subprocessors strictly necessary to operate the Service (hosting, AI inference, payment processing), each bound by confidentiality and security obligations.
- Apply administrative, technical, and physical safeguards designed to protect Financial Information.

## 4. AI Processing
Your inputs may be sent to AI model providers under contractual obligations that prohibit training on your content and require deletion within a defined retention window. We do not authorize providers to use your Customer Data to train their foundation models.

## 5. Sharing
We share information only with: (a) service providers acting on our behalf, (b) parties you direct us to share with (e.g. lenders you choose to apply to), (c) authorities when required by law, and (d) parties to a corporate transaction subject to equivalent privacy protections.

## 6. Cookies & Analytics
We use first-party cookies and limited analytics to operate the Service. We do not run cross-site advertising trackers.

## 7. Retention
We retain account and operational data for the life of your account and as required by law (typically up to 24 months after account closure for audit, dispute resolution, and fraud prevention). You may request earlier deletion subject to legal retention obligations.

## 8. Your Rights
You may access, correct, export, or delete your personal information from account settings or by emailing privacy@paigeagent.ai. Residents of California, Colorado, Virginia, Connecticut, Utah, and other states with comprehensive privacy laws have additional rights including the right to opt out of sale (we do not sell), targeted advertising (we do not use), and profiling that produces legal effects.

## 9. Security
We use TLS in transit, AES-256 at rest, role-based access controls, audit logging, encrypted secrets storage, and routine vulnerability scanning. No system is perfectly secure; we will notify affected users of any breach as required by law.

## 10. Children
The Service is not directed to children under 18 and we do not knowingly collect information from them.

## 11. International
The Service is hosted in the United States. By using the Service from outside the U.S. you consent to the transfer and processing of your information in the U.S.

## 12. Changes
Material changes will be presented in-app and require acknowledgment before continued use.

## 13. Contact
privacy@paigeagent.ai — Paige Agent AI, LLC — +1 (470) 594-4470.
$md$,
 'all', true, true),

('esign', 1, 'Electronic Signature Consent',
 'Your agreement to do business with us electronically under the federal ESIGN Act and state UETA laws.',
$md$# Electronic Signatures & Records Consent (ESIGN / UETA)

**Effective Date:** June 30, 2026
**Version:** 1.0

By checking the consent box at signup and using PaigeAgent.ai, you consent under the federal Electronic Signatures in Global and National Commerce Act ("ESIGN") and the Uniform Electronic Transactions Act ("UETA") that:

1. **Electronic delivery.** We may provide all communications, disclosures, agreements, notices, invoices, receipts, statements, tax forms, and other records (collectively, "Records") to you in electronic form, including through the Service, by email, or by a link to a website.

2. **Electronic signatures.** Your clicks, taps, typed name, or other affirmative actions in the Service constitute your legally binding electronic signature on the related document or transaction.

3. **Hardware & software.** To access and retain Records you need: a current web browser, a valid email account, a device that can render PDFs and Markdown, and a printer or storage device if you wish to keep paper or local copies.

4. **Updating contact information.** You must keep your email address current in your account settings. We are not responsible for Records that fail to reach an outdated address.

5. **Paper copies.** You may request a paper copy of any Record by emailing support@paigeagent.ai. We may charge a reasonable fee for paper copies that is not otherwise free under applicable law.

6. **Withdrawal of consent.** You may withdraw this consent by emailing support@paigeagent.ai with the subject "Withdraw ESIGN Consent". Withdrawal does not affect the legal validity of Records or signatures provided before withdrawal, and may require us to suspend or terminate your account because the Service relies on electronic delivery.

7. **Scope.** This consent applies to all Records exchanged between you and Paige Agent AI, LLC related to PaigeAgent.ai, including subsequent versions of the Terms of Service, Privacy Policy, and any contextual authorizations such as the Credit Data Authorization and Tenant Agreements.
$md$,
 'all', true, true),

('ai-disclaimer', 1, 'AI Advisory Disclaimer',
 'How to interpret AI-generated output and what Paige is — and is not — qualified to do.',
$md$# AI Advisory Disclaimer

**Effective Date:** June 30, 2026
**Version:** 1.0

PaigeAgent.ai ("Paige") is an AI-powered software tool. By using Paige you acknowledge and agree to the following:

## 1. Informational Use Only
All output from Paige — including written explanations, recommendations, generated documents, scores, decision frameworks, charts, and workflow suggestions — is provided **for informational and operational purposes only**. It is not a substitute for the judgment of a qualified professional.

## 2. Not Professional Advice
Paige does not provide, and its output does not constitute:
- legal advice or the practice of law,
- tax, accounting, or investment advice,
- a credit-repair service or credit-repair organization activity within the meaning of the federal Credit Repair Organizations Act ("CROA") or any state analog,
- an offer or commitment of credit, financing, or insurance,
- a consumer report or credit decision under the Fair Credit Reporting Act ("FCRA"), or
- a fiduciary recommendation under any standard.

## 3. We Do Not File Disputes For You
Paige can help you understand your credit reports and prepare educational materials. **Paige does not send disputes to credit bureaus or furnishers on your behalf.** Any dispute is submitted by you, in your own name, based on information you have independently verified.

## 4. No Guarantees of Outcomes
We do not guarantee any specific credit score change, funding approval, business outcome, or revenue result. Past outcomes do not predict future results.

## 5. AI Can Be Wrong
AI models can produce incomplete, outdated, or inaccurate output ("hallucinations"). You are responsible for independently verifying any output before relying on it for a real-world decision, especially decisions involving money, identity, or legal exposure.

## 6. Decisions About Other People
You must not use Paige output to make adverse decisions about other individuals (employment, credit, housing, insurance) without a separately compliant process under FCRA, ECOA, and other applicable laws.

## 7. Your Responsibility
You are the decision-maker. You agree to consult qualified attorneys, CPAs, lenders, or other professionals for material decisions, and to comply with all laws applicable to your business, your industry, and your clients.
$md$,
 'all', true, true),

('credit-authorization', 1, 'Credit Data Authorization',
 'Your permission for us to receive, store, and process credit-bureau data on your behalf under FCRA §604.',
$md$# Credit Data Authorization

**Effective Date:** June 30, 2026
**Version:** 1.0

You are providing this authorization the first time you upload a credit report, connect a credit-monitoring account, or request Paige to process credit-bureau information about you.

## 1. Permissible Purpose
You authorize Paige Agent AI, LLC and its service providers to obtain, receive, store, and process consumer-report information about you for the **permissible purpose** of providing the services you have requested, including credit intelligence, fundability scoring, and educational guidance. This authorization is given under the Fair Credit Reporting Act ("FCRA") 15 U.S.C. §1681b.

## 2. What You Authorize
- Uploading and parsing PDF or image copies of your tri-merge credit reports.
- Connecting third-party credit monitors (e.g. SmartCredit, Nav) using your own credentials or OAuth, where you authorize the data transfer directly.
- Soft-inquiry style data refreshes where supported by the source.

## 3. What This Is Not
- This is not an authorization for any third party to pull hard inquiries on your credit.
- This is not consent to use your credit information for any purpose other than serving you.
- This is not consent to share your credit data with lenders, vendors, or affiliates without your separate, transaction-specific instruction.

## 4. Data Handling
Credit information is treated as Financial Information under our Privacy Policy and GLBA. It is encrypted at rest, restricted by role-based access, audit-logged, and never sold.

## 5. Revocation
You may revoke this authorization at any time by emailing privacy@paigeagent.ai or by disconnecting the credit source in account settings. Revocation does not affect processing already completed.

## 6. Acknowledgment
You confirm you are the consumer to whom the information pertains, or that you are an authorized user acting on the consumer's behalf with their documented permission.
$md$,
 'contextual', false, true),

('tenant-msa', 1, 'Tenant Master Services Agreement',
 'The agreement governing your use of PaigeAgent.ai as a workspace owner serving your own clients.',
$md$# Tenant Master Services Agreement

**Effective Date:** June 30, 2026
**Version:** 1.0

This Tenant Master Services Agreement ("MSA") supplements the PaigeAgent.ai Terms of Service for any user who creates a workspace ("Tenant") to deliver services to their own clients ("End Clients").

## 1. Tenant Role
You are the controller of any End Client data you upload, invite, or process. We act as your processor for such data under the Data Processing Addendum ("DPA").

## 2. Authority & Lawful Basis
You represent that you have all rights, consents, and lawful bases required to upload End Client data, including any Financial Information, and to authorize Paige to process it on your behalf.

## 3. Acceptable Tenant Use
You will: (a) impose terms on End Clients no less protective than the PaigeAgent.ai Terms and Privacy Policy; (b) maintain accurate records of End Client consents; (c) honor End Client rights requests (access, correction, deletion) and notify us of any request that requires our action; (d) not use the Service to operate a credit-repair organization within the meaning of CROA or any state analog without independently meeting all licensing, bonding, and disclosure obligations; (e) not resell access to the Service except as expressly permitted by your plan.

## 4. Sub-Roles
You may invite Admins, Coaches, Sales Reps, and other team members within your Tenant. You are responsible for their conduct and for the scope of access you grant them.

## 5. Fees & Plan
Your subscription plan controls included seats, contact limits, and feature gates. Overage usage may incur additional fees disclosed in-app prior to charge.

## 6. Data Ownership
You retain ownership of Tenant Data and End Client Data. We retain ownership of the Service, our AI configurations, prompts, model integrations, and aggregated, de-identified usage analytics.

## 7. Confidentiality
Each party will protect the other's confidential information with at least the same care it uses for its own confidential information, and no less than a reasonable standard.

## 8. Suspension
We may suspend a Tenant or specific seats for non-payment, suspected abuse, or legal risk to the Service or other tenants. We will use commercially reasonable efforts to notify you before suspension where lawful and practical.

## 9. Termination
On termination, you may export Tenant Data for 30 days. After 30 days we may delete Tenant Data per the retention schedule in our Privacy Policy.

## 10. Liability
The limitation of liability in the Terms of Service applies to this MSA on an aggregate basis across both documents.

## 11. Order of Precedence
In conflict, the order is: (1) a signed order form, (2) this MSA, (3) the DPA, (4) the Terms of Service.
$md$,
 'tenant_owner', false, true),

('dpa', 1, 'Data Processing Addendum',
 'How we process personal data on a Tenant Owner''s behalf, with subprocessor and security commitments.',
$md$# Data Processing Addendum

**Effective Date:** June 30, 2026
**Version:** 1.0

This Data Processing Addendum ("DPA") forms part of the Tenant Master Services Agreement between Paige Agent AI, LLC ("Processor") and the Tenant Owner ("Controller").

## 1. Roles
Controller determines the purposes and means of processing End Client personal data. Processor processes such data only on documented instructions from Controller (which include configuration, API calls, and the use of in-product features).

## 2. Categories of Data
Identifiers, contact details, business profile, financial profile, credit-report extracts, communications, usage data, and any other data Controller chooses to upload.

## 3. Subprocessors
Processor uses the following categories of subprocessors: cloud hosting (Supabase / AWS), AI inference (Lovable AI Gateway and the underlying foundation-model vendors), payment processing (Stripe), email and SMS delivery, error monitoring, and analytics. Processor will maintain a current subprocessor list and notify Controller of material additions with a reasonable opportunity to object.

## 4. Security
Processor will maintain administrative, technical, and physical safeguards designed to protect End Client data, including: encryption in transit (TLS) and at rest (AES-256), role-based access control, audit logging, secret-management, regular vulnerability scanning, RLS-enforced multi-tenant isolation, and incident-response procedures.

## 5. Confidentiality
Personnel with access to End Client data are bound by written confidentiality obligations.

## 6. Incident Notification
Processor will notify Controller without undue delay (and in any event within 72 hours where required by law) of any confirmed personal-data breach affecting End Client data.

## 7. Data Subject Requests
Processor will assist Controller in responding to End Client requests to access, correct, delete, or port personal data, taking into account the nature of the processing and the information available to Processor.

## 8. International Transfers
Where data is transferred outside the United States, the parties will rely on lawful transfer mechanisms appropriate to the jurisdiction.

## 9. Audit
On reasonable written notice and no more than once per twelve months, Processor will respond to a reasonable security questionnaire from Controller.

## 10. Return / Deletion
On termination of the MSA, Processor will, at Controller's election, return or delete End Client personal data within the timelines stated in the Privacy Policy and applicable law.

## 11. Conflict
In any conflict between this DPA and the Terms of Service, this DPA controls solely with respect to the processing of End Client personal data.
$md$,
 'tenant_owner', false, true);
