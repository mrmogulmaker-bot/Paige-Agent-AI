import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'PaigeAgent.ai'

interface Props {
  title?: string
  newStatus?: string
  adminResponse?: string
  plannedRelease?: string
}

const STATUS_LABEL: Record<string, string> = {
  submitted: 'Submitted',
  under_review: 'Under Review',
  planned: 'Planned',
  in_progress: 'In Progress',
  shipped: 'Shipped',
  declined: 'Not Planned',
}

const FeatureRequestStatusUpdateEmail = ({ title, newStatus, adminResponse, plannedRelease }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Update on your feature request: {title ?? ''}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={headerBar}>
          <Heading style={logoText}>{SITE_NAME}</Heading>
          <Text style={tagline}>Product Feedback</Text>
        </Section>

        <Section style={contentSection}>
          <Heading as="h2" style={h2}>Update on your idea.</Heading>
          <Text style={text}>
            Your feature request{title ? <> — <strong>"{title}"</strong></> : null} has a new status.
          </Text>

          <Section style={infoBox}>
            <Text style={infoLabel}>NEW STATUS</Text>
            <Text style={infoTextLg}>{newStatus ? (STATUS_LABEL[newStatus] ?? newStatus) : '—'}</Text>
            {plannedRelease ? (
              <>
                <Text style={infoLabel}>PLANNED RELEASE</Text>
                <Text style={infoText}>{plannedRelease}</Text>
              </>
            ) : null}
          </Section>

          {adminResponse ? (
            <Section style={quoteBox}>
              <Text style={infoLabel}>FROM THE PAIGEAGENT TEAM</Text>
              <Text style={quoteText}>{adminResponse}</Text>
            </Section>
          ) : null}

          <Text style={text}>
            Thanks for shaping what we build next. Your feedback directly influences the roadmap.
          </Text>

          <Button style={button} href="https://paigeagent.ai/app/support">
            View on Feedback Board
          </Button>
        </Section>

        <Hr style={hr} />
        <Text style={footer}>
          © {new Date().getFullYear()} {SITE_NAME}
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: FeatureRequestStatusUpdateEmail,
  subject: (data: Record<string, any>) =>
    `Update on Your Feature Request: ${data?.title ?? ''}`.replace(/\s+/g, ' ').trim(),
  displayName: 'Feature Request Status Update',
  previewData: { title: 'Auto-import expense receipts via email', newStatus: 'planned', adminResponse: 'Great idea — we\'re scoping this for our Q3 release alongside the QuickBooks integration.', plannedRelease: 'Q3 2026' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }
const container = { maxWidth: '600px', margin: '0 auto' }
const headerBar = { backgroundColor: '#0a1628', padding: '32px 40px 28px', borderRadius: '8px 8px 0 0', textAlign: 'center' as const }
const logoText = { fontSize: '26px', fontWeight: 'bold' as const, color: '#CFAE70', margin: '0', letterSpacing: '0.5px' }
const tagline = { fontSize: '12px', color: '#9ca3af', margin: '6px 0 0', textTransform: 'uppercase' as const, letterSpacing: '2px' }
const contentSection = { padding: '36px 40px 24px' }
const h2 = { fontSize: '24px', fontWeight: 'bold' as const, color: '#0a1628', margin: '0 0 16px' }
const text = { fontSize: '15px', color: '#374151', lineHeight: '1.7', margin: '0 0 14px' }
const infoBox = { margin: '18px 0 8px', padding: '18px 20px', backgroundColor: '#f9fafb', borderLeft: '3px solid #CFAE70', borderRadius: '4px' }
const quoteBox = { margin: '18px 0 8px', padding: '20px 22px', backgroundColor: '#fef9ee', borderLeft: '3px solid #CFAE70', borderRadius: '4px' }
const infoLabel = { fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '2px', margin: '8px 0 4px', fontWeight: '600' as const }
const infoText = { fontSize: '14px', color: '#374151', lineHeight: '1.6', margin: '0' }
const infoTextLg = { fontSize: '20px', color: '#0a1628', lineHeight: '1.4', margin: '0 0 4px', fontWeight: '700' as const }
const quoteText = { fontSize: '14px', color: '#374151', lineHeight: '1.7', margin: '0' }
const button = { backgroundColor: '#CFAE70', color: '#0a1628', padding: '14px 36px', borderRadius: '6px', fontSize: '15px', fontWeight: '700' as const, textDecoration: 'none', display: 'block' as const, textAlign: 'center' as const, margin: '20px auto 8px', maxWidth: '280px' }
const hr = { borderColor: '#e5e7eb', margin: '24px 40px' }
const footer = { fontSize: '12px', color: '#9ca3af', textAlign: 'center' as const, margin: '0', padding: '0 40px 32px' }
