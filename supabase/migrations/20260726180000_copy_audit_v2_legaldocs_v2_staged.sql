-- Copy Audit v2 (expanded) — §2-clean DB legal_documents v2 (STAGED, not published).
--
-- WHAT: New version-2 rows for the /legal/terms and /legal/privacy documents that
-- EVERY signup legally accepts (rendered from legal_documents WHERE is_current = true).
-- The v1 rows still carry finance-vertical framing (a GLBA section, "fundability
-- scoring / credit intelligence dashboards", credit/funding disclaimers) — a §2
-- violation on the canonical accept-record. These v2 rows are coaching-generic /
-- client-management SaaS docs (referenced against Dubsado / HoneyBook / Bonsai /
-- HubSpot patterns), and add the A2P SMS opt-in section.
--
-- STAGED — DO NOT PUBLISH ON APPLY: both rows are inserted with is_current = FALSE,
-- so the live site keeps rendering v1 (the render uses .maybeSingle() on is_current).
-- Applying this migration has ZERO live impact; it only stages the v2 content in prod
-- for Antonio's paralegal review.
--
-- PUBLISH (Antonio runs this on greenlight — intentionally NOT executed here so CI
-- never auto-publishes; run in one transaction):
--   BEGIN;
--   UPDATE public.legal_documents SET is_current = false WHERE slug IN ('terms','privacy') AND version = 1;
--   UPDATE public.legal_documents SET is_current = true  WHERE slug IN ('terms','privacy') AND version = 2;
--   COMMIT;
-- Reversible: swap the version numbers to roll back to v1.
--
-- GRANDFATHERING (§13): near-zero live tenants today, so versioning is nearly moot.
-- Any user who already accepted v1 is grandfathered on v1; new signups (after publish)
-- accept v2. The version bump + required_at_signup=true means the existing acceptance
-- flow re-prompts for the new version on next use. If Antonio wants FORCED re-acceptance
-- for the handful of existing (dev/test) tenants, that is a separate follow-up he calls.
--
-- SMS text is the owner-mandated verbatim A2P string (matches the pending Twilio/10DLC
-- campaign registration); do not alter it without re-registering the campaign.

INSERT INTO public.legal_documents (slug, version, title, summary, body_md, audience, required_at_signup, effective_date, is_current)
VALUES
  ('privacy', 2, 'Privacy Policy', 'What information we collect, how we use it, and your rights.', $DOC$# Privacy Policy

**Effective Date:** July 26, 2026
**Version:** 2.0

This Privacy Policy describes how Paige Agent AI, LLC ("we") collects, uses, discloses, and protects information when you use PaigeAgent.ai (the "Service").

## 1. Information We Collect
- **Account information:** name, email, phone, password hash, role.
- **Profile & business information:** business details, EIN, industry, entity structure, and owner or team identity attributes you choose to provide.
- **Client & business records:** the client records, contacts, notes, documents, files, messages, and other content you choose to store in the Service to run your practice and manage your clients.
- **Payment information:** billing details processed by our third-party payment processor; we do not store full payment card numbers.
- **Usage data:** pages visited, features used, device, IP address, user agent, timestamps.
- **Communications:** messages you send to Paige, support tickets, and email and SMS correspondence.

## 2. How We Use Information
- Provide, operate, and personalize the Service, including AI-assisted insights and workflows.
- Verify identity, prevent fraud, secure accounts, and enforce our Terms.
- Process payments and manage subscriptions.
- Send service messages, transactional emails, and (with consent) product updates.
- Comply with legal obligations and respond to lawful requests.

## 3. SMS / Text Message Notifications
Users may opt in to receive SMS notifications from Paige Agent AI LLC by providing their phone number and consent during signup. Msg & data rates may apply. Reply STOP to unsubscribe. Reply HELP for support. This service is provided by Paige Agent AI LLC in accordance with US TCPA and CTIA guidelines.

## 4. AI Processing
Your inputs may be sent to AI model providers under contractual obligations that prohibit training on your content and require deletion within a defined retention window. We do not authorize providers to use your Customer Data to train their foundation models.

## 5. Sharing
We share information only with: (a) service providers acting on our behalf, (b) parties you direct us to share with (e.g. a tool or integration you connect to your account), (c) authorities when required by law, and (d) parties to a corporate transaction subject to equivalent privacy protections.

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
Paige Agent AI, LLC — privacy@paigeagent.ai — +1 (470) 594-4470.$DOC$, 'all', true, '2026-07-26'::timestamptz, false),
  ('terms',   2, 'Terms of Service', 'The rules for using PaigeAgent.ai, including acceptable use, billing, and limitation of liability.', $DOC$# Terms of Service

**Effective Date:** July 26, 2026
**Version:** 2.0

These Terms of Service ("Terms") govern your access to and use of the PaigeAgent.ai platform ("Service"), operated by Paige Agent AI, LLC ("Company", "we", "us"). By creating an account or using the Service, you agree to these Terms.

## 1. Eligibility & Account
You must be at least 18 years old and legally able to enter contracts. You are responsible for safeguarding your credentials and for all activity under your account. Notify us immediately of any unauthorized use.

## 2. The Service
PaigeAgent.ai provides AI-assisted client-management and business-operations tools for client-based service businesses — including, but not limited to, client and contact management, workflows and follow-ups, scheduling, onboarding and intake, AI-assisted drafting and insights, and multi-tenant workspace and team-management features. The Service is provided "as is" and we may add, remove, or modify features at any time.

## 3. Subscriptions & Billing
Paid plans are billed in advance on a recurring basis through our payment processor. You authorize us to charge your payment method for the applicable fees, taxes, and any plan changes. Subscriptions renew automatically until cancelled. Refunds are at our discretion as described at checkout or in your plan terms.

## 4. SMS / Text Message Notifications
Users may opt in to receive SMS notifications from Paige Agent AI LLC by providing their phone number and consent during signup. Msg & data rates may apply. Reply STOP to unsubscribe. Reply HELP for support. This service is provided by Paige Agent AI LLC in accordance with US TCPA and CTIA guidelines.

## 5. Acceptable Use
You agree not to: (a) use the Service to violate any law or third-party right; (b) attempt to bypass security controls, rate limits, or access controls; (c) reverse engineer the platform or its AI models; (d) submit information you do not have the right to submit; (e) use the Service to send spam, harass others, or transmit malware; or (f) use AI outputs to make unlawful eligibility, hiring, or similar decisions about individuals.

## 6. Your Content & Data
You retain ownership of data you submit ("Customer Data"). You grant us a worldwide, non-exclusive license to host, process, and display Customer Data solely to operate and improve the Service for you. We will not sell Customer Data to third parties. Aggregated, de-identified analytics may be used to improve the platform.

## 7. AI Outputs
Paige's responses, recommendations, and generated documents are produced by AI and are for informational and operational purposes only. They are not legal, financial, tax, accounting, or investment advice. You are solely responsible for verifying outputs and for any decisions you make based on them. See the AI Advisory Disclaimer for details.

## 8. Tenant & Multi-User Accounts
If you create a workspace ("Tenant"), you are the Tenant Owner and are responsible for the conduct of users you invite, for the lawful basis for any client data you upload, and for any additional terms you impose on your end users. The separate Tenant Master Services Agreement and Data Processing Addendum apply.

## 9. Suspension & Termination
We may suspend or terminate your access for breach of these Terms, suspected fraud, non-payment, or to protect the Service or other users. You may cancel at any time from your account settings. Sections that by their nature should survive termination will survive.

## 10. Disclaimers
TO THE FULLEST EXTENT PERMITTED BY LAW, THE SERVICE IS PROVIDED WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT GUARANTEE ANY SPECIFIC BUSINESS OUTCOME.

## 11. Limitation of Liability
TO THE FULLEST EXTENT PERMITTED BY LAW, OUR TOTAL LIABILITY FOR ANY CLAIMS ARISING OUT OF OR RELATED TO THE SERVICE IS LIMITED TO THE AMOUNTS YOU PAID US IN THE 12 MONTHS PRECEDING THE CLAIM. WE ARE NOT LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES.

## 12. Indemnification
You will defend and indemnify us against claims arising from your misuse of the Service, your Customer Data, or your violation of these Terms or applicable law.

## 13. Governing Law & Disputes
These Terms are governed by the laws of the State of Georgia, USA, without regard to conflicts of law. Disputes will be resolved in the state or federal courts located in Fulton County, Georgia, unless otherwise required by law.

## 14. Changes
We may update these Terms. Material changes will be presented in-app and require your acknowledgment before continued use. Continued use after non-material changes constitutes acceptance.

## 15. Contact
Paige Agent AI, LLC — support@paigeagent.ai — +1 (470) 594-4470.$DOC$, 'all', true, '2026-07-26'::timestamptz, false)
ON CONFLICT (slug, version) DO NOTHING;
