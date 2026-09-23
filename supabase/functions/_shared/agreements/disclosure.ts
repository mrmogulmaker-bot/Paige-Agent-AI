// _shared/agreements/disclosure.ts — the consent-to-electronic-records disclosure (INT-163).
//
// WHY THIS IS A VERSIONED CONSTANT AND NOT A STRING IN A HANDLER. The record has to be able to say,
// years later, WHICH text a person agreed to — not merely that a box was ticked. A boolean
// `e_sign_consent: true` is unfalsifiable the moment the wording changes, which it will. So each
// version is frozen here, the signer row stores the slug, the version AND a SHA-256 of the exact
// body shown, and a wording change is a NEW VERSION rather than an edit. Old records keep pointing
// at what they actually displayed.
//
// TWO HONEST LIMITS, STATED HERE SO NO SURFACE IMPLIES OTHERWISE:
//
//   1. THIS WORDING HAS NOT BEEN REVIEWED BY COUNSEL. The architecture is sound and the required
//      elements are present, but the text is engineering's draft. It wants a lawyer's eye before the
//      first live send. Because versions are additive, that review produces a new version row rather
//      than a migration — so it does not block building, only shipping to real counterparties.
//   2. ITEMS 3 AND 4 CREATE A HUMAN OBLIGATION, NOT A CODE PATH. Promising a paper copy on request,
//      and an address to withdraw consent, binds the TENANT to actually honour it. A disclosure that
//      promises a process nobody performs is worse than no disclosure. So {{contact}} is resolved
//      from the workspace (`tenantContactForDisclosure` — its public support address, else the
//      owner's), and `agreement-send` REFUSES before minting a token when neither exists, rather
//      than shipping a promise addressed to nobody. An earlier version of this file claimed both of
//      those while interpolating the literal "the sender of this agreement"; the claim is now true.

export interface ConsentDisclosure {
  slug: string;
  version: number;
  /** Shown above the consent control. `{{tenant}}` and `{{contact}}` are the only placeholders. */
  body: string;
  /** The exact label beside the control. Recorded with the body so "what they ticked" is provable. */
  checkboxLabel: string;
}

export const ESIGN_CONSENT_DISCLOSURE: ConsentDisclosure = {
  slug: "esign-consent",
  version: 1,
  checkboxLabel:
    "I agree to use electronic records and signatures for this agreement, and I have read the notice above.",
  body: [
    "Before you sign electronically, please read this notice.",
    "",
    "1. Signing electronically. You are about to sign this agreement electronically. Your electronic",
    "signature has the same legal effect as a handwritten one. You are not required to sign",
    "electronically; if you would prefer to sign on paper, contact {{tenant}} at {{contact}} and do not",
    "continue here.",
    "",
    "2. What you are agreeing to receive electronically. By continuing, you agree that this agreement,",
    "and records relating to it, may be provided to you electronically rather than on paper.",
    "",
    "3. Getting a paper copy. You may ask {{tenant}} for a paper copy of this agreement at any time by",
    "contacting {{contact}}. {{tenant}} may charge a fee for a paper copy; ask before requesting one.",
    "",
    "4. Withdrawing your consent. You may withdraw this consent at any time by contacting {{tenant}} at",
    "{{contact}}. Withdrawing consent does not undo a signature you have already given, and it may mean",
    "the agreement cannot be completed electronically.",
    "",
    "5. Keeping your own copy. When every party has signed, you will be emailed a link to the completed",
    "document. Save or print it for your records, and ask {{tenant}} if you need access again later.",
    "",
    "6. What you need. To read and keep this agreement you need a current web browser, an email account",
    "that can receive messages from {{tenant}}, and the ability to open PDF files. If you cannot do",
    "these things, do not sign electronically — contact {{tenant}} instead.",
  ].join("\n"),
};

/** Fill the disclosure for one tenant. The result is what is SHOWN and what is HASHED — the same
 *  string, so the stored hash covers the text the signer actually read, placeholders included. */
export function renderDisclosure(
  disclosure: ConsentDisclosure,
  tenantName: string,
  tenantContact: string,
): string {
  // REPLACER FUNCTIONS, not strings. `String.replaceAll` expands `$&`, `$'`, "$`" and `$1` inside the
  // REPLACEMENT argument, and the tenant writes its own name. A workspace called `Acme $'` therefore
  // spliced copies of the surrounding paragraphs into the notice — and `consentEvidenceText` hashed
  // that garbled version into `esign_consent_sha256`, permanently, on the one artifact in this engine
  // whose entire purpose is to be provably the text the person was shown. A function replacement
  // inserts the value literally and has no `$` syntax at all.
  return disclosure.body
    .replaceAll("{{tenant}}", () => tenantName)
    .replaceAll("{{contact}}", () => tenantContact);
}

/** The exact string whose hash is stored: the rendered notice plus the label beside the control. */
export function consentEvidenceText(
  disclosure: ConsentDisclosure,
  tenantName: string,
  tenantContact: string,
): string {
  return `${renderDisclosure(disclosure, tenantName, tenantContact)}\n\n[ ] ${disclosure.checkboxLabel}`;
}
