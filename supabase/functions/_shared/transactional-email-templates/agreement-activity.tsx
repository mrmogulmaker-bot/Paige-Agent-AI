/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { EmailFooter } from './email-footer.tsx'

// INT-163 — owner-facing progress on an agreement they sent: opened, signed, or declined.
// Transactional: it reports on a document the recipient themselves put out for signature.
export function AgreementActivity({
  event,
  signer_name,
  agreement_title,
  workspace_url,
  decline_reason,
}: {
  event?: 'viewed' | 'signed' | 'declined'
  signer_name?: string
  agreement_title?: string
  workspace_url?: string
  decline_reason?: string
}) {
  const who = signer_name || 'A signer'
  const title = agreement_title || 'your agreement'
  const line = event === 'signed'
    ? `${who} has signed ${title}.`
    : event === 'declined'
    ? `${who} has declined ${title}.`
    : `${who} has opened ${title}.`
  const next = event === 'signed'
    ? 'If other people still need to sign, they can carry on. You will be emailed the completed copy once everyone has.'
    : event === 'declined'
    ? 'This agreement is now closed and its signing links have stopped working. Nobody else can sign it. If you still want it signed, draft a new one.'
    : 'Nothing has been signed yet.'
  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', color: '#17171c', lineHeight: 1.6 }}>
      <p><strong>{line}</strong></p>
      {event === 'declined' && decline_reason ? (
        <p style={{ borderLeft: '3px solid #e2e2e8', paddingLeft: '12px', color: '#5a5a66' }}>
          They said: {decline_reason}
        </p>
      ) : null}
      <p style={{ color: '#5a5a66' }}>{next}</p>
      {workspace_url ? (
        <p style={{ margin: '24px 0' }}>
          <a href={workspace_url} style={{ color: '#1a1a22', fontWeight: 600 }}>Open it in your workspace</a>
        </p>
      ) : null}
      <EmailFooter />
    </div>
  )
}

export const template = {
  component: AgreementActivity,
  subject: (d: Record<string, any>) => {
    const who = d?.signer_name || 'Someone'
    const title = d?.agreement_title || 'your agreement'
    if (d?.event === 'signed') return `${who} signed ${title}`
    if (d?.event === 'declined') return `${who} declined ${title}`
    return `${who} opened ${title}`
  },
  displayName: 'Agreement — activity',
  previewData: { event: 'signed', signer_name: 'Jordan Avery', agreement_title: 'Services Agreement', workspace_url: 'https://example.test' },
}
