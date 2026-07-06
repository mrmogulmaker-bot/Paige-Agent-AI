
-- Relax audience constraint
ALTER TABLE public.legal_documents DROP CONSTRAINT legal_documents_audience_check;
ALTER TABLE public.legal_documents ADD CONSTRAINT legal_documents_audience_check
  CHECK (audience = ANY (ARRAY['all','tenant_owner','contextual','broker','workforce','business-principal']));

-- Mark existing E-Sign v1 as not current
UPDATE public.legal_documents SET is_current = false, updated_at = now()
WHERE slug = 'esign' AND version = 1;

-- E-Sign v2
INSERT INTO public.legal_documents (slug, version, title, summary, body_md, audience, required_at_signup, is_current, effective_date)
VALUES (
  'esign', 2, 'Electronic Signature & Records Consent',
  'Your consent to receive disclosures, agreements, and records electronically.',
  $body$# Electronic Signature & Records Consent (v2)

**Effective Date:** 2026-06-30

By checking the consent box, you agree under the federal **Electronic Signatures in Global and National Commerce Act (E-SIGN Act, 15 U.S.C. §7001)** to receive all PaigeAgent ("we", "us") records, disclosures, contracts, notices, and other communications ("Records") in electronic form.

## 1. Categories of Records covered
This consent applies to all current and future Records, including: Terms of Service, Privacy Policy, AI Advisory Disclaimer, Consumer Credit Data Authorizations, billing statements, tax forms (e.g., 1099), account notices, dispute outcomes, agreements with tenants/brokers, and any other communications we deliver in connection with your PaigeAgent account.

## 2. Hardware & software you need (E-SIGN §7001(c)(1)(C)(i))
To access and retain the Records electronically you need:
- An internet-connected device (computer, tablet, or smartphone)
- A current version of a major web browser (Chrome, Safari, Edge, or Firefox) with cookies and JavaScript enabled
- A valid email address you control
- A PDF reader (most browsers and operating systems include one)
- Sufficient storage to save downloaded Records, **or** the ability to print them

We will notify you if these requirements materially change and obtain a renewed E-SIGN consent before continuing to deliver Records electronically.

## 3. Reasonable demonstration of access (E-SIGN §7001(c)(1)(C)(ii))
By scrolling through this document inside the PaigeAgent interface, viewing it on the same kind of device and browser you will receive future Records on, and clicking the consent box, you reasonably demonstrate that you can access information in the electronic form in which the Records will be delivered.

## 4. Withdrawing consent
You may withdraw this consent at any time by emailing **support@paigeagent.ai** with the subject line "Withdraw E-SIGN Consent." Withdrawal is effective only after we have a reasonable opportunity to act on it (typically within 5 business days). After withdrawal we may suspend or terminate your account because most PaigeAgent services cannot be delivered without electronic records. Withdrawal does not invalidate Records delivered before the withdrawal took effect.

## 5. Requesting a paper copy
You may request a paper copy of any Record by emailing support@paigeagent.ai. We may charge a reasonable fee not to exceed **$10 per Record** to cover production and mailing, except where prohibited by law.

## 6. Updating your contact information
You are responsible for keeping your email address current in Account Settings. If we receive bounced messages we may suspend electronic delivery and require you to update your contact information.

## 7. Signature
Clicking the consent box, typing your name in any signature field, or otherwise affirmatively indicating assent constitutes your **electronic signature** with the same legal effect as a handwritten signature under E-SIGN, the Uniform Electronic Transactions Act (UETA), and analogous state law.
$body$,
  'all', true, true, now()
);

