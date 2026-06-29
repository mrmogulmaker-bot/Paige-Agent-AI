import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Preview, Text, Button, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'PaigeAgent.ai'
const LOGO_URL = 'https://bfmyebsjyuoecmjskqhs.supabase.co/storage/v1/object/public/email-assets/paige-logo-transparent.png'

interface ApprovalNotificationProps {
  recipientName?: string
  eventType?: 'created' | 'changes_requested'
  category?: string
  summary?: string
  priority?: string | number
  riskLevel?: string
  clientName?: string
  submittedBy?: string
  rationale?: string
  approvalUrl?: string
}

const labelFor = (event: string) =>
  event === 'changes_requested' ? 'Changes Requested' : 'New Approval'

const subjectFor = (event: string, summary?: string) => {
  const tag = event === 'changes_requested' ? '✏️ Changes requested' : '🛎️ New approval needed'
  return summary ? `${tag} — ${summary.slice(0, 80)}` : tag
}

const ApprovalNotificationEmail = ({
  recipientName,
  eventType = 'created',
  category = 'other',
  summary = 'An approval is waiting for review.',
  priority,
  riskLevel,
  clientName,
  submittedBy,
  rationale,
  approvalUrl = 'https://paigeagent.ai/admin/approvals',
}: ApprovalNotificationProps) => {
  const heading =
    eventType === 'changes_requested'
      ? `${recipientName ? recipientName + ', ' : ''}changes were requested on your approval`
      : `${recipientName ? recipientName + ', ' : ''}a new approval needs your review`

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{subjectFor(eventType, summary)}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Img src={LOGO_URL} alt={SITE_NAME} width="160" height="auto" style={logo} />
          <Text style={subheading}>{labelFor(eventType)}</Text>
          <Hr style={hr} />
          <Heading as="h2" style={h2}>{heading}</Heading>

          <Section style={detailBox}>
            <Text style={detailLabel}>Summary</Text>
            <Text style={detailValue}>{summary}</Text>
            <Hr style={innerHr} />
            <Text style={detailLabel}>Category</Text>
            <Text style={detailValue}>{category}</Text>
            {clientName ? (
              <>
                <Hr style={innerHr} />
                <Text style={detailLabel}>Client</Text>
                <Text style={detailValue}>{clientName}</Text>
              </>
            ) : null}
            {submittedBy ? (
              <>
                <Hr style={innerHr} />
                <Text style={detailLabel}>Submitted by</Text>
                <Text style={detailValue}>{submittedBy}</Text>
              </>
            ) : null}
            {priority ? (
              <>
                <Hr style={innerHr} />
                <Text style={detailLabel}>Priority</Text>
                <Text style={detailValue}>P{priority}</Text>
              </>
            ) : null}
            {riskLevel ? (
              <>
                <Hr style={innerHr} />
                <Text style={detailLabel}>Risk</Text>
                <Text style={detailValue}>{riskLevel}</Text>
              </>
            ) : null}
            {rationale ? (
              <>
                <Hr style={innerHr} />
                <Text style={detailLabel}>Reviewer note</Text>
                <Text style={detailValue}>{rationale}</Text>
              </>
            ) : null}
          </Section>

          <Button style={button} href={approvalUrl}>
            Open Approval
          </Button>

          <Hr style={hr} />
          <Text style={footer}>© {new Date().getFullYear()} {SITE_NAME}. You received this because approval notifications are enabled for your account.</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: ApprovalNotificationEmail,
  subject: (data: Record<string, any>) => subjectFor(data?.eventType ?? 'created', data?.summary),
  displayName: 'Approval Notification',
  previewData: {
    recipientName: 'Antonio',
    eventType: 'created',
    category: 'dispute_letter',
    summary: 'Round 2 dispute letter for Jane Doe — Equifax',
    priority: 2,
    riskLevel: 'medium',
    clientName: 'Jane Doe',
    submittedBy: 'Coach Candace',
    approvalUrl: 'https://paigeagent.ai/admin/approvals',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }
const container = { padding: '40px 25px', maxWidth: '600px', margin: '0 auto' }
const logo = { display: 'block' as const, margin: '0 auto 8px' }
const subheading = { fontSize: '14px', color: '#6b7280', textAlign: 'center' as const, margin: '0' }
const hr = { borderColor: '#e5e7eb', margin: '24px 0' }
const innerHr = { borderColor: '#e5e7eb', margin: '12px 0' }
const h2 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0a1628', margin: '0 0 16px' }
const detailBox = { backgroundColor: '#f9fafb', padding: '20px', borderRadius: '8px', border: '1px solid #e5e7eb', margin: '16px 0 24px' }
const detailLabel = { fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.5px', margin: '0 0 4px' }
const detailValue = { fontSize: '15px', color: '#0a1628', fontWeight: '600' as const, margin: '0' }
const button = { backgroundColor: '#CFAE70', color: '#ffffff', padding: '12px 30px', borderRadius: '6px', fontSize: '16px', fontWeight: '600' as const, textDecoration: 'none', display: 'block' as const, textAlign: 'center' as const, margin: '24px auto' }
const footer = { fontSize: '12px', color: '#9ca3af', textAlign: 'center' as const, margin: '0' }
