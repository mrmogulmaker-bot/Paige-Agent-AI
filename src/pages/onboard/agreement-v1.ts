// Service Agreement — v1 (paralegal draft, pending lawyer review). Sprint 211.b:
// brand-specific agreement content refactor tracked as Category #9 (per-tenant branding bundle).
// Canonical source of truth lives in the legal repository under legal/service-agreement-v1.md.
// When that file is updated, bump AGREEMENT_VERSION and replace the template body.
//
// Placeholders use {{double_braces}} and are substituted at render time.
// Unknown placeholders render as the empty string.

export const AGREEMENT_TEMPLATE_KEY = "btf_service_agreement";
export const AGREEMENT_VERSION = "v1.0.0";
export const AGREEMENT_DISPLAY_TITLE = "BUILD-to-FUND Service Agreement";

export const AGREEMENT_TEMPLATE_TEXT = `# BUILD-to-FUND Service Agreement
**Effective Date:** {{effective_date}}
**Version:** ${AGREEMENT_VERSION}

This BUILD-to-FUND Service Agreement (the "Agreement") is entered into between **Mogul Maker Academy LLC** ("MMA," "we," "us") and **{{client_full_legal_name}}** ("Client," "you"), with respect to Client's business entity, **{{client_entity_name}}** (or to be formed) (the "Business").

---

## 1. Services
MMA will provide consulting, coaching, and program access materials in support of the Client's pursuit of personal credit improvement, business credit building, and business funding readiness ("Services"). The Services are educational and consultative. **MMA is not a lender, not a law firm, not a credit repair organization, and not a financial advisor.** Nothing in this Agreement constitutes legal, tax, accounting, or investment advice.

## 2. Term
This Agreement begins on the Effective Date and continues for the duration of the BUILD-to-FUND program, currently estimated at twelve (12) to eighteen (18) months from the Effective Date, subject to Client's pace and participation.

## 3. Fees & Payment
Client has selected the following payment plan: **{{plan_label}}**.
- Total program tuition: **{{plan_total}}**
- Amount received to date: **{{plan_paid_to_date}}**
- Remaining balance and schedule: **{{plan_schedule}}**

By signing below, Client authorizes MMA to charge the payment method on file according to the schedule above. Failed payments incur a five (5) day cure period before access is suspended. All payments are non-refundable except as required by law.

## 4. Client Responsibilities
Client agrees to:
- Provide accurate, complete information in the intake form and supporting documents;
- Participate in scheduled coaching sessions and complete assigned tasks;
- Notify MMA promptly of changes to financial, credit, or business circumstances;
- Refrain from misrepresentation of any kind in funding applications.

## 5. Confidentiality & Data Handling
MMA treats Client information as confidential and stores it in secure, role-restricted systems. Sensitive data (SSN, financial accounts, credit data) is encrypted at rest and accessed only by Client, the Client's assigned coach, and authorized administrators. MMA never sells Client data.

## 6. Compliance Disclosures
- **FCRA / CROA:** MMA does not perform credit repair on Client's behalf. Any disputes are submitted directly by Client. MMA may provide educational materials only.
- **No Guarantee:** MMA makes no guarantee of funding outcomes, credit score increases, or business success. Results depend on Client's effort, third-party decisions, and economic conditions outside MMA's control.

## 7. Termination
Either party may terminate this Agreement on thirty (30) days written notice. Earned and incurred fees through the termination date remain due and payable.

## 8. Limitation of Liability
MMA's total liability under this Agreement shall not exceed the amount of fees Client has paid in the six (6) months preceding the claim. MMA is not liable for indirect, incidental, or consequential damages.

## 9. Electronic Signature (E-SIGN Act / UETA)
Client agrees that electronic signatures and electronic records have the same legal force as handwritten signatures. Client may withdraw consent to electronic signatures at any time by contacting support@mogulmakeracademy.com.

## 10. Governing Law
This Agreement is governed by the laws of the State of **{{mma_state_of_registration}}**, without regard to its conflict-of-laws principles.

---

**Client:** {{client_full_legal_name}}
**Date of Signature:** {{signature_date}}

**MMA:** Antonio Cook, on behalf of Mogul Maker Academy LLC
`;

export interface AgreementPlaceholders {
  client_full_legal_name?: string | null;
  client_entity_name?: string | null;
  effective_date?: string | null;
  signature_date?: string | null;
  mma_state_of_registration?: string | null;
  plan_label?: string | null;
  plan_total?: string | null;
  plan_paid_to_date?: string | null;
  plan_schedule?: string | null;
}

export function renderAgreement(values: AgreementPlaceholders): string {
  return AGREEMENT_TEMPLATE_TEXT.replace(/\{\{([a-z_]+)\}\}/gi, (_, key) => {
    const v = (values as Record<string, string | null | undefined>)[key];
    return v == null ? "" : String(v);
  });
}
