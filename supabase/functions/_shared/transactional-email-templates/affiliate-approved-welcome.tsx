import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'PaigeAgent.ai'

interface Props {
  firstName?: string
  referralCode?: string
  referralLink?: string
  tierKey?: 'external' | 'coach' | 'admin' | string
}

const AffiliateApprovedWelcomeEmail = ({ firstName, referralCode, referralLink, tierKey }: Props) => {
  const code = referralCode || 'YOUR-CODE'
  const link = referralLink || `https://paigeagent.ai?ref=${code}`
  const isCoach = tierKey === 'coach'
  const tierLabel = isCoach ? 'Coach Partner' : 'Affiliate'
  const tierTerms = isCoach
    ? '30% lifetime commission on every paying subscriber you refer'
    : '25% commission for the first 12 months on every paying subscriber you refer'
  const social = `I use PaigeAgent AI to help my clients build credit, access capital, and structure their businesses for wealth. If you are serious about your financial future check it out here: ${link}`

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>You're approved — your {SITE_NAME} referral link is ready</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={headerBar}>
            <Heading style={logoText}>{SITE_NAME}</Heading>
            <Text style={tagline}>PME Partner Program</Text>
          </Section>

          <Section style={contentSection}>
            <Heading as="h2" style={h2}>
              {firstName ? `Welcome aboard, ${firstName}!` : 'Welcome aboard!'}
            </Heading>
            <Text style={text}>
              I'm Antonio Cook, founder of Project Mogul Enterprise. Thank you for joining
              the PME Partner Program — you are now an official <strong>{tierLabel}</strong>.
            </Text>
            <Text style={text}>
              You earn <strong>{tierTerms}</strong>. Commissions are tracked automatically
              the moment someone clicks your link.
            </Text>

            <Section style={codeWrapper}>
              <Text style={codeLabel}>YOUR REFERRAL CODE</Text>
              <Text style={codeValue}>{code}</Text>
            </Section>

            <Section style={linkWrapper}>
              <Text style={linkLabel}>YOUR REFERRAL LINK</Text>
              <Text style={linkValue}>{link}</Text>
            </Section>

            <Button style={button} href="https://paigeagent.ai/app/affiliate">
              View My Referral Dashboard
            </Button>

            <Heading as="h3" style={h3}>Ready to share? Copy this:</Heading>
            <Section style={socialBox}>
              <Text style={socialText}>{social}</Text>
            </Section>

            <Text style={smallText}>
              Track every click, signup, and commission inside PaigeAgent under{' '}
              <strong>Dashboard → My Referrals</strong>.
            </Text>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>
            © {new Date().getFullYear()} {SITE_NAME} · Project Mogul Enterprise Inc.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: AffiliateApprovedWelcomeEmail,
  subject: 'Welcome to the PME Partner Program — Your Referral Link is Ready',
  displayName: 'Affiliate Approved Welcome',
  previewData: {
    firstName: 'Jane',
    referralCode: 'JANE3X9K',
    referralLink: 'https://paigeagent.ai?ref=JANE3X9K',
    tierKey: 'coach',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }
const container = { maxWidth: '600px', margin: '0 auto' }
const headerBar = { backgroundColor: '#0a1628', padding: '32px 40px 28px', borderRadius: '8px 8px 0 0', textAlign: 'center' as const }
const logoText = { fontSize: '26px', fontWeight: 'bold' as const, color: '#CFAE70', margin: '0', letterSpacing: '0.5px' }
const tagline = { fontSize: '12px', color: '#9ca3af', margin: '6px 0 0', textTransform: 'uppercase' as const, letterSpacing: '2px' }
const contentSection = { padding: '36px 40px 24px' }
const h2 = { fontSize: '24px', fontWeight: 'bold' as const, color: '#0a1628', margin: '0 0 16px' }
const h3 = { fontSize: '16px', fontWeight: '700' as const, color: '#0a1628', margin: '24px 0 10px' }
const text = { fontSize: '15px', color: '#374151', lineHeight: '1.7', margin: '0 0 18px' }
const smallText = { fontSize: '13px', color: '#6b7280', lineHeight: '1.6', margin: '12px 0 0' }
const codeWrapper = { textAlign: 'center' as const, margin: '20px 0 14px', padding: '18px', backgroundColor: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb' }
const codeLabel = { fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '2px', margin: '0 0 8px', fontWeight: '600' as const }
const codeValue = { fontSize: '28px', fontWeight: '700' as const, color: '#0a1628', margin: '0', letterSpacing: '3px', fontFamily: 'monospace' }
const linkWrapper = { margin: '0 0 22px', padding: '14px 16px', backgroundColor: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb' }
const linkLabel = { fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '2px', margin: '0 0 6px', fontWeight: '600' as const }
const linkValue = { fontSize: '13px', color: '#0a1628', margin: '0', wordBreak: 'break-all' as const, fontFamily: 'monospace' }
const button = { backgroundColor: '#CFAE70', color: '#0a1628', padding: '14px 36px', borderRadius: '6px', fontSize: '16px', fontWeight: '700' as const, textDecoration: 'none', display: 'block' as const, textAlign: 'center' as const, margin: '8px auto 16px', maxWidth: '260px' }
const socialBox = { padding: '16px 18px', backgroundColor: '#0a1628', borderRadius: '6px', margin: '0 0 8px' }
const socialText = { fontSize: '14px', color: '#f3f4f6', lineHeight: '1.6', margin: '0', fontStyle: 'italic' as const }
const hr = { borderColor: '#e5e7eb', margin: '24px 40px' }
const footer = { fontSize: '12px', color: '#9ca3af', textAlign: 'center' as const, margin: '0', padding: '0 40px 32px' }