-- AUP v1
INSERT INTO public.legal_documents (slug, version, title, summary, body_md, audience, required_at_signup, is_current, effective_date)
VALUES (
  'aup', 1, 'Acceptable Use Policy',
  'Rules every PaigeAgent user and tenant must follow.',
  $body$# Acceptable Use Policy (v1)

**Effective Date:** 2026-06-30
**Applies to:** every individual user, tenant owner, tenant administrator, coach, broker, affiliate, and any guest acting through a PaigeAgent account.

This Acceptable Use Policy ("AUP") is incorporated by reference into the Terms of Service and the Tenant Master Services Agreement. Violation may result in immediate suspension or termination without refund and referral to law enforcement.

## 1. No credit-repair or dispute activity inside PaigeAgent
PaigeAgent is a business funding and growth platform, **not** a credit repair organization. You may **not**:
- Use PaigeAgent to draft, send, or track consumer credit disputes to credit reporting agencies (Equifax, Experian, TransUnion) or furnishers
- Offer credit repair services to consumers through PaigeAgent
- Use PaigeAgent to perform any activity that would cause you, your tenant, or PaigeAgent to be a "credit repair organization" under the **Credit Repair Organizations Act, 15 U.S.C. §§1679–1679j**, or under any state credit-services-organization statute (including but not limited to California Civil Code §1789.13, Texas Finance Code Ch. 393, and New York GBL §458-b)

Customers needing credit-repair services should be referred to a separate, properly registered and bonded credit repair organization.

## 2. No FDCPA-regulated debt collection
You may **not** use PaigeAgent's outreach, SMS, email, voice, or workflow features to collect, or attempt to collect, any debt owed to a third party, or any debt owed to you that would subject you to the **Fair Debt Collection Practices Act, 15 U.S.C. §§1692–1692p**, or any state debt-collection statute. PaigeAgent is not designed for, and will not be configured for, FDCPA-regulated activity.

## 3. No synthetic identity, CPN, or file-segregation activity
You may not create, market, sell, or use:
- Credit Privacy Numbers (CPNs), "tradeline" identity numbers, or any number presented to a creditor as a substitute for a Social Security Number
- New EINs obtained for the purpose of suppressing accurate consumer information, or any "file segregation" technique
- Synthetic identities or any combination of real and fictitious identifiers intended to deceive a creditor, government agency, or credit bureau

These practices may violate **18 U.S.C. §1028** (identity fraud), **18 U.S.C. §1014** (false statement to a financial institution), and **15 U.S.C. §1681q** (FCRA criminal liability).

## 4. Permissible-purpose discipline for consumer reports
Before pulling, uploading, viewing, or sharing any consumer report you must have a **permissible purpose** under **FCRA §604, 15 U.S.C. §1681b**, supported by the consumer's signed written instructions or another statutory basis. Tenants and brokers are responsible for collecting and retaining the consumer's authorization; PaigeAgent provides audit-trail infrastructure but does not assume the "user of a consumer report" role on your behalf.

## 5. Data security & GLBA Safeguards
If you are a tenant or broker handling nonpublic personal information ("NPI") of consumers, you agree to maintain administrative, technical, and physical safeguards reasonably designed to comply with the **FTC Safeguards Rule, 16 C.F.R. Part 314**, including the breach-notification requirements that took effect May 13, 2024. You will notify PaigeAgent within 24 hours of any suspected unauthorized access to NPI processed through the platform.

## 6. AI use boundaries
- You will not present AI-generated output as professional legal, accounting, or licensed financial advice
- You will review any AI-drafted client communication for accuracy before sending
- You will not feed real consumer NPI into third-party AI tools outside PaigeAgent without that tool's signed DPA on file

## 7. Prohibited content & conduct
No spam, no unsolicited bulk communications outside CAN-SPAM and TCPA limits, no scraping, no reverse engineering, no resale or sublicensing of PaigeAgent access outside your tenant, no use to harass or discriminate against any consumer in a class protected by **ECOA, 15 U.S.C. §1691**.

## 8. Enforcement
Suspected violations are investigated by PaigeAgent. We may suspend access pending investigation. Confirmed violations result in termination, forfeiture of prepaid fees, and where appropriate, notification to the CFPB, FTC, state attorney general, or law enforcement.
$body$,
  'contextual', false, true, now()
);

