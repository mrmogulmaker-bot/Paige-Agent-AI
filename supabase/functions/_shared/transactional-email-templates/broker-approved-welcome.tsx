import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Paige Agent AI'

interface BrokerApprovedWelcomeProps {
  firstName?: string
  businessName?: string
  referralCode?: string
  brokerReferralLink?: string
  clientSignupLink?: string
  dashboardUrl?: string
}

const BrokerApprovedWelcomeEmail = ({
  firstName,
  businessName,
  referralCode = 'BROK-XXXXXX',
  brokerReferralLink = 'https://paigeagent.ai/broker?ref=BROK-XXXXXX',
  clientSignupLink = 'https://paigeagent.ai/auth?broker=BROK-XXXXXX',
  dashboardUrl = 'https://paigeagent.ai/app',
}: BrokerApprovedWelcomeProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You're approved — your Broker Workspace is ready</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={brand}>{SITE_NAME}</Heading>
        <Heading style={h1}>
          {firstName ? `Welcome aboard, ${firstName}.` : "You're approved."}
        </Heading>
        <Text style={text}>
          Congratulations — your {SITE_NAME} Broker Workspace is live
          {businessName ? ` for ${businessName}` : ''}. You now have a private
          Paige workspace for every client you bring on, plus commission on
          every client subscription that flows through your code.
        </Text>

        <Section style={cardGold}>
          <Text style={cardLabel}>Your broker referral code</Text>
          <Text style={code}>{referralCode}</Text>
          <Text style={cardSub}>Share this anywhere — clients, social, email signature.</Text>
        </Section>

        <Section style={card}>
          <Text style={cardLabel}>Your client signup link ($17/mo broker rate)</Text>
          <Text style={smallLink}>{clientSignupLink}</Text>
          <Text style={cardSub}>
            $10 discount is pre-applied. Standard rate is $27 — your clients pay $17/mo, lifetime.
          </Text>
        </Section>

        <Section style={card}>
          <Text style={cardLabel}>Refer other brokers (15% commission, 12 months)</Text>
          <Text style={smallLink}>{brokerReferralLink}</Text>
        </Section>

        <Section style={{ textAlign: 'center', margin: '28px 0' }}>
          <Button href={dashboardUrl} style={btnPrimary}>
            Open My Broker Dashboard
          </Button>
        </Section>

        <Text style={text}>
          Inside the dashboard you'll be able to add clients, run private Paige
          sessions on their behalf, share strategy summaries, manage your team, and
          track your commissions in real time.
        </Text>

        <Text style={text}>
          Questions? Reply to this email or write to{' '}
          <a href="mailto:partners@paigeagent.ai" style={link}>partners@paigeagent.ai</a>.
        </Text>

        <Text style={signature}>
          Welcome to the program,
          <br />
          <strong>the Paige Agent AI team</strong>
          <br />
          Founder, Paige Agent AI
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: BrokerApprovedWelcomeEmail,
  subject: 'Welcome to the Paige Agent AI Broker Program — Your Workspace Is Ready',
  displayName: 'Broker — Approved welcome',
  previewData: {
    firstName: 'Jordan',
    businessName: 'Apex Consulting Group',
    referralCode: 'BROK-AB12CD',
    brokerReferralLink: 'https://paigeagent.ai/broker?ref=BROK-AB12CD',
    clientSignupLink: 'https://paigeagent.ai/auth?broker=BROK-AB12CD',
    dashboardUrl: 'https://paigeagent.ai/app',
  },
} satisfies TemplateEntry

const main: React.CSSProperties = {
  backgroundColor: '#ffffff',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif',
}
const container: React.CSSProperties = { padding: '32px 24px', maxWidth: '600px' }
const brand: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 700,
  color: '#CFAE70',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  margin: '0 0 18px',
}
const h1: React.CSSProperties = {
  fontSize: '26px',
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
const cardGold: React.CSSProperties = {
  background: '#FBF6E9',
  border: '1px solid #CFAE70',
  borderRadius: '10px',
  padding: '18px 20px',
  margin: '8px 0 14px',
  textAlign: 'center',
}
const card: React.CSSProperties = {
  background: '#F4F6F9',
  border: '1px solid #E1E6EE',
  borderRadius: '8px',
  padding: '14px 18px',
  margin: '0 0 14px',
}
const cardLabel: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 700,
  color: '#8B6F2F',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  margin: '0 0 6px',
}
const cardSub: React.CSSProperties = {
  fontSize: '12px',
  color: '#6B7480',
  margin: '4px 0 0',
}
const code: React.CSSProperties = {
  fontFamily: 'Menlo, Monaco, "Courier New", monospace',
  fontSize: '22px',
  fontWeight: 700,
  color: '#0B1B2B',
  margin: '4px 0',
  letterSpacing: '0.04em',
}
const smallLink: React.CSSProperties = {
  fontFamily: 'Menlo, Monaco, "Courier New", monospace',
  fontSize: '12px',
  color: '#0B1B2B',
  margin: '4px 0',
  wordBreak: 'break-all' as const,
}
const btnPrimary: React.CSSProperties = {
  background: '#0B1B2B',
  color: '#CFAE70',
  padding: '14px 28px',
  borderRadius: '6px',
  fontWeight: 700,
  fontSize: '15px',
  textDecoration: 'none',
  display: 'inline-block',
}
const link: React.CSSProperties = { color: '#0B1B2B', textDecoration: 'underline' }
const signature: React.CSSProperties = {
  fontSize: '14px',
  color: '#3a4654',
  lineHeight: 1.6,
  margin: '24px 0 0',
}
