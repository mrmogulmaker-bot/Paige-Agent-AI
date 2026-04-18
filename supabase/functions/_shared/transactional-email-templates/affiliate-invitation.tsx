import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Button, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "PaigeAgent.ai"

interface AffiliateInvitationProps {
  name?: string
  referralCode?: string
  referralLink?: string
  setPasswordUrl?: string
  invitedBy?: string
  tier?: string
}

const AffiliateInvitationEmail = ({
  name, referralCode, referralLink, setPasswordUrl, invitedBy, tier,
}: AffiliateInvitationProps) => {
  const greeting = name ? `Welcome, ${name}!` : 'Welcome to the program!'
  const link = referralLink || 'https://paigeagent.ai/pricing'
  const setupLink = setPasswordUrl || 'https://paigeagent.ai/auth?mode=login'
  const tierLabel = tier === 'admin' ? 'Admin Partner' : tier === 'coach' ? 'Coach Partner' : 'Affiliate Partner'

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>You're now a {SITE_NAME} affiliate — share your link and start earning</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={headerBar}>
            <Heading style={logoText}>{SITE_NAME}</Heading>
            <Text style={tagline}>Affiliate Program</Text>
          </Section>

          <Section style={contentSection}>
            <Heading as="h2" style={h2}>{greeting}</Heading>
            <Text style={text}>
              {invitedBy ? `${invitedBy} has enrolled you` : `You've been enrolled`} in the {SITE_NAME} affiliate program as a <strong>{tierLabel}</strong>. Share your unique link with anyone who needs help building credit or securing funding — you earn a commission on every paying customer.
            </Text>

            <Section style={codeWrapper}>
              <Text style={codeLabel}>YOUR REFERRAL CODE</Text>
              <Text style={codeValue}>{referralCode || '—'}</Text>
            </Section>

            <Section style={linkWrapper}>
              <Text style={linkLabel}>YOUR REFERRAL LINK</Text>
              <Text style={linkValue}>{link}</Text>
            </Section>

            <Button style={button} href={setupLink}>
              Set Your Password & Sign In
            </Button>

            <Text style={helperText}>
              Once signed in, visit <strong>Dashboard → Affiliate</strong> to track clicks, signups, and commissions in real time.
            </Text>
          </Section>

          <Section style={featureSection}>
            <Text style={featureTitle}>How it works:</Text>
            <Text style={featureItem}>1. Share your referral link or code anywhere</Text>
            <Text style={featureItem}>2. We automatically track clicks and signups</Text>
            <Text style={featureItem}>3. You earn commission on every paying subscriber</Text>
            <Text style={featureItem}>4. Get paid monthly via your preferred payout method</Text>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>© {new Date().getFullYear()} {SITE_NAME} · Project Mogul Enterprise Inc. All rights reserved.</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: AffiliateInvitationEmail,
  subject: (data: Record<string, any>) =>
    `You're a ${SITE_NAME} affiliate${data.referralCode ? ` — code ${data.referralCode}` : ''}`,
  displayName: 'Affiliate Invitation',
  previewData: {
    name: 'Jane Doe',
    referralCode: 'JANE3X9K',
    referralLink: 'https://paigeagent.ai/pricing?ref=JANE3X9K',
    setPasswordUrl: 'https://paigeagent.ai/auth?mode=recovery',
    invitedBy: 'Antonio',
    tier: 'external',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }
const container = { maxWidth: '600px', margin: '0 auto' }
const headerBar = { backgroundColor: '#0a1628', padding: '32px 40px 28px', borderRadius: '8px 8px 0 0', textAlign: 'center' as const }
const logoText = { fontSize: '26px', fontWeight: 'bold' as const, color: '#CFAE70', margin: '0', letterSpacing: '0.5px' }
const tagline = { fontSize: '12px', color: '#9ca3af', margin: '6px 0 0', textTransform: 'uppercase' as const, letterSpacing: '2px' }
const contentSection = { padding: '36px 40px 24px' }
const h2 = { fontSize: '24px', fontWeight: 'bold' as const, color: '#0a1628', margin: '0 0 16px' }
const text = { fontSize: '15px', color: '#374151', lineHeight: '1.7', margin: '0 0 20px' }
const codeWrapper = { textAlign: 'center' as const, margin: '24px 0 16px', padding: '18px', backgroundColor: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb' }
const codeLabel = { fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '2px', margin: '0 0 8px', fontWeight: '600' as const }
const codeValue = { fontSize: '28px', fontWeight: '700' as const, color: '#0a1628', margin: '0', letterSpacing: '3px', fontFamily: 'monospace' }
const linkWrapper = { margin: '0 0 24px', padding: '14px 16px', backgroundColor: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb' }
const linkLabel = { fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '2px', margin: '0 0 6px', fontWeight: '600' as const }
const linkValue = { fontSize: '13px', color: '#0a1628', margin: '0', wordBreak: 'break-all' as const, fontFamily: 'monospace' }
const button = { backgroundColor: '#CFAE70', color: '#0a1628', padding: '14px 36px', borderRadius: '6px', fontSize: '16px', fontWeight: '700' as const, textDecoration: 'none', display: 'block' as const, textAlign: 'center' as const, margin: '12px auto 16px' }
const helperText = { fontSize: '13px', color: '#6b7280', lineHeight: '1.5', margin: '0', textAlign: 'center' as const }
const featureSection = { backgroundColor: '#f9fafb', padding: '24px 40px', margin: '8px 0 0', borderRadius: '0 0 8px 8px' }
const featureTitle = { fontSize: '14px', fontWeight: '600' as const, color: '#0a1628', margin: '0 0 14px' }
const featureItem = { fontSize: '14px', color: '#4b5563', lineHeight: '1.6', margin: '0 0 8px' }
const hr = { borderColor: '#e5e7eb', margin: '24px 40px' }
const footer = { fontSize: '12px', color: '#9ca3af', textAlign: 'center' as const, margin: '0', padding: '0 40px 32px' }