-- Broker Producer Agreement v1
INSERT INTO public.legal_documents (slug, version, title, summary, body_md, audience, required_at_signup, is_current, effective_date)
VALUES (
  'broker-agreement', 1, 'Broker Producer Agreement',
  'Required terms for brokers and affiliate producers using PaigeAgent.',
  $body$# Broker Producer Agreement (v1)

**Effective Date:** 2026-06-30

This Broker Producer Agreement ("Agreement") is between **PaigeAgent / Paige Agent AI LLC** ("PaigeAgent") and the individual or entity registering as a broker, affiliate, or independent producer ("Producer").

## 1. Independent contractor relationship
Producer is an **independent contractor**, not an employee, agent, partner, or joint venturer of PaigeAgent. Producer is solely responsible for all federal, state, and local taxes (including self-employment tax) on amounts paid by PaigeAgent, and will provide a current IRS Form **W-9** (or W-8 for non-US persons) before any commission is paid.

## 2. Scope of producer activity
Producer may refer prospective tenants and end-clients to PaigeAgent. Producer may **not**:
- Represent itself as PaigeAgent or as having authority to bind PaigeAgent
- Quote pricing, make warranties, or modify standard PaigeAgent agreements
- Engage in CROA-regulated credit-repair activity, FDCPA-regulated collections, or any activity prohibited by the Acceptable Use Policy
- Solicit a prospective tenant or client already in active sales conversation with PaigeAgent (anti-poach)

## 3. Commission
Commission terms (rate, qualifying events, payment cadence, clawback for refunded transactions) are published in the broker portal commission schedule and may be updated on 30 days' notice. Commission is earned only after the referred customer pays and the refund/chargeback window has closed.

## 4. Licensing & lender relationships
If Producer holds a loan-broker, mortgage-broker, insurance, securities, or any other state-licensed credential, Producer represents and warrants that:
- All licenses are current and in good standing in every state where Producer conducts regulated activity
- Producer's activity through PaigeAgent will be conducted in compliance with all such licensing requirements
- Producer will disclose any compensation received from third-party lenders to the referred customer when required by law (e.g., **RESPA, 12 U.S.C. §2607**, where applicable)

## 5. Confidentiality
Producer will not disclose, copy, or use PaigeAgent customer lists, pricing, internal tools, or any nonpublic information except to perform under this Agreement. Confidentiality survives termination.

## 6. Indemnification
Producer indemnifies PaigeAgent against any claim arising from Producer's misrepresentations, unlicensed activity, violation of this Agreement, or breach of the AUP.

## 7. Termination
Either party may terminate on 30 days' notice, or immediately for cause (AUP violation, fraud, license loss). Earned but unpaid commission accrued before termination remains payable subject to clawback rules.
$body$,
  'broker', false, true, now()
);

