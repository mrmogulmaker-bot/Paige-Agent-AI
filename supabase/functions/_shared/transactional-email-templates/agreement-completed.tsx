/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { EmailFooter } from './email-footer.tsx'

// INT-163 — everyone has signed. This goes to BOTH the business and the counterparty, because the
// retained record has to be available to both parties, and the counterparty has no account here.
//
// It carries a LINK, not the file. Our transactional sender passes {from,to,subject,html,text} to the
// provider and has no attachments path; widening that shared contract would drag a producer
// inventory across every template that uses it. The link is personal and expiring, which is also the
// safer thing to put in an inbox than the document itself.
//
// ONLY THE SIGNER GETS A LINK, and the copy says so plainly rather than implying otherwise. Their
// link carries the 365-day retrieval token minted at completion, because they have no account here.
// The owner gets none: `agreement-document`'s tenant door authenticates with the caller's SESSION,
// and a browser following a link out of an inbox sends no Authorization header — so a button there
// would answer the owner's own contract with a refusal. An earlier version said the document was
// "in your workspace", a place that does not exist yet; this one states what is true and hands over
// the fingerprint. The tenant-side retrieval surface is owed, and is declared owed in the PR.
export function AgreementCompleted({
  signer_name,
  agreement_title,
  document_url,
  sealed_sha256,
  party_names,
  is_signer,
}: {
  signer_name?: string
  agreement_title?: string
  document_url?: string
  sealed_sha256?: string
  party_names?: string
  is_signer?: boolean
}) {
  const title = agreement_title || 'the agreement'
  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', color: '#17171c', lineHeight: 1.6 }}>
      <p>{signer_name ? `Hi ${signer_name},` : 'Hello,'}</p>
      <p><strong>{title}</strong> is now complete — everyone has signed.</p>
      {party_names ? <p style={{ color: '#5a5a66' }}>Signed by: {party_names}</p> : null}
      {document_url ? (
        <p style={{ margin: '28px 0' }}>
          <a
            href={document_url}
            style={{
              background: '#1a1a22', color: '#ffffff', textDecoration: 'none',
              padding: '12px 22px', borderRadius: '8px', fontWeight: 600, display: 'inline-block',
            }}
          >
            Open the completed agreement
          </a>
        </p>
      ) : null}
      <p style={{ color: '#5a5a66', fontSize: '14px' }}>
        {is_signer
          ? 'Please download and keep your own copy. This link is personal to you — don’t forward it.'
          : 'Your signed copy is stored with this agreement. Retrieving it from your workspace is not available yet, so keep this fingerprint — it identifies the exact completed document.'}
      </p>
      {sealed_sha256 ? (
        <p style={{ color: '#8a8a96', fontSize: '12px', fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all' }}>
          Completed document fingerprint (SHA-256): {sealed_sha256}
        </p>
      ) : null}
      <EmailFooter />
    </div>
  )
}

export const template = {
  component: AgreementCompleted,
  subject: (d: Record<string, any>) => `Completed: ${d?.agreement_title || 'your agreement'}`,
  displayName: 'Agreement — completed',
  previewData: {
    signer_name: 'Jordan Avery',
    agreement_title: 'Services Agreement',
    document_url: 'https://example.test/doc',
    sealed_sha256: 'f'.repeat(64),
    party_names: 'Jordan Avery, Sam Okafor',
    is_signer: true,
  },
}
