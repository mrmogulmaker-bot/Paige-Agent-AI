-- Interim platform SaaS Subscriber Agreements, per signup lane (Task #187)
--
-- Owner directive (2026-07-14): put makeshift, industry-standard SaaS subscriber
-- agreements in place NOW — form-fit to Paige Agent AI and our three account
-- lanes — so a clear, enforceable agreement governs every signup until counsel
-- reviews the whole platform. These are explicitly INTERIM (each carries an
-- interim-terms banner + [PLACEHOLDER — ...] markers for counsel).
--
-- §9 (platform vs tenant): these are the PLATFORM operator <-> subscriber terms
-- (coaching/consulting-generic, one continuous system), NOT a tenant's own
-- client agreement (that is tenant-authored, #74). §2-clean by construction:
-- zero credit/funding/lending vocabulary; broad audience (practice, business,
-- clients, professional services), never narrowed to "coaching."
--
-- Filed into the existing legal_documents registry (§12 extend, don't fork).
-- provision_tenant (20260714130000) requires one of these current docs and
-- records acceptance in legal_acceptances atomically with account creation.
--
-- Lane -> slug:  standalone -> saas-standalone
--                agency     -> saas-agency
--                enterprise -> saas-enterprise
-- audience 'tenant_owner'; required_at_signup FALSE (lane-specific, chosen at the
-- door, not a blanket all-users consent). version 1.

BEGIN;

-- Idempotent reseed: clear any prior current-flag on these three slugs first.
UPDATE public.legal_documents SET is_current = false
 WHERE slug IN ('saas-standalone', 'saas-agency', 'saas-enterprise');

INSERT INTO public.legal_documents
  (slug, version, title, summary, audience, required_at_signup, is_current, effective_date, body_md)
VALUES
(
  'saas-standalone', 1,
  'Standalone / Practice Subscriber Agreement',
  'Interim platform terms for a single practice/business running its own clients on Paige Agent AI. Pending legal review.',
  'tenant_owner', false, true, now(),
$doc_standalone$# Paige Agent AI — Standalone / Practice Subscriber Agreement

> **⚠️ INTERIM TERMS NOTICE.** These are interim, placeholder subscriber terms put in place so that a clear, enforceable agreement governs your use of the Service while our counsel completes a full review of the platform. They are drafted to reflect customary, industry-standard SaaS subscription practice, but they are **not final and are not legal advice.** We may update or replace these terms (see *Modifications to Terms*). Nothing here is a substitute for your own professional or legal advice about your business.

**Document type:** Platform-to-Subscriber agreement (the terms between the platform operator and you, the subscribing business). This is **not** the agreement between you and your own clients — you are responsible for your own client-facing terms.

## 1. Acceptance & Parties

**Plain-English summary:** By signing up or using the Service, you and we both agree to these terms.

This Standalone / Practice Subscriber Agreement (the **"Agreement"**) is entered into between:

- **Paige Agent AI** — the platform operator (**"Paige Agent AI," "we," "us,"** or **"our"**), **[PLACEHOLDER — operating entity legal name, form of entity, and registered address]**; and
- **You** — the individual, practitioner, or business subscribing to the Service on the **standalone / practice** account type (**"you," "your,"** or **"Customer"**).

You accept this Agreement when you do any of the following, whichever occurs first: (a) click "I agree," "Sign up," "Start trial," or a similar affirmation at signup; (b) complete account registration; or (c) access or use the Service. If you accept on behalf of a business or other legal entity, you represent that you are authorized to bind that entity, and "you" refers to that entity. You must be at least 18 years old and able to form a binding contract.

If you do not agree, do not sign up for or use the Service.

## 2. Definitions

- **"Service"** — the Paige Agent AI hosted software platform, including the client portal, customer-relationship and client-management features, the AI assistant and its agent capabilities, associated websites, applications, and APIs, and any documentation, as made available to you.
- **"Account"** — your standalone / practice tenant on the Service, provisioned to you after acceptance of this Agreement.
- **"Customer Data"** — all data, content, records, contacts, messages, files, and materials that you or your Authorized Users submit to, upload to, or generate within the Service, and all data about your own clients that you place on the platform.
- **"Authorized User"** — an individual you permit to access the Service under your Account (for example, you, your staff, or contractors), each acting on your behalf and under your responsibility.
- **"Your Clients"** — the end customers, clients, or contacts of your own business whom you manage using the Service. Your Clients are not parties to this Agreement.
- **"Playbook"** — the tenant-authored configuration (persona, intake questions, journey, templates, and similar settings) by which you tailor the Service to your practice.
- **"Documentation"** — our then-current usage guides and materials describing the Service's features.
- **"Fees"** — the subscription and any usage-based charges payable for the Service.
- **"Privacy Policy"** — our then-current privacy policy, referenced in *Data Protection & Privacy*.
- **"Order"** — your selection of a plan, trial, or add-ons at signup or thereafter.

## 3. Account & Provisioning

**Plain-English summary:** You get your own private workspace ("tenant"); keep your login secure; the info you give us must be accurate.

3.1 **Provisioning.** Upon your acceptance of this Agreement and, where applicable, selection of a plan, we will provision a standalone / practice Account for you. Your Account and Customer Data are logically isolated from other subscribers under our multi-tenant architecture.

3.2 **Registration information.** You agree to provide accurate, current, and complete information at signup and to keep it up to date. **[PLACEHOLDER — any identity or business-verification requirements, to be set by counsel/operations.]**

3.3 **Credentials & security.** You are responsible for maintaining the confidentiality of your login credentials and for all activity that occurs under your Account, whether or not authorized by you. Notify us promptly at the address in *Contact* if you suspect unauthorized access. We are not liable for losses arising from your failure to safeguard credentials.

3.4 **Authorized Users.** You may permit Authorized Users to access the Service under your Account. You are responsible for their compliance with this Agreement and for all acts and omissions of your Authorized Users as if they were your own.

## 4. Subscription, Trial & Fees

**Plain-English summary:** There's a 14-day free trial. After that you pay the plan fees. You can cancel; fees already earned are generally non-refundable.

4.1 **Free trial.** We offer a **14-day trial** of the Service (or such other trial period as stated at signup). During the trial you may use the Service subject to this Agreement and any trial limits we specify. **We may modify or discontinue trials at any time.** Unless you cancel before the trial ends, your subscription may convert to a paid plan and Fees may begin, provided we clearly disclosed this at signup and you supplied a payment method. The Service during a trial is provided **"as is"** and without warranty.

4.2 **Fees.** You agree to pay the Fees for the plan you select. **[PLACEHOLDER — plan names, fee amounts, billing frequency, currency, and any usage-based/metered charges, to be set by counsel/finance.]** Unless stated otherwise, Fees are billed in advance on a recurring basis and are **non-refundable except as required by law or as expressly stated here.**

4.3 **Payment.** You authorize us (and our payment processor) to charge your designated payment method for all Fees when due. **[PLACEHOLDER — payment processor identity and terms.]** You are responsible for keeping payment information current.

4.4 **Taxes.** Fees are exclusive of taxes. You are responsible for all applicable sales, use, VAT, GST, and similar taxes, excluding taxes based on our net income.

4.5 **Late or failed payment.** If a charge fails or Fees are past due, we may retry the charge, suspend the Service (see *Suspension*), and/or apply late charges to the extent permitted by law. **[PLACEHOLDER — late-payment interest/administrative fee, if any.]**

4.6 **Changes to Fees.** We may change Fees on a prospective basis with reasonable prior notice, effective as of your next renewal term. **[PLACEHOLDER — required notice period for fee changes.]** Continued use after the effective date constitutes acceptance.

## 5. Acceptable Use

**Plain-English summary:** Use the Service lawfully and honestly; don't abuse it, break it, or use it to harm others.

5.1 You agree not to, and not to permit any Authorized User or third party to: (a) use the Service in violation of any applicable law or regulation, or the rights of any person; (b) upload, store, or transmit content that is unlawful, defamatory, harassing, abusive, infringing, or that constitutes malware or other harmful code; (c) send unsolicited or unlawful communications, or use the Service in a manner that violates anti-spam, telemarketing, electronic-communications, or consumer-protection laws; (d) attempt to gain unauthorized access to the Service, other tenants' data, or our systems, or probe, scan, or test the vulnerability of the Service without authorization; (e) reverse engineer, decompile, or disassemble the Service, except to the extent this restriction is prohibited by law; (f) resell, sublicense, or provide the Service to third parties as a service bureau, except as expressly permitted by your plan; (g) interfere with or disrupt the integrity or performance of the Service; (h) use the Service to develop a competing product; or (i) use any automated means to access the Service other than through our supported APIs in accordance with the Documentation.

5.2 **Responsibility for content and communications.** You are solely responsible for Customer Data and for all communications you or the Service send on your behalf to Your Clients, including obtaining any consents legally required for such communications and for your own client-facing terms and disclosures.

5.3 **Enforcement.** We may investigate suspected violations and may remove content or suspend access as described in *Suspension*. We are not obligated to monitor Customer Data but may do so to operate and protect the Service.

## 6. Customer Data & Ownership

**Plain-English summary:** Your data is yours. We only process it to run the Service for you.

6.1 **Ownership.** As between the parties, you own and retain all right, title, and interest in and to Customer Data. This Agreement grants us no ownership of Customer Data.

6.2 **License to us.** You grant us a limited, non-exclusive, worldwide license to host, copy, process, transmit, display, and otherwise use Customer Data solely as necessary to (a) provide, secure, maintain, and improve the Service for you; (b) prevent or address technical or security issues; (c) comply with law; and (d) enforce this Agreement. We act on your instructions and process Customer Data as your service provider/processor.

6.3 **Your responsibilities.** You represent that you have all rights and permissions necessary to submit Customer Data to the Service and to authorize our processing of it, including with respect to Your Clients' data.

6.4 **AI features.** The Service includes an AI assistant and automated agents that operate on Customer Data to draft, suggest, personalize, and (where you enable it or approve it) act within your Account. AI-generated outputs may contain errors; you are responsible for reviewing outputs before relying on or sending them. We do not use your Customer Data to train foundation models for the benefit of other customers except as permitted by the Privacy Policy and applicable law, and any model providers we use process data under contractual confidentiality and security obligations. **[PLACEHOLDER — specific AI/model-provider data-handling commitments, to be confirmed by counsel.]**

6.5 **Aggregated/de-identified data.** We may generate and use aggregated or de-identified data that does not identify you, Your Clients, or any individual, to operate, analyze, and improve the Service. Such data does not constitute Customer Data.

6.6 **Export & deletion.** See *Term & Termination* for export and deletion on termination. During the term you may export Customer Data using the Service's export features.

## 7. Data Protection & Privacy

**Plain-English summary:** We protect your data and describe how we handle it in our Privacy Policy. Formal security certification is in progress.

7.1 **Privacy Policy.** Our handling of personal information is described in our Privacy Policy, incorporated by reference. **[PLACEHOLDER — Privacy Policy URL.]** In the event of a conflict between this Agreement and the Privacy Policy regarding our processing of Customer Data as your processor, this Agreement controls for the processing we perform on your behalf.

7.2 **Security.** We maintain administrative, technical, and organizational safeguards designed to protect Customer Data appropriate to its sensitivity and the risks involved, including encryption in transit, access controls, and logical tenant isolation. **[PLACEHOLDER — specific security control commitments, to be confirmed by counsel.]**

7.3 **Compliance program (in progress).** We are actively pursuing formal security attestations and certifications, including **SOC 2**, and are building our program to industry standards. These attestations are **not yet complete**, and references to them describe our roadmap rather than a current certification. We will update our representations as our program matures.

7.4 **Data processing terms.** Where you or Your Clients are subject to data-protection laws (for example, GDPR, UK GDPR, CCPA/CPRA, or similar), a separate Data Processing Addendum ("DPA") governs our processing of personal data as your processor and is incorporated by reference where applicable. **[PLACEHOLDER — DPA specifics: sub-processor list, standard contractual clauses / transfer mechanism, processing details, and DPA URL, to be prepared by counsel.]**

7.5 **Incident notification.** If we become aware of a confirmed security incident affecting your Customer Data, we will notify you without undue delay and provide information reasonably available to us, consistent with applicable law. **[PLACEHOLDER — notification timeframe and method.]**

## 8. Confidentiality

Each party will protect the other's non-public Confidential Information using at least reasonable care, use it only to perform under this Agreement, and disclose it only to personnel, advisors, and contractors bound by comparable confidentiality obligations. Customer Data is your Confidential Information; the Service, Documentation, and non-public pricing are ours. Standard exclusions apply (information that is public, already known, independently developed, or rightfully obtained from a third party), as does disclosure required by law with reasonable notice where lawful.

## 9. Service Availability & Support

9.1 **Availability.** We will use commercially reasonable efforts to make the Service available with high reliability, excluding scheduled maintenance, emergency maintenance, and events outside our reasonable control. **[PLACEHOLDER — uptime/SLA commitment and any service credits, if offered.]**

9.2 **Support.** We provide support through the channels described in the Documentation. **[PLACEHOLDER — support channels, hours, and response targets.]**

9.3 **Maintenance & changes.** We may modify, update, or enhance the Service from time to time and will use reasonable efforts to avoid materially degrading core functionality during your term.

## 10. Intellectual Property

10.1 **Our IP.** We and our licensors own all right, title, and interest in and to the Service, including all software, models, user interfaces, designs, the "Paige Agent AI" and related marks, and all associated intellectual property. Except for the limited right to access and use the Service under this Agreement, no rights are granted to you by implication or otherwise.

10.2 **Your content & configuration.** You retain all rights in Customer Data and in your Playbook content, brand assets, and materials you create in the Service. You grant us only the license in *Customer Data & Ownership* to operate the Service.

10.3 **Feedback.** If you give us suggestions or feedback about the Service, you grant us a perpetual, irrevocable, royalty-free license to use it without restriction.

## 11. Warranties & Disclaimers

11.1 **Limited service warranty.** We warrant that the Service will perform materially in accordance with the Documentation during your paid subscription term. Your exclusive remedy for breach of this warranty is our commercially reasonable effort to correct the non-conformity or, if we cannot, termination and a pro-rata refund of prepaid, unused Fees for the affected period.

11.2 **DISCLAIMER.** EXCEPT AS EXPRESSLY STATED IN THIS AGREEMENT, THE SERVICE, INCLUDING ALL AI FEATURES AND OUTPUTS, IS PROVIDED **"AS IS" AND "AS AVAILABLE," AND WE DISCLAIM ALL WARRANTIES, EXPRESS, IMPLIED, OR STATUTORY, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT.** WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE, OR THAT AI-GENERATED OUTPUTS WILL BE ACCURATE, COMPLETE, OR SUITABLE FOR YOUR PURPOSES. YOU ARE RESPONSIBLE FOR REVIEWING AND VERIFYING OUTPUTS BEFORE USE.

11.3 **No professional advice.** The Service is a software tool. It does not provide legal, tax, financial, or other professional advice, and nothing it generates should be relied on as such. You remain responsible for your own professional obligations to Your Clients.

## 12. Limitation of Liability

12.1 TO THE MAXIMUM EXTENT PERMITTED BY LAW, NEITHER PARTY WILL BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR EXEMPLARY DAMAGES, OR FOR LOST PROFITS, REVENUE, GOODWILL, OR DATA, ARISING OUT OF OR RELATED TO THIS AGREEMENT.

12.2 **Cap.** TO THE MAXIMUM EXTENT PERMITTED BY LAW, EACH PARTY'S TOTAL AGGREGATE LIABILITY WILL NOT EXCEED **[PLACEHOLDER — liability cap, e.g., amounts paid by you to us in the 12 months preceding the claim]**.

12.3 **Exceptions.** The exclusions and cap do not apply to your payment obligations, either party's indemnification obligations, breach of confidentiality, or liability that cannot be limited by law. **[PLACEHOLDER — confirm carve-outs with counsel.]**

## 13. Indemnification

13.1 **By you.** You will defend and indemnify us against third-party claims arising from (a) Customer Data; (b) your or your Authorized Users' use of the Service in violation of this Agreement or law; or (c) your communications with, or obligations to, Your Clients.

13.2 **By us.** We will defend and indemnify you against third-party claims alleging that the Service, as provided by us and used in accordance with this Agreement, infringes a third party's intellectual property rights. This does not apply to claims arising from Customer Data, your configurations, or use in combination with non-Paige products.

13.3 **Procedure.** The indemnified party will promptly notify the indemnifying party, allow it to control the defense, and reasonably cooperate.

## 14. Term & Termination

**Plain-English summary:** You can cancel — including before your account is even set up. On termination you can export your data, and we delete it after a wind-down window.

14.1 **Term.** This Agreement begins when you accept it and continues for your subscription term (and any renewals) until terminated.

14.2 **Pre-provisioning self-serve cancellation.** If you have accepted this Agreement but your Account has **not yet been provisioned**, you may cancel immediately at no charge through the signup flow or by contacting us, and this Agreement will terminate with no further obligation.

14.3 **Cancellation & non-renewal.** You may cancel your subscription or disable auto-renewal at any time through the Service's self-serve controls or by contacting us. Cancellation takes effect at the end of the then-current billing period; you retain access until then, and Fees already earned are non-refundable except as stated in this Agreement.

14.4 **Termination for cause.** Either party may terminate if the other materially breaches and fails to cure within **[PLACEHOLDER — cure period, e.g., 30 days]** after written notice. We may terminate or suspend immediately for breaches of *Acceptable Use* or non-payment.

14.5 **Data export.** For **[PLACEHOLDER — export window, e.g., 30 days]** after termination, you may export Customer Data using the Service's export features, unless prohibited by law.

14.6 **Data deletion.** Following the export window, we will delete or de-identify Customer Data within **[PLACEHOLDER — deletion timeframe]**, except for copies retained in routine backups (deleted on our standard cycle) or as required by law.

14.7 **Survival.** Sections that by their nature should survive (including Definitions, Customer Data & Ownership, Confidentiality, IP, Warranties & Disclaimers, Limitation of Liability, Indemnification, and Governing Law) survive termination.

## 15. Suspension

We may suspend your access to all or part of the Service if (a) Fees are past due after notice; (b) we reasonably believe the Service is being used in violation of *Acceptable Use* or law, or in a way that threatens the security, integrity, or availability of the Service or other tenants; or (c) required by law or legal process. We will use reasonable efforts to give notice and to limit the suspension in scope and duration, and we will restore access promptly once the cause is resolved.

## 16. Modifications to Terms

Because these are interim terms, we expect to update them, including following legal review. We may modify this Agreement by posting an updated version and, for material changes, providing reasonable notice before the changes take effect. **[PLACEHOLDER — notice period for material changes.]** Changes apply prospectively. Continued use after the effective date constitutes acceptance.

## 17. Governing Law & Dispute Resolution

This Agreement is governed by, and construed in accordance with, the laws of **[PLACEHOLDER — governing jurisdiction, to be set by counsel]**, without regard to conflict-of-laws rules. The parties submit to the exclusive jurisdiction and venue of the courts located in **[PLACEHOLDER — venue/forum, to be set by counsel]**. **[PLACEHOLDER — optional arbitration clause, class-action waiver, and informal dispute-resolution steps, to be determined by counsel.]**

## 18. General

Entire agreement; no assignment without consent (except to a successor with notice); no third-party beneficiaries; force majeure; severability; waiver; independent contractors. Legal notices to us: **[PLACEHOLDER — legal notice address / email]**. We may send notices to the email associated with your Account.

## 19. Contact

**Paige Agent AI** — General/support: **[PLACEHOLDER — support email/URL]**. Legal notices: **[PLACEHOLDER — legal contact and mailing address]**. Privacy inquiries: **[PLACEHOLDER — privacy contact]**.

---

*These interim terms are provided to establish a clear, good-faith agreement pending completion of formal legal review. They are not legal advice. Bracketed placeholders must be finalized by counsel before these terms are treated as final.*$doc_standalone$
),
(
  'saas-agency', 1,
  'Agency Subscriber Agreement',
  'Interim platform terms for an agency that manages sub-accounts on Paige Agent AI, including reseller responsibility and sub-account isolation. Pending legal review.',
  'tenant_owner', false, true, now(),
$doc_agency$# Paige Agent AI — Agency Subscriber Agreement

> **⚠️ INTERIM TERMS NOTICE.** These are interim, placeholder subscriber terms put in place so that a clear, enforceable agreement governs your use of the Service while our counsel completes a full review of the platform. They reflect customary, industry-standard SaaS practice for agency/multi-account subscribers, but they are **not final and are not legal advice.** We may update or replace these terms (see *Modifications to Terms*).

**Document type:** Platform-to-Subscriber agreement between the platform operator and you, an **Agency** subscriber that manages sub-accounts on the platform. This is **not** the agreement between you (or your sub-accounts) and their own clients — those are separate and are your and your sub-accounts' responsibility.

## 1. Acceptance & Parties

**Plain-English summary:** By signing up as an Agency, you and we both agree to these terms — and you accept responsibility for the sub-accounts you run.

This Agency Subscriber Agreement (the **"Agreement"**) is entered into between **Paige Agent AI** — the platform operator (**"we," "us,"** or **"our"**), **[PLACEHOLDER — operating entity legal name, form of entity, and registered address]** — and **you**, the agency or organization subscribing on the **agency** account type (**"you," "your," "Agency,"** or **"Customer"**).

You accept this Agreement when you (a) click "I agree," "Sign up," "Start trial," or a similar affirmation at signup; (b) complete registration; or (c) access or use the Service. If you accept on behalf of an entity, you represent you are authorized to bind it. You must be at least 18 years old and able to form a binding contract. If you do not agree, do not sign up for or use the Service.

## 2. Definitions

- **"Service"** — the Paige Agent AI hosted platform, including the client portal, client-management/CRM features, the AI assistant and its agent capabilities, agency management tools, associated websites, applications, APIs, and Documentation.
- **"Agency Account"** — your top-level agency tenant on the Service.
- **"Sub-Account"** — a child tenant that you create, provision, or manage under your Agency Account. Your plan may permit **unlimited Sub-Accounts.**
- **"Managed Users"** — collectively, your Authorized Users and all users of your Sub-Accounts.
- **"Customer Data"** — all data, content, records, contacts, messages, and files that you, your Sub-Accounts, or Managed Users submit to or generate within the Service, across the Agency Account and all Sub-Accounts.
- **"End Clients"** — the end customers/clients of you or your Sub-Accounts managed using the Service. End Clients are not parties to this Agreement.
- **"Playbook," "Fees," "Documentation," "Privacy Policy," "Order"** — as commonly understood and as described in this Agreement.

## 3. Account & Provisioning

3.1 **Provisioning.** Upon acceptance and, where applicable, selection of a plan, we will provision your Agency Account. From it you may create and manage Sub-Accounts up to the limits of your plan (which may be unlimited).

3.2 **Tenant isolation.** Each Sub-Account is a logically isolated tenant. Customer Data of one Sub-Account is segregated from other Sub-Accounts and from other subscribers under our multi-tenant architecture. You control which of your Authorized Users may access which Sub-Accounts.

3.3 **Registration information.** You agree to provide accurate, current, and complete information for the Agency Account and, where you provision them, Sub-Accounts. **[PLACEHOLDER — verification requirements for agencies and/or sub-accounts.]**

3.4 **Credentials & security.** You are responsible for safeguarding credentials for the Agency Account and for administering access across Sub-Accounts, and for all activity under the Agency Account and all Sub-Accounts you manage. Notify us promptly of suspected unauthorized access.

## 4. Sub-Accounts & Reseller Terms

**Plain-English summary:** You can provision the platform down to sub-accounts, but you're responsible for what they do, you must not enable prohibited content for them, and each sub-account's data stays isolated.

4.1 **Your role.** You may provision, configure, and make platform capabilities available to your Sub-Accounts, and, where your plan permits, resell or package access to them under your own brand and pricing. As between you and us, **you are the responsible subscriber for every Sub-Account you create or manage.**

4.2 **Responsibility for Sub-Accounts.** You are fully responsible and liable for (a) each Sub-Account's and Managed User's use of the Service; (b) their compliance with this Agreement, the *Acceptable Use* section, and applicable law; and (c) all Customer Data across your Sub-Accounts. Any act or omission of a Sub-Account or Managed User that would breach this Agreement if done by you is deemed your breach.

4.3 **Flow-down obligations.** Before granting access, you will bind each Sub-Account to terms at least as protective as this Agreement (including *Acceptable Use*, data-handling, and prohibited-content restrictions). You will not represent to Sub-Accounts that we provide warranties or commitments beyond those in this Agreement.

4.4 **Prohibited content and configurations.** You will **not** enable, provision, configure, or encourage any Sub-Account to use the Service for content or purposes prohibited by *Acceptable Use* or by law. You are responsible for ensuring your Sub-Accounts' configurations, Playbooks, templates, and communications remain lawful and within the permitted scope of the Service.

4.5 **Provisioning and de-provisioning.** You may suspend, reconfigure, or terminate a Sub-Account you manage. Termination of your Agency Account affects all Sub-Accounts under it; you are responsible for notifying your Sub-Accounts and for handling their Customer Data consistent with your own obligations to them.

4.6 **Data isolation and access.** You may, through agency administration tools, access or manage Customer Data within Sub-Accounts you provision, solely to operate and support them and consistent with your obligations to your Sub-Accounts and End Clients. You are responsible for obtaining any consents or authority required for such access. We provide tenant isolation between Sub-Accounts; we do not adjudicate disputes between you and your Sub-Accounts.

4.7 **Independent relationship.** Your relationship with your Sub-Accounts is solely between you and them. We have no contractual relationship with, and owe no obligations to, your Sub-Accounts or End Clients under this Agreement, and they are not third-party beneficiaries.

## 5. Subscription, Trial & Fees

5.1 **Free trial.** We offer a **14-day trial** (or as stated at signup), subject to this Agreement and any trial limits. We may modify or discontinue trials at any time. Trial use is provided **"as is"** without warranty.

5.2 **Fees.** You agree to pay the Agency plan Fees. **[PLACEHOLDER — agency plan structure, per-sub-account or usage-based components, amounts, billing frequency, currency.]** Unless stated otherwise, Fees are billed in advance and are non-refundable except as required by law or expressly stated here.

5.3 **Your billing of Sub-Accounts.** If you resell or charge your Sub-Accounts, you do so in your own name and on your own account. You are solely responsible for your pricing, invoicing, collections, taxes, refunds, and disputes with your Sub-Accounts. We are not a party to and have no liability for those arrangements.

5.4 **Payment, taxes, late payment, and fee changes.** You authorize charges to your payment method; Fees exclude taxes; we may retry, suspend, or apply late charges for past-due Fees; and we may change Fees prospectively with reasonable notice effective at renewal. **[PLACEHOLDER — payment processor, taxes, late-payment terms, fee-change notice period.]**

## 6. Acceptable Use

6.1 You agree, and will ensure each Sub-Account and Managed User agrees, not to: (a) use the Service in violation of law or the rights of any person; (b) upload or transmit unlawful, defamatory, harassing, infringing, or malicious content or code; (c) send unsolicited or unlawful communications, or violate anti-spam, telemarketing, electronic-communications, or consumer-protection laws; (d) attempt unauthorized access to the Service, other tenants' data, or our systems; (e) reverse engineer the Service except where prohibited by law; (f) interfere with or disrupt the Service; (g) use the Service to build a competing product; or (h) access the Service by automated means other than supported APIs per the Documentation.

6.2 **Communications responsibility.** You and your Sub-Accounts are responsible for all communications sent to End Clients through the Service, including obtaining legally required consents.

6.3 **Enforcement.** We may investigate suspected violations and remove content or suspend access (see *Suspension*), including at the Sub-Account level, without waiving your responsibility for the underlying conduct.

## 7. Customer Data & Ownership

7.1 **Ownership.** As between the parties, you (and, as applicable, your Sub-Accounts) own and retain all rights in Customer Data. This Agreement grants us no ownership.

7.2 **License to us.** You grant us a limited, non-exclusive, worldwide license to host, copy, process, transmit, and display Customer Data solely to (a) provide, secure, maintain, and improve the Service; (b) address technical or security issues; (c) comply with law; and (d) enforce this Agreement. We act as your service provider/processor.

7.3 **Authority.** You represent that you and your Sub-Accounts have all rights and consents necessary to submit Customer Data (including End Clients' data) to the Service and to authorize our processing, and that you are authorized to make these commitments on behalf of your Sub-Accounts.

7.4 **AI features.** The Service's AI assistant and automated agents operate on Customer Data to draft, suggest, personalize, and (where enabled or approved) act within accounts. Outputs may contain errors and must be reviewed before reliance. We do not use Customer Data to train foundation models for other customers except as permitted by the Privacy Policy and law; model providers process data under confidentiality and security obligations. **[PLACEHOLDER — AI/model-provider data-handling commitments.]**

7.5 **Aggregated/de-identified data.** We may create and use aggregated or de-identified data that identifies no person or tenant to operate and improve the Service.

## 8. Data Protection & Privacy

8.1 **Privacy Policy.** Our Privacy Policy is incorporated by reference. **[PLACEHOLDER — Privacy Policy URL.]** For processing we perform on your behalf, this Agreement (and any DPA) controls over the Privacy Policy in the event of conflict.

8.2 **Security.** We maintain administrative, technical, and organizational safeguards appropriate to the data and risks, including encryption in transit, access controls, and logical isolation between the Agency Account and each Sub-Account. **[PLACEHOLDER — specific security control commitments.]**

8.3 **Compliance program (in progress).** We are actively pursuing formal attestations including **SOC 2**; these are **not yet complete**, and references describe our roadmap rather than a current certification.

8.4 **Data processing terms.** A Data Processing Addendum ("DPA") governs our processing of personal data as processor and is incorporated by reference where applicable, including with respect to Sub-Accounts. You are responsible for ensuring your arrangements with Sub-Accounts and End Clients are consistent with the DPA. **[PLACEHOLDER — DPA specifics: sub-processors, transfer mechanism, processing details, DPA URL.]**

8.5 **Incident notification.** We will notify you without undue delay of a confirmed security incident affecting Customer Data under your Agency Account or its Sub-Accounts, consistent with law. **[PLACEHOLDER — notification timeframe/method.]** You are responsible for onward notification to your Sub-Accounts and End Clients as required.

## 9. Confidentiality

Each party will protect the other's non-public Confidential Information using at least reasonable care, use it only to perform under this Agreement, and disclose it only to personnel, advisors, and contractors bound by comparable confidentiality obligations. Customer Data is your Confidential Information; the Service, Documentation, and non-public pricing are ours. Standard exclusions apply.

## 10. Service Availability & Support

10.1 **Availability.** We will use commercially reasonable efforts to keep the Service available with high reliability, excluding scheduled and emergency maintenance and events beyond our reasonable control. **[PLACEHOLDER — uptime/SLA and any service credits.]**

10.2 **Support.** We provide support through the channels in the Documentation. **[PLACEHOLDER — agency support tier, channels, hours, response targets.]** You are the first line of support for your Sub-Accounts and Managed Users.

10.3 **Changes.** We may modify or enhance the Service and will use reasonable efforts to avoid materially degrading core functionality during your term.

## 11. Intellectual Property

11.1 **Our IP.** We and our licensors own all rights in the Service, including software, models, interfaces, designs, and the "Paige Agent AI" and related marks. No rights are granted except the limited right to access and use the Service under this Agreement.

11.2 **Your content & branding.** You and your Sub-Accounts retain all rights in Customer Data and in Playbooks, brand assets, and materials created in the Service. Where your plan supports agency branding, you retain your own marks; you grant us only the license needed to display them within the Service to operate it for you.

11.3 **Feedback.** You grant us a perpetual, irrevocable, royalty-free license to use feedback and suggestions without restriction.

## 12. Warranties & Disclaimers

12.1 **Authority.** Each party represents it has authority to enter into this Agreement, and you further represent you have authority to bind your Sub-Accounts to the flow-down obligations here.

12.2 **Limited service warranty.** We warrant the Service will perform materially per the Documentation during your paid term. Your exclusive remedy for breach is our commercially reasonable effort to correct the non-conformity or, failing that, termination and a pro-rata refund of prepaid, unused Fees for the affected period.

12.3 **DISCLAIMER.** EXCEPT AS EXPRESSLY STATED, THE SERVICE, INCLUDING ALL AI FEATURES AND OUTPUTS, IS PROVIDED **"AS IS" AND "AS AVAILABLE,"** AND WE DISCLAIM ALL IMPLIED OR STATUTORY WARRANTIES, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE, OR THAT AI OUTPUTS WILL BE ACCURATE OR SUITABLE.

12.4 **No professional advice.** The Service is a software tool and does not provide legal, tax, financial, or other professional advice.

## 13. Limitation of Liability

13.1 TO THE MAXIMUM EXTENT PERMITTED BY LAW, NEITHER PARTY WILL BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR EXEMPLARY DAMAGES, OR FOR LOST PROFITS, REVENUE, GOODWILL, OR DATA.

13.2 **Cap.** TO THE MAXIMUM EXTENT PERMITTED BY LAW, EACH PARTY'S TOTAL AGGREGATE LIABILITY WILL NOT EXCEED **[PLACEHOLDER — liability cap, e.g., amounts paid by you to us in the 12 months preceding the claim]**. This cap applies in the aggregate across the Agency Account and all Sub-Accounts; claims arising from Sub-Accounts do not multiply the cap.

13.3 **Exceptions.** The exclusions and cap do not apply to your payment obligations, either party's indemnification obligations, breach of confidentiality, or liability that cannot be limited by law. **[PLACEHOLDER — confirm carve-outs with counsel.]**

## 14. Indemnification

14.1 **By you.** You will defend and indemnify us against third-party claims arising from (a) Customer Data; (b) use of the Service by you, any Sub-Account, or any Managed User in violation of this Agreement or law; (c) your provisioning, resale, or management of Sub-Accounts; or (d) communications with or obligations to your Sub-Accounts or End Clients. **This includes claims brought by your own Sub-Accounts or End Clients.**

14.2 **By us.** We will defend and indemnify you against third-party claims alleging that the Service, as provided by us and used in accordance with this Agreement, infringes a third party's intellectual property rights — excluding claims arising from Customer Data, configurations, or combinations with non-Paige products.

14.3 **Procedure.** Prompt notice, control of defense by the indemnifying party, and reasonable cooperation.

## 15. Term & Termination

**Plain-English summary:** You can cancel — including before provisioning. On termination you and your sub-accounts can export data, then we delete it after a wind-down window.

15.1 **Term.** Begins on acceptance and continues for your subscription term (and renewals) until terminated.

15.2 **Pre-provisioning self-serve cancellation.** If you accepted this Agreement but your Agency Account has **not yet been provisioned**, you may cancel immediately at no charge through the signup flow or by contacting us, terminating this Agreement with no further obligation.

15.3 **Cancellation & non-renewal.** You may cancel or disable auto-renewal at any time via self-serve controls or by contacting us. Cancellation takes effect at the end of the current billing period; earned Fees are non-refundable except as stated here.

15.4 **Termination for cause.** Either party may terminate for uncured material breach after **[PLACEHOLDER — cure period]** written notice. We may suspend or terminate immediately for *Acceptable Use* breaches or non-payment.

15.5 **Effect on Sub-Accounts.** Termination of the Agency Account terminates access for all Sub-Accounts under it. You are responsible for notifying your Sub-Accounts and for handling their Customer Data per your obligations to them.

15.6 **Data export & deletion.** For **[PLACEHOLDER — export window, e.g., 30 days]** after termination, you (and, as you enable, your Sub-Accounts) may export Customer Data. After the export window, we will delete or de-identify Customer Data across the Agency Account and Sub-Accounts within **[PLACEHOLDER — deletion timeframe]**, except routine backups or as required by law.

15.7 **Survival.** Sections that by nature survive (including Definitions, Sub-Accounts & Reseller responsibility/indemnity provisions, Customer Data & Ownership, Confidentiality, IP, Warranties, Limitation of Liability, Indemnification, and Governing Law) survive termination.

## 16. Suspension

We may suspend access to all or part of the Service, including a specific Sub-Account, if (a) Fees are past due after notice; (b) we reasonably believe the Service is used in violation of *Acceptable Use* or law, or in a way that threatens security, integrity, or availability for other tenants; or (c) required by law. We will use reasonable efforts to notify you and to limit the suspension's scope, preferring Sub-Account-level suspension over agency-wide suspension where the issue is isolated.

## 17. Modifications to Terms

Because these are interim terms, we expect to update them, including after legal review. We may modify this Agreement by posting an updated version and, for material changes, giving reasonable prior notice. **[PLACEHOLDER — notice period for material changes.]** Changes apply prospectively to you and to your Sub-Accounts. Continued use after the effective date constitutes acceptance.

## 18. Governing Law & Dispute Resolution

This Agreement is governed by the laws of **[PLACEHOLDER — governing jurisdiction, to be set by counsel]**, without regard to conflict-of-laws rules, and the parties submit to the exclusive jurisdiction and venue of the courts in **[PLACEHOLDER — venue/forum, to be set by counsel]**. **[PLACEHOLDER — optional arbitration, class-action waiver, and informal dispute-resolution steps.]**

## 19. General

Entire agreement; no assignment without consent (except to a successor with notice); neither your Sub-Accounts nor End Clients are third-party beneficiaries; force majeure; severability; waiver; independent contractors. Legal notices to us: **[PLACEHOLDER — legal notice address/email]**. We may notice you at the email associated with your Agency Account.

## 20. Contact

**Paige Agent AI** — General/support: **[PLACEHOLDER — support email/URL]**. Legal notices: **[PLACEHOLDER — legal contact and mailing address]**. Privacy inquiries: **[PLACEHOLDER — privacy contact]**.

---

*These interim terms are provided to establish a clear, good-faith agreement pending completion of formal legal review. They are not legal advice. Bracketed placeholders must be finalized by counsel before these terms are treated as final.*$doc_agency$
),
(
  'saas-enterprise', 1,
  'Enterprise Subscriber Agreement',
  'Interim baseline platform terms for an enterprise organization on Paige Agent AI, applying until superseded by a negotiated order form. Pending legal review.',
  'tenant_owner', false, true, now(),
$doc_enterprise$# Paige Agent AI — Enterprise Subscriber Agreement

> **⚠️ INTERIM TERMS NOTICE.** These are interim, placeholder subscriber terms put in place so that a clear, enforceable baseline governs your use of the Service while our counsel completes a full review of the platform and while any negotiated enterprise agreement is finalized. They reflect customary, industry-standard SaaS practice for enterprise subscribers, but they are **not final and are not legal advice.** They apply until superseded by a negotiated master agreement or order form (see *Custom Terms & Order Form*), and may otherwise be updated (see *Modifications to Terms*).

**Document type:** Platform-to-Subscriber agreement between the platform operator and you, an **Enterprise** subscriber. This is **not** the agreement between you and your own clients — those are separate and are your responsibility.

## 1. Acceptance & Parties

This Enterprise Subscriber Agreement (the **"Agreement"**) is entered into between **Paige Agent AI** — the platform operator (**"we," "us,"** or **"our"**), **[PLACEHOLDER — operating entity legal name, form of entity, and registered address]** — and **you**, the organization subscribing on the **enterprise** account type (**"you," "your," "Enterprise Customer,"** or **"Customer"**).

You accept this Agreement when you (a) click "I agree" or a similar affirmation; (b) execute an Order Form referencing it; or (c) access or use the Service. The individual accepting represents they are authorized to bind your organization. If you do not agree, do not sign up for or use the Service.

## 2. Custom Terms & Order Form

**Plain-English summary:** This baseline applies now; if we sign a negotiated master agreement or order form, that controls where it differs.

2.1 **Baseline terms.** These terms are a baseline that applies to your Enterprise use of the Service **until and unless superseded**, in whole or in part, by a mutually executed master services agreement, enterprise agreement, or order form (each, an **"Order Form"**) between you and us.

2.2 **Precedence.** In the event of a conflict, a mutually executed Order Form controls over this Agreement to the extent of the conflict; otherwise this Agreement governs. An Order Form may address negotiated pricing and payment terms, term length, service levels and support tiers, security and compliance commitments, data processing and residency, seat/team scope, and custom features or professional services. **[PLACEHOLDER — Order Form template and negotiated terms, to be prepared by counsel/sales.]**

2.3 **No obligation to negotiate.** Nothing here obligates either party to enter into an Order Form. Until one is executed, this Agreement is the operative contract.

2.4 **Multi-seat / team administration.** Your Enterprise Account may include multiple seats, teams, and administrative roles. You will designate one or more administrators responsible for provisioning users, assigning roles and permissions, configuring the Service, and enforcing your internal policies. You are responsible for all activity of your seats, teams, and administrators, and for maintaining accurate user rosters and promptly removing access when a user should no longer have it. **[PLACEHOLDER — seat counts, team structure, and admin scope, per Order Form.]**

## 3. Definitions

- **"Service"** — the Paige Agent AI hosted platform, including the client portal, client-management/CRM features, the AI assistant and its agent capabilities, administration and team-management tools, associated websites, applications, APIs, and Documentation.
- **"Enterprise Account"** — your organization's tenant on the Service, including its seats and teams.
- **"Authorized User"** — an individual (employee, contractor, or agent) you permit to access the Service under a seat within your Enterprise Account.
- **"Customer Data"** — all data, content, records, contacts, messages, and files that you or your Authorized Users submit to or generate within the Service.
- **"End Clients"** — the end customers/clients of your organization managed using the Service. End Clients are not parties to this Agreement.
- **"Playbook," "Fees," "Documentation," "Privacy Policy," "Order"/"Order Form"** — as described in this Agreement.

## 4. Account & Provisioning

4.1 **Provisioning.** Upon acceptance and, where applicable, an executed Order Form or plan selection, we will provision your Enterprise Account with the seats and teams agreed. Your Account and Customer Data are logically isolated from other subscribers under our multi-tenant architecture. **[PLACEHOLDER — any single-tenant/isolated-environment or data-residency options, per Order Form.]**

4.2 **Registration information.** You agree to provide accurate, current, and complete organizational and administrator information. **[PLACEHOLDER — enterprise verification/onboarding requirements.]**

4.3 **Credentials, SSO & security.** You are responsible for safeguarding credentials and administering access across seats and teams. **[PLACEHOLDER — SSO/SAML, provisioning (SCIM), and MFA options, per Order Form.]** Notify us promptly of suspected unauthorized access. You are responsible for all activity under your Enterprise Account.

## 5. Subscription, Trial & Fees

5.1 **Free trial / evaluation.** A **14-day trial** or evaluation of the Service may be available (or as agreed at signup or in an Order Form), subject to this Agreement and any evaluation limits. Trial/evaluation use is provided **"as is"** without warranty.

5.2 **Fees.** You agree to pay the Fees for your Enterprise subscription. Enterprise Fees are typically set in an Order Form. **[PLACEHOLDER — enterprise pricing, seat/usage components, amounts, billing frequency, currency, and invoicing terms (e.g., net-30), per Order Form.]** Unless an Order Form states otherwise, Fees are billed in advance and are non-refundable except as required by law or expressly stated here.

5.3 **Payment & invoicing.** Payment may be by charge to a payment method or by invoice as agreed. **[PLACEHOLDER — invoicing/PO process and payment terms, per Order Form.]**

5.4 **Taxes.** Fees are exclusive of taxes; you are responsible for applicable taxes excluding taxes on our net income.

5.5 **Late or failed payment.** For past-due Fees, we may (subject to any Order Form notice/cure terms) apply late charges and/or suspend the Service per *Suspension*. **[PLACEHOLDER — late-payment terms.]**

5.6 **Changes to Fees.** Absent an Order Form fixing pricing for a committed term, we may change Fees prospectively with reasonable prior notice effective at your next renewal term. **[PLACEHOLDER — fee-change notice period.]**

## 6. Acceptable Use

6.1 You agree, and will ensure your Authorized Users agree, not to: (a) use the Service in violation of law or the rights of any person; (b) upload or transmit unlawful, defamatory, harassing, infringing, or malicious content or code; (c) send unsolicited or unlawful communications, or violate anti-spam, telemarketing, electronic-communications, or consumer-protection laws; (d) attempt unauthorized access to the Service, other tenants' data, or our systems; (e) reverse engineer the Service except where prohibited by law; (f) interfere with or disrupt the Service; (g) use the Service to build a competing product; or (h) access the Service by automated means other than supported APIs per the Documentation.

6.2 **Communications responsibility.** You are responsible for all communications sent to End Clients through the Service, including obtaining legally required consents, and for your own client-facing terms.

6.3 **Enforcement.** We may investigate suspected violations and remove content or suspend access per *Suspension*, subject to any notice/cure process in an Order Form.

## 7. Customer Data & Ownership

7.1 **Ownership.** As between the parties, you own and retain all rights in Customer Data. This Agreement grants us no ownership.

7.2 **License to us.** You grant us a limited, non-exclusive, worldwide license to host, copy, process, transmit, and display Customer Data solely to (a) provide, secure, maintain, and improve the Service; (b) address technical or security issues; (c) comply with law; and (d) enforce this Agreement. We act as your service provider/processor.

7.3 **Authority.** You represent you have all rights and consents necessary to submit Customer Data (including End Clients' data) to the Service and to authorize our processing.

7.4 **AI features.** The Service's AI assistant and automated agents operate on Customer Data to draft, suggest, personalize, and (where enabled or approved by your policies) act within your Account. Outputs may contain errors and must be reviewed before reliance. We do not use Customer Data to train foundation models for other customers except as permitted by the Privacy Policy and law; model providers process data under confidentiality and security obligations. **[PLACEHOLDER — AI/model-provider data-handling and any enterprise AI controls (e.g., data-retention/opt-out), per Order Form.]**

7.5 **Aggregated/de-identified data.** We may create and use aggregated or de-identified data that identifies no person or tenant to operate and improve the Service.

## 8. Data Protection & Privacy

8.1 **Privacy Policy.** Our Privacy Policy is incorporated by reference. **[PLACEHOLDER — Privacy Policy URL.]** For processing we perform on your behalf, this Agreement (and any DPA or Order Form security exhibit) controls over the Privacy Policy in the event of conflict.

8.2 **Security.** We maintain administrative, technical, and organizational safeguards appropriate to the data and risks, including encryption in transit, access controls, and logical tenant isolation. **[PLACEHOLDER — enterprise security commitments and any security exhibit, per Order Form.]**

8.3 **Compliance program (in progress).** We are actively pursuing formal attestations including **SOC 2**; these are **not yet complete**, and references describe our roadmap rather than a current certification. We will provide updated documentation as our program matures. **[PLACEHOLDER — target attestation dates and audit/report availability, per Order Form.]**

8.4 **Data processing terms.** A Data Processing Addendum ("DPA") governs our processing of personal data as your processor and is incorporated by reference where applicable. **[PLACEHOLDER — DPA specifics: sub-processors, cross-border transfer mechanism (e.g., SCCs), processing details, data-residency options, and DPA URL, per Order Form.]**

8.5 **Incident notification.** We will notify you without undue delay of a confirmed security incident affecting your Customer Data, consistent with law and any timeframe in an Order Form. **[PLACEHOLDER — notification timeframe/method.]**

## 9. Confidentiality

Each party will protect the other's non-public Confidential Information using at least reasonable care, use it only to perform under this Agreement, and disclose it only to personnel, advisors, and contractors bound by comparable confidentiality obligations. Customer Data is your Confidential Information; the Service, Documentation, and non-public pricing/Order Form terms are ours. Standard exclusions apply.

## 10. Service Availability & Support

10.1 **Availability.** We will use commercially reasonable efforts to keep the Service available with high reliability, excluding scheduled and emergency maintenance and events beyond our reasonable control. **[PLACEHOLDER — enterprise uptime SLA, service credits, and maintenance-window terms, per Order Form.]**

10.2 **Support.** We provide support through the channels in the Documentation, at the tier agreed. **[PLACEHOLDER — enterprise support tier, named contacts, hours, response/resolution targets, and any technical account management, per Order Form.]**

10.3 **Changes.** We may modify or enhance the Service and will use reasonable efforts to avoid materially degrading core functionality during your term. Material deprecations affecting committed functionality will be handled per any Order Form change process.

## 11. Intellectual Property

11.1 **Our IP.** We and our licensors own all rights in the Service, including software, models, interfaces, designs, and the "Paige Agent AI" and related marks. No rights are granted except the limited right to access and use the Service under this Agreement (and any Order Form).

11.2 **Your content & configuration.** You retain all rights in Customer Data and in your Playbooks, brand assets, and materials created in the Service. You grant us only the license in *Customer Data & Ownership* to operate the Service.

11.3 **Feedback.** You grant us a perpetual, irrevocable, royalty-free license to use feedback and suggestions without restriction.

## 12. Warranties & Disclaimers

12.1 **Limited service warranty.** We warrant the Service will perform materially per the Documentation during your paid term. Your exclusive remedy for breach is our commercially reasonable effort to correct the non-conformity or, failing that, termination and a pro-rata refund of prepaid, unused Fees for the affected period (subject to any different remedy in an Order Form).

12.2 **DISCLAIMER.** EXCEPT AS EXPRESSLY STATED, THE SERVICE, INCLUDING ALL AI FEATURES AND OUTPUTS, IS PROVIDED **"AS IS" AND "AS AVAILABLE,"** AND WE DISCLAIM ALL IMPLIED OR STATUTORY WARRANTIES, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE, OR THAT AI OUTPUTS WILL BE ACCURATE OR SUITABLE.

12.3 **No professional advice.** The Service is a software tool and does not provide legal, tax, financial, or other professional advice.

## 13. Limitation of Liability

13.1 TO THE MAXIMUM EXTENT PERMITTED BY LAW, NEITHER PARTY WILL BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR EXEMPLARY DAMAGES, OR FOR LOST PROFITS, REVENUE, GOODWILL, OR DATA.

13.2 **Cap.** TO THE MAXIMUM EXTENT PERMITTED BY LAW, EACH PARTY'S TOTAL AGGREGATE LIABILITY WILL NOT EXCEED **[PLACEHOLDER — liability cap, e.g., amounts paid by you to us in the 12 months preceding the claim, or as negotiated in an Order Form]**.

13.3 **Exceptions.** The exclusions and cap do not apply to your payment obligations, either party's indemnification obligations, breach of confidentiality, or liability that cannot be limited by law. **[PLACEHOLDER — confirm carve-outs and any enhanced caps for data/security matters, per Order Form.]**

## 14. Indemnification

14.1 **By you.** You will defend and indemnify us against third-party claims arising from (a) Customer Data; (b) use of the Service by you or your Authorized Users in violation of this Agreement or law; or (c) communications with or obligations to your End Clients.

14.2 **By us.** We will defend and indemnify you against third-party claims alleging that the Service, as provided by us and used in accordance with this Agreement, infringes a third party's intellectual property rights — excluding claims arising from Customer Data, your configurations, or combinations with non-Paige products.

14.3 **Procedure.** Prompt notice, control of defense by the indemnifying party, and reasonable cooperation.

## 15. Term & Termination

15.1 **Term.** Begins on acceptance and continues for your subscription term. Absent an Order Form specifying a committed term and renewal mechanics, your subscription continues for successive periods until terminated. **[PLACEHOLDER — committed term and renewal terms, per Order Form.]**

15.2 **Pre-provisioning self-serve cancellation.** If you accepted this Agreement but your Enterprise Account has **not yet been provisioned**, you may cancel immediately at no charge by contacting us, terminating this Agreement with no further obligation (subject to any executed Order Form).

15.3 **Cancellation & non-renewal.** Subject to any committed term in an Order Form, you may cancel or disable auto-renewal via self-serve controls or by contacting us. Cancellation takes effect at the end of the current billing period; earned Fees are non-refundable except as stated here or in an Order Form.

15.4 **Termination for cause.** Either party may terminate for uncured material breach after **[PLACEHOLDER — cure period, e.g., 30 days]** written notice. We may suspend or terminate for *Acceptable Use* breaches or non-payment per *Suspension* and any Order Form process.

15.5 **Data export & deletion.** For **[PLACEHOLDER — export window, e.g., 30–60 days]** after termination, you may export Customer Data using the Service's export features, unless prohibited by law. After the export window, we will delete or de-identify Customer Data within **[PLACEHOLDER — deletion timeframe]**, except routine backups or as required by law.

15.6 **Survival.** Sections that by nature survive (including Definitions, Custom Terms & Order Form precedence, Customer Data & Ownership, Confidentiality, IP, Warranties, Limitation of Liability, Indemnification, and Governing Law) survive termination.

## 16. Suspension

We may suspend access to all or part of the Service if (a) Fees are past due after notice; (b) we reasonably believe the Service is used in violation of *Acceptable Use* or law, or in a way that threatens the security, integrity, or availability of the Service or other tenants; or (c) required by law. We will use reasonable efforts to give notice, to limit the suspension's scope (preferring team- or seat-level limits where the issue is isolated), and to restore access promptly once resolved, subject to any notice/cure process in an Order Form.

## 17. Modifications to Terms

Because these are interim baseline terms, we expect to update them, including after legal review. We may modify this Agreement by posting an updated version and, for material changes, giving reasonable prior notice. **[PLACEHOLDER — notice period for material changes.]** Changes apply prospectively. **Where you have an executed Order Form, its negotiated terms control over any conflicting change for its term**, and material changes to your committed terms require mutual agreement. Continued use after the effective date constitutes acceptance.

## 18. Governing Law & Dispute Resolution

This Agreement is governed by the laws of **[PLACEHOLDER — governing jurisdiction, to be set by counsel]**, without regard to conflict-of-laws rules, and the parties submit to the exclusive jurisdiction and venue of the courts in **[PLACEHOLDER — venue/forum, to be set by counsel]**. **[PLACEHOLDER — optional arbitration, class-action waiver, and informal/executive dispute-resolution steps, to be determined by counsel or per Order Form.]**

## 19. General

Entire agreement (a conflicting, mutually executed Order Form controls per *Custom Terms & Order Form*); no assignment without consent (except to a successor with notice); End Clients and other third parties are not beneficiaries; force majeure; severability; waiver; independent contractors. Legal notices to us: **[PLACEHOLDER — legal notice address/email]**. We may notice you at the administrator email(s) associated with your Enterprise Account or as specified in an Order Form.

## 20. Contact

**Paige Agent AI** — General/support: **[PLACEHOLDER — support email/URL]**. Enterprise/sales & Order Form: **[PLACEHOLDER — enterprise contact]**. Legal notices: **[PLACEHOLDER — legal contact and mailing address]**. Privacy inquiries: **[PLACEHOLDER — privacy contact]**.

---

*These interim terms are provided to establish a clear, good-faith baseline pending completion of formal legal review and any negotiated Order Form. They are not legal advice. Bracketed placeholders must be finalized by counsel before these terms are treated as final.*$doc_enterprise$
);

COMMIT;
