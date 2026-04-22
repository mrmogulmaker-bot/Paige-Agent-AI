// Sent when a broker adds a client from the Broker Workspace.
// Invites the client to sign up at the broker's $17/mo Beta Starter rate.

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

const SITE_NAME = 'PaigeAgent'

interface Props {
  firstName?: string
  brokerBusinessName?: string
  brokerReferralCode?: string
  signupLink?: string
}

const BrokerClientInviteEmail = ({
  firstName,
  brokerBusinessName,
  brokerReferralCode,
  signupLink,
}: Props) => {
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,'
  const broker = brokerBusinessName || 'Your broker'
  const link = signupLink || 'https://paigeagent.ai/auth?mode=signup'

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{broker} invited you to {SITE_NAME} at $17/month</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>You’re invited to {SITE_NAME}</Heading>
          <Text style={text}>{greeting}</Text>
          <Text style={text}>
            <strong>{broker}</strong> has invited you to join {SITE_NAME} — the AI funding
            coach that helps you build credit, organize your finances, and qualify for
            the funding you need.
          </Text>

          <Section style={card}>
            <Text style={cardLabel}>Your exclusive broker rate</Text>
            <Text style={cardPrice}>$17 / month</Text>
            <Text style={cardFooter}>
              Locked in for life. Standard PaigeAgent pricing is $49/month — your broker
              partnership unlocks a $32 forever discount.
            </Text>
          </Section>

          <Section style={{ textAlign: 'center', margin: '28px 0' }}>
            <Button style={button} href={link}>
              Activate my $17/mo account
            </Button>
          </Section>

          {brokerReferralCode && (
            <Text style={smallText}>
              Referral code <span style={mono}>{brokerReferralCode}</span> is automatically
              applied when you sign up via the link above.
            </Text>
          )}

          <Text style={footer}>— The {SITE_NAME} Team</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: BrokerClientInviteEmail,
  subject: (data: Record<string, any>) =>
    `${data?.brokerBusinessName ? `${data.brokerBusinessName} invited you to ` : 'You’re invited to '}${SITE_NAME} at $17/mo`,
  displayName: 'Broker → client invite',
  previewData: {
    firstName: 'Alex',
    brokerBusinessName: 'Acme Credit Coaching',
    brokerReferralCode: 'BROK-A1B2C3',
    signupLink: 'https://paigeagent.ai/auth?ref=BROK-A1B2C3&mode=signup',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Inter, Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '24px', fontWeight: 'bold', color: '#000000', margin: '0 0 18px' }
const text = { fontSize: '15px', color: '#1f2937', lineHeight: '1.55', margin: '0 0 14px' }
const smallText = { fontSize: '13px', color: '#6b7280', lineHeight: '1.5', margin: '12px 0 0' }
const card = {
  background: '#FAF6EE',
  border: '1px solid #E8DCC0',
  borderRadius: '10px',
  padding: '20px 22px',
  margin: '20px 0',
  textAlign: 'center' as const,
}
const cardLabel = { fontSize: '12px', textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: '#6b5a35', margin: 0 }
const cardPrice = { fontSize: '32px', fontWeight: 'bold', color: '#000000', margin: '6px 0 6px' }
const cardFooter = { fontSize: '12px', color: '#6b5a35', lineHeight: '1.5', margin: 0 }
const button = {
  background: '#000000',
  color: '#CFAE70',
  borderRadius: '8px',
  padding: '13px 28px',
  fontSize: '15px',
  fontWeight: 600,
  textDecoration: 'none',
  display: 'inline-block',
}
const mono = { fontFamily: 'ui-monospace, SFMono-Regular, monospace', background: '#f3f4f6', padding: '1px 6px', borderRadius: '4px' }
const footer = { fontSize: '12px', color: '#9ca3af', margin: '28px 0 0' }
