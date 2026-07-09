import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'PaigeAgent.ai'

interface Props {
  ticketNumber?: string
  subject?: string
  category?: string
  priority?: string
}

const SupportTicketCreatedEmail = ({ ticketNumber, subject, category, priority }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Support ticket {ticketNumber ?? ''} received — we'll respond within 24 hours</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={headerBar}>
          <Heading style={logoText}>{SITE_NAME}</Heading>
          <Text style={tagline}>Customer Support</Text>
        </Section>

        <Section style={contentSection}>
          <Heading as="h2" style={h2}>We've got your message.</Heading>
          <Text style={text}>
            Thanks for reaching out. Our support team has received your ticket and will respond within 24 hours{priority === 'urgent' ? ' — your urgent priority flag has been noted and will be triaged first' : ''}.
          </Text>

          <Section style={infoBox}>
            <Text style={infoLabel}>TICKET NUMBER</Text>
            <Text style={infoTextLg}><strong>{ticketNumber ?? 'PT-'}</strong></Text>
            {subject ? (
              <>
                <Text style={infoLabel}>SUBJECT</Text>
                <Text style={infoText}>{subject}</Text>
              </>
            ) : null}
            {category ? (
              <>
                <Text style={infoLabel}>CATEGORY</Text>
                <Text style={infoText}>{formatCategory(category)}</Text>
              </>
            ) : null}
          </Section>

          <Heading as="h3" style={h3}>What happens next</Heading>
          <Text style={listItem}>• A support specialist will review your ticket within 24 hours</Text>
          <Text style={listItem}>• You'll receive an email when we reply</Text>
          <Text style={listItem}>• You can add more information at any time from the Support tab</Text>

          <Button style={button} href="https://paigeagent.ai/app/support">
            View Your Ticket
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

function formatCategory(c: string): string {
  return c.split('_').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ')
}

export const template = {
  component: SupportTicketCreatedEmail,
  subject: (data: Record<string, any>) =>
    `Support Ticket ${data?.ticketNumber ?? ''} Received — We'll get back to you within 24 hours`.replace(/\s+/g, ' ').trim(),
  displayName: 'Support Ticket Created',
  previewData: { ticketNumber: 'PT-00001', subject: 'Question about my Pro subscription billing', category: 'billing', priority: 'normal' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }
const container = { maxWidth: '600px', margin: '0 auto' }
const headerBar = { backgroundColor: '#0a1628', padding: '32px 40px 28px', borderRadius: '8px 8px 0 0', textAlign: 'center' as const }
const logoText = { fontSize: '26px', fontWeight: 'bold' as const, color: '#CFAE70', margin: '0', letterSpacing: '0.5px' }
const tagline = { fontSize: '12px', color: '#9ca3af', margin: '6px 0 0', textTransform: 'uppercase' as const, letterSpacing: '2px' }
const contentSection = { padding: '36px 40px 24px' }
const h2 = { fontSize: '24px', fontWeight: 'bold' as const, color: '#0a1628', margin: '0 0 16px' }
const h3 = { fontSize: '16px', fontWeight: '700' as const, color: '#0a1628', margin: '20px 0 10px' }
const text = { fontSize: '15px', color: '#374151', lineHeight: '1.7', margin: '0 0 14px' }
const listItem = { fontSize: '14px', color: '#374151', lineHeight: '1.8', margin: '0 0 4px' }
const infoBox = { margin: '18px 0 8px', padding: '18px 20px', backgroundColor: '#f9fafb', borderLeft: '3px solid #CFAE70', borderRadius: '4px' }
const infoLabel = { fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '2px', margin: '8px 0 4px', fontWeight: '600' as const }
const infoText = { fontSize: '14px', color: '#374151', lineHeight: '1.6', margin: '0' }
const infoTextLg = { fontSize: '18px', color: '#0a1628', lineHeight: '1.4', margin: '0 0 4px', fontWeight: '700' as const }
const button = { backgroundColor: '#CFAE70', color: '#0a1628', padding: '14px 36px', borderRadius: '6px', fontSize: '15px', fontWeight: '700' as const, textDecoration: 'none', display: 'block' as const, textAlign: 'center' as const, margin: '20px auto 8px', maxWidth: '260px' }
const hr = { borderColor: '#e5e7eb', margin: '24px 40px' }
const footer = { fontSize: '12px', color: '#9ca3af', textAlign: 'center' as const, margin: '0', padding: '0 40px 32px' }
