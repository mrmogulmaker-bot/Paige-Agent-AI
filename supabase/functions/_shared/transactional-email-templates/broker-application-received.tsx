import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'PaigeAgent.ai'

interface BrokerApplicationReceivedProps {
  firstName?: string
  businessName?: string
}

const BrokerApplicationReceivedEmail = ({
  firstName,
  businessName,
}: BrokerApplicationReceivedProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your {SITE_NAME} Broker application is in</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={brand}>{SITE_NAME}</Heading>
        <Heading style={h1}>
          {firstName ? `Welcome, ${firstName}.` : 'Your Broker application is in.'}
        </Heading>
        <Text style={text}>
          Thanks for applying to the PaigeAgent Broker Program
          {businessName ? ` on behalf of ${businessName}` : ''}. Your application
          is being processed automatically — most brokers are approved instantly
          and will receive a follow-up welcome email with their referral code,
          client discount link, and dashboard access within the next minute.
        </Text>

        <Section style={card}>
          <Text style={cardLabel}>What happens next</Text>
          <Text style={cardItem}>1. You'll receive an approval email with your unique broker code.</Text>
          <Text style={cardItem}>2. Activate your $197/mo Broker Workspace from the dashboard.</Text>
          <Text style={cardItem}>3. Start inviting clients — they sign up at your $17/mo broker rate.</Text>
        </Section>

        <Text style={text}>
          Questions? Reply to this email or contact{' '}
          <a href="mailto:partners@paigeagent.ai" style={link}>partners@paigeagent.ai</a>.
        </Text>

        <Text style={footer}>— The {SITE_NAME} Partnerships Team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: BrokerApplicationReceivedEmail,
  subject: 'Your PaigeAgent Broker Application is Received',
  displayName: 'Broker — Application received',
  previewData: { firstName: 'Jordan', businessName: 'Apex Credit Advisors' },
} satisfies TemplateEntry

const main: React.CSSProperties = {
  backgroundColor: '#ffffff',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif',
}
const container: React.CSSProperties = { padding: '32px 24px', maxWidth: '560px' }
const brand: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 700,
  color: '#CFAE70',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  margin: '0 0 18px',
}
const h1: React.CSSProperties = {
  fontSize: '24px',
  fontWeight: 700,
  color: '#0B1B2B',
  margin: '0 0 18px',
  lineHeight: 1.25,
}
const text: React.CSSProperties = {
  fontSize: '15px',
  color: '#3a4654',
  lineHeight: 1.6,
  margin: '0 0 18px',
}
const card: React.CSSProperties = {
  background: '#F8F4EC',
  border: '1px solid #E7DDC9',
  borderRadius: '8px',
  padding: '18px 20px',
  margin: '8px 0 22px',
}
const cardLabel: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 700,
  color: '#8B6F2F',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  margin: '0 0 8px',
}
const cardItem: React.CSSProperties = {
  fontSize: '14px',
  color: '#0B1B2B',
  lineHeight: 1.5,
  margin: '4px 0',
}
const link: React.CSSProperties = { color: '#0B1B2B', textDecoration: 'underline' }
const footer: React.CSSProperties = {
  fontSize: '12px',
  color: '#888888',
  margin: '28px 0 0',
}
