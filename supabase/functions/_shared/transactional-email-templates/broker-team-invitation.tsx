/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'PaigeAgent'

interface BrokerTeamInvitationProps {
  firstName?: string
  brokerBusinessName?: string
  roleLabel?: string
  signupLink?: string
  expiresInDays?: number
}

const roleAccessCopy = (role?: string) => {
  switch (role) {
    case 'Lead Broker':
      return 'Full workspace access — add clients, run Paige sessions, manage the team, and view all client activity.'
    case 'Advisor':
      return 'Run Paige sessions with clients and share AI summaries — without team-management or billing access.'
    case 'Assistant':
      return 'Read-only access — view the client roster and session history to support the team.'
    default:
      return 'Collaborate with your team in PaigeAgent.'
  }
}

const BrokerTeamInvitationEmail = ({
  firstName,
  brokerBusinessName = 'your broker',
  roleLabel = 'Team Member',
  signupLink = 'https://paigeagent.ai/broker',
  expiresInDays = 7,
}: BrokerTeamInvitationProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`${brokerBusinessName} invited you to join their ${SITE_NAME} workspace`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Text style={brandLabel}>{SITE_NAME}</Text>
          <Heading style={h1}>{brokerBusinessName} has invited you</Heading>
          <Text style={subhead}>to join their {SITE_NAME} workspace as {roleLabel}</Text>
        </Section>

        <Section style={cardSection}>
          <Text style={greeting}>
            {firstName ? `Hi ${firstName},` : 'Hi there,'}
          </Text>
          <Text style={paragraph}>
            {brokerBusinessName} added you to their {SITE_NAME} workspace. Once you create your
            account, you'll be able to collaborate inside their workspace — your data, your client
            roster, and your Paige sessions all live under {brokerBusinessName}.
          </Text>

          <Section style={roleBox}>
            <Text style={roleHeader}>Your role: {roleLabel}</Text>
            <Text style={roleBody}>{roleAccessCopy(roleLabel)}</Text>
          </Section>

          <Section style={ctaWrap}>
            <Button href={signupLink} style={ctaButton}>
              Accept Invitation &amp; Create Your Account
            </Button>
          </Section>

          <Text style={fineprint}>
            This link expires in {expiresInDays} days. If you weren't expecting this email, you can
            safely ignore it.
          </Text>
        </Section>

        <Section style={footer}>
          <Text style={footerText}>
            {SITE_NAME} · The AI Funding &amp; Credit Coach
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: BrokerTeamInvitationEmail,
  subject: (data: Record<string, any>) =>
    `${data?.brokerBusinessName ?? 'A broker'} has invited you to their ${SITE_NAME} workspace`,
  displayName: 'Broker team invitation',
  previewData: {
    firstName: 'Jordan',
    brokerBusinessName: 'Mogul Capital Group',
    roleLabel: 'Advisor',
    signupLink: 'https://paigeagent.ai/broker/accept-invite?token=preview',
    expiresInDays: 7,
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif", margin: 0, padding: 0 }
const container = { maxWidth: '600px', margin: '0 auto', padding: '0' }
const header = { backgroundColor: '#0B0F1A', padding: '36px 32px 28px', textAlign: 'center' as const }
const brandLabel = { color: '#CFAE70', fontSize: '12px', fontWeight: 700, letterSpacing: '2px', margin: '0 0 18px', textTransform: 'uppercase' as const }
const h1 = { color: '#ffffff', fontFamily: "'Playfair Display', Georgia, serif", fontSize: '26px', fontWeight: 700, lineHeight: 1.25, margin: '0 0 10px' }
const subhead = { color: '#CFAE70', fontSize: '15px', margin: 0 }
const cardSection = { padding: '32px 32px 16px', backgroundColor: '#ffffff' }
const greeting = { color: '#0B0F1A', fontSize: '16px', fontWeight: 600, margin: '0 0 16px' }
const paragraph = { color: '#3a3f4a', fontSize: '15px', lineHeight: 1.6, margin: '0 0 24px' }
const roleBox = { backgroundColor: '#FAF7F0', borderLeft: '3px solid #CFAE70', padding: '16px 20px', margin: '0 0 28px', borderRadius: '4px' }
const roleHeader = { color: '#0B0F1A', fontSize: '14px', fontWeight: 700, margin: '0 0 6px' }
const roleBody = { color: '#3a3f4a', fontSize: '14px', lineHeight: 1.55, margin: 0 }
const ctaWrap = { textAlign: 'center' as const, margin: '8px 0 24px' }
const ctaButton = { backgroundColor: '#CFAE70', color: '#0B0F1A', display: 'inline-block', fontSize: '15px', fontWeight: 700, padding: '14px 28px', borderRadius: '6px', textDecoration: 'none' }
const fineprint = { color: '#888c95', fontSize: '12px', lineHeight: 1.5, margin: '0 0 8px', textAlign: 'center' as const }
const footer = { padding: '20px 32px 32px', textAlign: 'center' as const }
const footerText = { color: '#9aa0a8', fontSize: '11px', margin: 0 }
