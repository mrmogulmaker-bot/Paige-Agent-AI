import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'PaigeAgent.ai'

interface Props {
  amount?: string
  paymentMethod?: string
  periodLabel?: string
  ytdTotal?: string
}

const AffiliateCommissionPaidEmail = ({ amount, paymentMethod, periodLabel, ytdTotal }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>✅ Your commission payment has been sent</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={headerBar}>
          <Heading style={logoText}>{SITE_NAME}</Heading>
          <Text style={tagline}>Payment Confirmed</Text>
        </Section>

        <Section style={contentSection}>
          <Heading as="h2" style={h2}>✅ Payment sent</Heading>
          <Text style={text}>
            We just sent your latest PME Partner commission. Thanks for everything you do
            to help business owners build credit and access capital.
          </Text>

          <Section style={amountBox}>
            <Text style={amountLabel}>AMOUNT PAID</Text>
            <Text style={amountValue}>{amount || '$—'}</Text>
          </Section>

          <Section style={detailsBox}>
            <DetailRow label="Payment method" value={paymentMethod || 'On file'} />
            <DetailRow label="Commission period" value={periodLabel || '—'} />
            {ytdTotal && <DetailRow label="Paid year-to-date" value={ytdTotal} />}
          </Section>

          <Button style={button} href="https://paigeagent.ai/app/affiliate">
            View Payment History
          </Button>
        </Section>

        <Hr style={hr} />
        <Text style={footer}>
          © {new Date().getFullYear()} {SITE_NAME} · Project Mogul Enterprise Inc.
        </Text>
      </Container>
    </Body>
  </Html>
)

const DetailRow = ({ label, value }: { label: string; value: string }) => (
  <table style={{ width: '100%', borderCollapse: 'collapse', margin: '0 0 10px' }}>
    <tbody>
      <tr>
        <td style={{ fontSize: '13px', color: '#6b7280', padding: '0' }}>{label}</td>
        <td style={{ fontSize: '14px', color: '#0a1628', fontWeight: 600, textAlign: 'right' as const, padding: '0' }}>{value}</td>
      </tr>
    </tbody>
  </table>
)

export const template = {
  component: AffiliateCommissionPaidEmail,
  subject: (data: Record<string, any>) =>
    `✅ Commission Payment Confirmed${data.amount ? ` — ${data.amount} Sent` : ''}`,
  displayName: 'Affiliate Commission Paid',
  previewData: {
    amount: '$425.00',
    paymentMethod: 'ACH',
    periodLabel: 'March 2026',
    ytdTotal: '$1,820.00',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }
const container = { maxWidth: '600px', margin: '0 auto' }
const headerBar = { backgroundColor: '#0a1628', padding: '32px 40px 28px', borderRadius: '8px 8px 0 0', textAlign: 'center' as const }
const logoText = { fontSize: '26px', fontWeight: 'bold' as const, color: '#CFAE70', margin: '0', letterSpacing: '0.5px' }
const tagline = { fontSize: '12px', color: '#9ca3af', margin: '6px 0 0', textTransform: 'uppercase' as const, letterSpacing: '2px' }
const contentSection = { padding: '36px 40px 24px' }
const h2 = { fontSize: '24px', fontWeight: 'bold' as const, color: '#0a1628', margin: '0 0 16px', textAlign: 'center' as const }
const text = { fontSize: '15px', color: '#374151', lineHeight: '1.7', margin: '0 0 18px' }
const amountBox = { textAlign: 'center' as const, margin: '20px 0', padding: '24px 20px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }
const amountLabel = { fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '2px', margin: '0 0 8px', fontWeight: '600' as const }
const amountValue = { fontSize: '36px', fontWeight: '800' as const, color: '#0a1628', margin: '0', lineHeight: '1.1' }
const detailsBox = { padding: '18px 20px', backgroundColor: '#fafafa', borderRadius: '6px', margin: '0 0 24px' }
const button = { backgroundColor: '#CFAE70', color: '#0a1628', padding: '14px 36px', borderRadius: '6px', fontSize: '15px', fontWeight: '700' as const, textDecoration: 'none', display: 'block' as const, textAlign: 'center' as const, margin: '0 auto', maxWidth: '240px' }
const hr = { borderColor: '#e5e7eb', margin: '24px 40px' }
const footer = { fontSize: '12px', color: '#9ca3af', textAlign: 'center' as const, margin: '0', padding: '0 40px 32px' }
