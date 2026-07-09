import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'PaigeAgent.ai'

interface Props {
  ticketNumber?: string
  subject?: string
  replyPreview?: string
}

const SupportTicketReplyEmail = ({ ticketNumber, subject, replyPreview }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>New reply on your support ticket {ticketNumber ?? ''}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={headerBar}>
          <Heading style={logoText}>{SITE_NAME}</Heading>
          <Text style={tagline}>Support Reply</Text>
        </Section>

        <Section style={contentSection}>
          <Heading as="h2" style={h2}>You have a new reply.</Heading>
          <Text style={text}>
            Our support team has responded to ticket <strong>{ticketNumber ?? 'PT-'}</strong>{subject ? <> — <em>{subject}</em></> : null}.
          </Text>

          {replyPreview ? (
            <Section style={quoteBox}>
              <Text style={infoLabel}>SUPPORT TEAM REPLY</Text>
              <Text style={quoteText}>{truncate(replyPreview, 320)}</Text>
            </Section>
          ) : null}

          <Button style={button} href="https://paigeagent.ai/app/support">
            View Full Conversation
          </Button>

          <Text style={subtext}>
            You can reply directly from the Support tab in your PaigeAgent dashboard.
          </Text>
        </Section>

        <Hr style={hr} />
        <Text style={footer}>
          © {new Date().getFullYear()} {SITE_NAME}
        </Text>
      </Container>
    </Body>
  </Html>
)

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n).trimEnd() + '…' : s
}

export const template = {
  component: SupportTicketReplyEmail,
  subject: (data: Record<string, any>) =>
    `New Reply on Your Support Ticket ${data?.ticketNumber ?? ''}`.replace(/\s+/g, ' ').trim(),
  displayName: 'Support Ticket Reply',
  previewData: { ticketNumber: 'PT-00001', subject: 'Question about billing', replyPreview: 'Hi! Thanks for reaching out. I took a look at your account and I can confirm that your Pro subscription renews on the 15th of next month. Let me know if you have any other questions!' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }
const container = { maxWidth: '600px', margin: '0 auto' }
const headerBar = { backgroundColor: '#0a1628', padding: '32px 40px 28px', borderRadius: '8px 8px 0 0', textAlign: 'center' as const }
const logoText = { fontSize: '26px', fontWeight: 'bold' as const, color: '#EBB94C', margin: '0', letterSpacing: '0.5px' }
const tagline = { fontSize: '12px', color: '#9ca3af', margin: '6px 0 0', textTransform: 'uppercase' as const, letterSpacing: '2px' }
const contentSection = { padding: '36px 40px 24px' }
const h2 = { fontSize: '24px', fontWeight: 'bold' as const, color: '#0a1628', margin: '0 0 16px' }
const text = { fontSize: '15px', color: '#374151', lineHeight: '1.7', margin: '0 0 14px' }
const subtext = { fontSize: '13px', color: '#6b7280', lineHeight: '1.6', margin: '14px 0 0', textAlign: 'center' as const }
const quoteBox = { margin: '18px 0 8px', padding: '20px 22px', backgroundColor: '#f9fafb', borderLeft: '3px solid #EBB94C', borderRadius: '4px' }
const infoLabel = { fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '2px', margin: '0 0 8px', fontWeight: '600' as const }
const quoteText = { fontSize: '14px', color: '#374151', lineHeight: '1.7', margin: '0', fontStyle: 'italic' as const }
const button = { backgroundColor: '#EBB94C', color: '#0a1628', padding: '14px 36px', borderRadius: '6px', fontSize: '15px', fontWeight: '700' as const, textDecoration: 'none', display: 'block' as const, textAlign: 'center' as const, margin: '20px auto 8px', maxWidth: '280px' }
const hr = { borderColor: '#e5e7eb', margin: '24px 40px' }
const footer = { fontSize: '12px', color: '#9ca3af', textAlign: 'center' as const, margin: '0', padding: '0 40px 32px' }
