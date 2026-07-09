// Internal ops email — fired when a broker submits an MCC service request.
// Recipient is MCC_NOTIFICATION_EMAIL (mcc@paigeagent.ai).

import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  brokerBusinessName?: string
  brokerEmail?: string
  clientName?: string
  clientEmail?: string
  serviceType?: string
  priority?: string
  notes?: string
  requestId?: string
}

const SERVICE_LABELS: Record<string, string> = {
  workspace_setup: 'Workspace setup',
  client_onboarding: 'Client onboarding setup',
  pipeline_automation: 'Pipeline & follow-up automation',
  at_risk_outreach: 'At-risk client outreach',
  campaign_strategy: 'Campaign & nurture strategy',
  compliance_review: 'Compliance review',
  other: 'Other',
}

const McuNewServiceRequestEmail = ({
  brokerBusinessName, brokerEmail, clientName, clientEmail,
  serviceType, priority, notes, requestId,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>New MCC request from {brokerBusinessName || 'a broker'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>New MCC service request</Heading>
        <Text style={text}>
          <strong>{brokerBusinessName || 'A broker'}</strong> ({brokerEmail || 'unknown email'}){' '}
          submitted a new request.
        </Text>

        <Section style={card}>
          <Row label="Service" value={SERVICE_LABELS[serviceType ?? ''] ?? serviceType ?? '—'} />
          <Row label="Priority" value={(priority ?? 'standard').toUpperCase()} />
          <Row label="Client" value={`${clientName || '—'} (${clientEmail || 'no email'})`} />
          <Row label="Request ID" value={requestId || '—'} mono />
        </Section>

        <Heading as="h2" style={h2}>Notes</Heading>
        <Text style={notesBlock}>{notes || '—'}</Text>

        <Text style={footer}>— Paige Agent AI Broker Workspace</Text>
      </Container>
    </Body>
  </Html>
)

const Row = ({ label, value, mono }: { label: string; value: string; mono?: boolean }) => (
  <Text style={{ ...rowText, fontFamily: mono ? 'ui-monospace, SFMono-Regular, monospace' : undefined }}>
    <strong style={rowLabel}>{label}:</strong> {value}
  </Text>
)

export const template = {
  component: McuNewServiceRequestEmail,
  subject: (data: Record<string, any>) =>
    `[MCC] ${(data?.priority ?? 'standard').toUpperCase()} — ${data?.brokerBusinessName ?? 'Broker'} → ${SERVICE_LABELS[data?.serviceType] ?? data?.serviceType ?? 'request'}`,
  displayName: 'MCC → new service request',
  previewData: {
    brokerBusinessName: 'Apex Consulting Group',
    brokerEmail: 'broker@example.com',
    clientName: 'Jane Doe',
    clientEmail: 'jane@example.com',
    serviceType: 'client_onboarding',
    priority: 'rush',
    notes: 'New client just signed on — wants their onboarding sequence and first follow-ups set up right away.',
    requestId: 'abc-123',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Inter, Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '600px' }
const h1 = { fontSize: '22px', fontWeight: 'bold', color: '#000000', margin: '0 0 18px' }
const h2 = { fontSize: '14px', fontWeight: 'bold', color: '#000000', margin: '20px 0 6px', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }
const text = { fontSize: '15px', color: '#1f2937', lineHeight: '1.55', margin: '0 0 14px' }
const card = { background: '#FAF6EE', border: '1px solid #E8DCC0', borderRadius: '8px', padding: '16px 18px', margin: '16px 0' }
const rowText = { fontSize: '14px', color: '#1f2937', margin: '4px 0' }
const rowLabel = { color: '#6b5a35' }
const notesBlock = { fontSize: '14px', color: '#1f2937', whiteSpace: 'pre-wrap' as const, background: '#f9fafb', padding: '12px 14px', borderRadius: '6px', border: '1px solid #e5e7eb' }
const footer = { fontSize: '12px', color: '#9ca3af', margin: '24px 0 0' }
