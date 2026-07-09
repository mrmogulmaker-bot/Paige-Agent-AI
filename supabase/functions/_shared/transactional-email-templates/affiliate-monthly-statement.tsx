import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'PaigeAgent.ai'

interface Props {
  monthLabel?: string
  clicks?: number | string
  signups?: number | string
  conversions?: number | string
  earned?: string
  paid?: string
  pending?: string
  ytdTotal?: string
  referralLink?: string
  firstName?: string
}

const AffiliateMonthlyStatementEmail = ({
  monthLabel, clicks, signups, conversions, earned, paid, pending, ytdTotal, referralLink, firstName,
}: Props) => {
  const link = referralLink || 'https://paigeagent.ai'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Your {monthLabel || 'monthly'} Paige Agent AI Partner statement</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={headerBar}>
            <Heading style={logoText}>{SITE_NAME}</Heading>
            <Text style={tagline}>{monthLabel || 'Monthly'} Partner Statement</Text>
          </Section>

          <Section style={contentSection}>
            <Heading as="h2" style={h2}>
              {firstName ? `Here's your ${monthLabel || 'monthly'} recap, ${firstName}.` : `Here's your ${monthLabel || 'monthly'} recap.`}
            </Heading>

            <table style={statsTable}>
              <tbody>
                <StatRow label="Clicks" value={String(clicks ?? 0)} />
                <StatRow label="Signups" value={String(signups ?? 0)} />
                <StatRow label="Conversions" value={String(conversions ?? 0)} />
                <StatRow label="Commission earned" value={earned || '$0.00'} highlight />
                <StatRow label="Commission paid" value={paid || '$0.00'} />
                <StatRow label="Pending balance" value={pending || '$0.00'} />
                <StatRow label="Year-to-date total" value={ytdTotal || '$0.00'} highlight />
              </tbody>
            </table>

            <Section style={linkWrapper}>
              <Text style={linkLabel}>YOUR REFERRAL LINK</Text>
              <Text style={linkValue}>{link}</Text>
            </Section>

            <Text style={text}>
              Every share is one more business owner you help build wealth. Keep going —
              the partners who win this year are the ones who stay consistent.
            </Text>

            <Button style={button} href="https://paigeagent.ai/app/affiliate">
              Share Your Link
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
}

const StatRow = ({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) => (
  <tr>
    <td style={{
      fontSize: '14px',
      color: highlight ? '#0a1628' : '#374151',
      fontWeight: highlight ? 700 : 400,
      padding: '10px 12px',
      borderBottom: '1px solid #e5e7eb',
    }}>{label}</td>
    <td style={{
      fontSize: '15px',
      color: highlight ? '#CFAE70' : '#0a1628',
      fontWeight: 700,
      textAlign: 'right' as const,
      padding: '10px 12px',
      borderBottom: '1px solid #e5e7eb',
      fontFamily: 'monospace',
    }}>{value}</td>
  </tr>
)

export const template = {
  component: AffiliateMonthlyStatementEmail,
  subject: (data: Record<string, any>) =>
    `Your ${data.monthLabel || 'Monthly'} Paige Agent AI Partner Statement`,
  displayName: 'Affiliate Monthly Statement',
  previewData: {
    monthLabel: 'March 2026',
    clicks: 142,
    signups: 8,
    conversions: 3,
    earned: '$201.00',
    paid: '$0.00',
    pending: '$201.00',
    ytdTotal: '$612.50',
    referralLink: 'https://paigeagent.ai?ref=JANE3X9K',
    firstName: 'Jane',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }
const container = { maxWidth: '600px', margin: '0 auto' }
const headerBar = { backgroundColor: '#0a1628', padding: '32px 40px 28px', borderRadius: '8px 8px 0 0', textAlign: 'center' as const }
const logoText = { fontSize: '26px', fontWeight: 'bold' as const, color: '#CFAE70', margin: '0', letterSpacing: '0.5px' }
const tagline = { fontSize: '12px', color: '#9ca3af', margin: '6px 0 0', textTransform: 'uppercase' as const, letterSpacing: '2px' }
const contentSection = { padding: '36px 40px 24px' }
const h2 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0a1628', margin: '0 0 18px' }
const text = { fontSize: '14px', color: '#374151', lineHeight: '1.7', margin: '14px 0 20px' }
const statsTable = { width: '100%', borderCollapse: 'collapse' as const, margin: '0 0 24px', border: '1px solid #e5e7eb', borderRadius: '6px', overflow: 'hidden' as const }
const linkWrapper = { margin: '0 0 18px', padding: '14px 16px', backgroundColor: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb' }
const linkLabel = { fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '2px', margin: '0 0 6px', fontWeight: '600' as const }
const linkValue = { fontSize: '13px', color: '#0a1628', margin: '0', wordBreak: 'break-all' as const, fontFamily: 'monospace' }
const button = { backgroundColor: '#CFAE70', color: '#0a1628', padding: '14px 36px', borderRadius: '6px', fontSize: '15px', fontWeight: '700' as const, textDecoration: 'none', display: 'block' as const, textAlign: 'center' as const, margin: '0 auto', maxWidth: '240px' }
const hr = { borderColor: '#e5e7eb', margin: '24px 40px' }
const footer = { fontSize: '12px', color: '#9ca3af', textAlign: 'center' as const, margin: '0', padding: '0 40px 32px' }
