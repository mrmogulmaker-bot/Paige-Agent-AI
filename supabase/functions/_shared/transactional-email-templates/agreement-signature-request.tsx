/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { EmailFooter } from './email-footer.tsx'

// INT-163 — the message that carries a signing link to an external counterparty.
//
// This is TRANSACTIONAL, not bulk: somebody has been asked to sign a document, which is not
// something they can opt out of receiving while still being party to it.
//
// The link in here IS the credential (a 256-bit token). It is deliberately a plain anchor with no
// tracking redirect, so the token is never handed to a third party, and the copy tells the reader
// not to forward it — the one leak path no server-side control can close.
export function AgreementSignatureRequest({
  signer_name,
  tenant_name,
  agreement_title,
  signing_url,
  expires_in_days,
}: {
  signer_name?: string
  tenant_name?: string
  agreement_title?: string
  signing_url?: string
  expires_in_days?: number
}) {
  const who = tenant_name || 'A business you work with'
  const title = agreement_title || 'an agreement'
  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', color: '#17171c', lineHeight: 1.6 }}>
      <p>{signer_name ? `Hi ${signer_name},` : 'Hello,'}</p>
      <p>
        <strong>{who}</strong> has asked you to sign <strong>{title}</strong>.
      </p>
      <p style={{ margin: '28px 0' }}>
        <a
          href={signing_url}
          style={{
            background: '#1a1a22', color: '#ffffff', textDecoration: 'none',
            padding: '12px 22px', borderRadius: '8px', fontWeight: 600, display: 'inline-block',
          }}
        >
          Read and sign
        </a>
      </p>
      <p style={{ color: '#5a5a66', fontSize: '14px' }}>
        You can read the whole document before deciding, and you can decline. This link is personal
        to you — please don't forward it, because anyone who opens it can sign in your name.
        {typeof expires_in_days === 'number' ? ` It stops working after ${expires_in_days} days.` : ''}
      </p>
      <p style={{ color: '#5a5a66', fontSize: '14px' }}>
        Not expecting this? You can ignore this email and nothing will be signed.
      </p>
      <EmailFooter />
    </div>
  )
}

export const template = {
  component: AgreementSignatureRequest,
  subject: (d: Record<string, any>) =>
    `${d?.tenant_name ? `${d.tenant_name}: ` : ''}please sign ${d?.agreement_title || 'an agreement'}`,
  displayName: 'Agreement — signature request',
  previewData: {
    signer_name: 'Jordan Avery',
    tenant_name: 'Acme Consulting',
    agreement_title: 'Services Agreement',
    signing_url: 'https://example.test/sign',
    expires_in_days: 30,
  },
}
