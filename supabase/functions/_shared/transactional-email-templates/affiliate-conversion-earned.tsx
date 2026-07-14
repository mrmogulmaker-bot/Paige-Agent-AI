import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { EmailFooter } from './email-footer.tsx'

const SITE_NAME = 'PaigeAgent.ai'

interface Props {
  planName?: string
  commissionEarned?: string
  commissionRate?: string
  monthToDate?: string
  unsubscribeUrl?: string
}

const AffiliateConversionEarnedEmail = ({
  planName, commissionEarned, commissionRate, monthToDate, unsubscribeUrl,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>💰 You just earned a commission on PaigeAgent</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={headerBar}>
          <Heading style={logoText}>{SITE_NAME}</Heading>
          <Text style={tagline}>Commission Earned</Text>
        </Section>

        <Section style={contentSection}>
          <Heading as="h2" style={h2}>💰 Cha-ching! You just earned a commission.</Heading>
          <Text style={text}>
            Someone just subscribed to <strong>{planName || 'PaigeAgent'}</strong> using
            your referral link.
          </Text>

          <Section style={amountBox}>
            <Text style={amountLabel}>YOU EARNED</Text>
            <Text style={amountValue}>{commissionEarned || '$—'}</Text>
            {commissionRate && (
              <Text style={amountSub}>{commissionRate} commission rate</Text>
            )}
          </Section>

          {monthToDate && (
            <Section style={mtdBox}>
              <Text style={mtdLabel}>Month-to-date earnings</Text>
              <Text style={mtdValue}>{monthToDate}</Text>
            </Section>
          )}

          <Text style={text}>
            Keep sharing your link — every conversion compounds. The next one is on the way.
          </Text>

          <Button style={button} href="https://paigeagent.ai/app/affiliate">
            View Your Earnings
          </Button>
        </Section>

        <Hr style={hr} />
        <Text style={footer}>
          © {new Date().getFullYear()} {SITE_NAME}
        </Text>
        <EmailFooter unsubscribeUrl={unsubscribeUrl} />
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: AffiliateConversionEarnedEmail,
  subject: '💰 You Just Earned a Commission — Someone Subscribed Using Your Link',
  displayName: 'Affiliate Conversion Earned',
  previewData: {
    planName: 'Pro $67',
    commissionEarned: '$20.10',
    commissionRate: '30%',
    monthToDate: '$184.50',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }
const container = { maxWidth: '600px', margin: '0 auto' }
const headerBar = { backgroundColor: '#0a1628', padding: '32px 40px 28px', borderRadius: '8px 8px 0 0', textAlign: 'center' as const }
const logoText = { fontSize: '26px', fontWeight: 'bold' as const, color: '#EBB94C', margin: '0', letterSpacing: '0.5px' }
const tagline = { fontSize: '12px', color: '#9ca3af', margin: '6px 0 0', textTransform: 'uppercase' as const, letterSpacing: '2px' }
const contentSection = { padding: '36px 40px 24px' }
const h2 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0a1628', margin: '0 0 16px', textAlign: 'center' as const }
const text = { fontSize: '15px', color: '#374151', lineHeight: '1.7', margin: '0 0 18px', textAlign: 'center' as const }
const amountBox = { textAlign: 'center' as const, margin: '24px 0', padding: '28px 20px', backgroundColor: '#0a1628', borderRadius: '8px' }
const amountLabel = { fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '2px', margin: '0 0 8px', fontWeight: '600' as const }
const amountValue = { fontSize: '44px', fontWeight: '800' as const, color: '#EBB94C', margin: '0', lineHeight: '1.1' }
const amountSub = { fontSize: '12px', color: '#9ca3af', margin: '8px 0 0' }
const mtdBox = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', backgroundColor: '#f9fafb', borderRadius: '6px', margin: '0 0 22px', textAlign: 'center' as const }
const mtdLabel = { fontSize: '13px', color: '#6b7280', margin: '0 0 4px' }
const mtdValue = { fontSize: '20px', fontWeight: '700' as const, color: '#0a1628', margin: '0' }
const button = { backgroundColor: '#EBB94C', color: '#0a1628', padding: '14px 36px', borderRadius: '6px', fontSize: '16px', fontWeight: '700' as const, textDecoration: 'none', display: 'block' as const, textAlign: 'center' as const, margin: '8px auto 0', maxWidth: '240px' }
const hr = { borderColor: '#e5e7eb', margin: '24px 40px' }
const footer = { fontSize: '12px', color: '#9ca3af', textAlign: 'center' as const, margin: '0', padding: '0 40px 32px' }