-- Workforce Confidentiality Acknowledgment v1
INSERT INTO public.legal_documents (slug, version, title, summary, body_md, audience, required_at_signup, is_current, effective_date)
VALUES (
  'workforce-acknowledgment', 1, 'Workforce Confidentiality & GLBA Safeguards Acknowledgment',
  'Required acknowledgment for coaches and admins added to any PaigeAgent tenant.',
  $body$# Workforce Confidentiality & GLBA Safeguards Acknowledgment (v1)

**Effective Date:** 2026-06-30

By accepting an invitation to act as a coach, administrator, or other workforce member of a PaigeAgent tenant, you acknowledge and agree to the following:

## 1. Nonpublic personal information ("NPI")
In the course of your duties you will access consumer NPI as defined by the **Gramm-Leach-Bliley Act, 15 U.S.C. §6809(4)**, including credit reports, Social Security Numbers, financial account information, and identifying details about consumers. You will treat all NPI as confidential.

## 2. Safeguards Rule duties (16 C.F.R. §314.4)
You will:
- Access NPI only as necessary to perform your assigned duties for the tenant that invited you
- Not download, screenshot, photograph, or copy NPI outside PaigeAgent's authorized interfaces
- Use strong, unique credentials and enable multi-factor authentication
- Lock or sign out of unattended sessions
- Report any suspected unauthorized access to PaigeAgent and the tenant within 24 hours of discovery

## 3. Permissible-purpose discipline (FCRA §604)
You will pull, view, or upload a consumer report only when there is a documented **permissible purpose** under 15 U.S.C. §1681b for the specific consumer involved. Curiosity, personal interest, or research on individuals not assigned to you is prohibited and may constitute a federal violation (15 U.S.C. §1681q).

## 4. No prohibited activity
You will not engage in credit-repair, dispute, debt-collection, CPN/file-segregation, or any other activity prohibited by the PaigeAgent Acceptable Use Policy.

## 5. AI tools
You will not paste consumer NPI into AI tools other than the AI features built into PaigeAgent.

## 6. Audit logging
You understand that every action you take inside PaigeAgent (read, write, send) is audit-logged with your user ID, timestamp, and the affected record, and that PaigeAgent and the tenant may review these logs at any time.

## 7. Termination
Your access ends automatically when your relationship with the tenant ends. You will not retain, transmit, or use any NPI accessed during your engagement.
$body$,
  'workforce', false, true, now()
);

-- GLBA Privacy Notice for Business Principals v1
INSERT INTO public.legal_documents (slug, version, title, summary, body_md, audience, required_at_signup, is_current, effective_date)
VALUES (
  'glba-principal-notice', 1, 'GLBA Privacy Notice for Business Principals',
  'Privacy notice required when a business credit report containing the principal\u2019s SSN is uploaded.',
  $body$# GLBA Privacy Notice for Business Principals (v1)

**Effective Date:** 2026-06-30

This notice describes how the **tenant that engaged you** ("Tenant") and **PaigeAgent** (the platform Tenant uses) handle nonpublic personal information ("NPI") about you as the business principal when business credit information that incorporates your personal identifiers (such as Social Security Number, date of birth, or home address) is processed.

This notice is required by the **Gramm-Leach-Bliley Act, 15 U.S.C. §§6801–6809**, and the **FTC Privacy Rule, 16 C.F.R. Part 313**.

## 1. Information collected
- Identifiers (name, SSN, DOB, home address, email)
- Business credit reports from Dun & Bradstreet, Experian Business, Equifax Small Business, and similar agencies
- Information you or the Tenant provide about your business and its finances

## 2. How information is used
- To establish, evaluate, and service business credit, lender, and vendor relationships on behalf of your business
- To produce funding readiness analyses, lender matches, and reports for the Tenant
- To comply with legal obligations

## 3. Sharing
- With credit reporting agencies, lenders, and vendors as needed to obtain the business credit or funding service your business has requested
- With service providers (including PaigeAgent's hosting and infrastructure providers) bound by written confidentiality and security agreements
- As required by law, court order, or regulatory examination

We do **not** sell your NPI.

## 4. Your rights
- You may request a copy of the information held about you
- You may correct inaccuracies through the Tenant
- You may opt out of certain information sharing where the Safeguards Rule and applicable state law permit; opt-out may limit the services your business can receive
- California residents have additional rights under **CCPA/CPRA**; contact the Tenant for those requests

## 5. Security
We maintain administrative, technical, and physical safeguards designed to comply with the **FTC Safeguards Rule, 16 C.F.R. Part 314**, including encryption in transit and at rest, access controls, and audit logging. If a breach occurs affecting unencrypted NPI of 500 or more consumers, we will notify the FTC and affected individuals as required by 16 C.F.R. §314.5.

## 6. Tenant attestation
The Tenant that uploaded business credit information about your business has attested that it has obtained your authorization to process this information in accordance with this notice. If you did not provide such authorization, contact the Tenant directly and email **support@paigeagent.ai**.
$body$,
  'business-principal', false, true, now()
);
