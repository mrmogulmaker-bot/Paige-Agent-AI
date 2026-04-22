import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Preview, Text, Button, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "PaigeAgent.ai"
const LOGO_URL = 'https://bfmyebsjyuoecmjskqhs.supabase.co/storage/v1/object/public/email-assets/paige-logo-transparent.png'

interface CreditAlertProps {
  alertType?: string
  alertTitle?: string
  alertDescription?: string
  fundingImpact?: string
  recommendedAction?: string
  bureau?: string
}

const CreditAlertEmail = ({
  alertType = 'New Credit Event',
  alertTitle = 'Credit alert detected',
  alertDescription = 'A change was detected on your credit profile that may affect your funding strategy.',
  fundingImpact = 'This change can shift which lender programs you qualify for. Reviewing it now keeps your funding plan on track.',
  recommendedAction = 'Open PaigeAgent and review the alert details with Paige.',
  bureau,
}: CreditAlertProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`Credit Alert: ${alertType}${bureau ? ` on your ${bureau} report` : ''}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} alt={SITE_NAME} width="160" height="auto" style={logo} />
        <Text style={subheading}>Credit Alert</Text>
        <Hr style={hr} />
        <Section style={alertBanner}>
          <Text style={alertBadge}>🚨 {alertType}</Text>
        </Section>
        <Heading as="h2" style={h2}>{alertTitle}</Heading>
        <Text style={text}>{alertDescription}</Text>
        {bureau && <Text style={meta}>Reported by: <strong>{bureau}</strong></Text>}
        <Heading as="h3" style={h3}>What this means for your funding</Heading>
        <Text style={text}>{fundingImpact}</Text>
        <Heading as="h3" style={h3}>Recommended next step</Heading>
        <Text style={text}>{recommendedAction}</Text>
        <Button style={button} href="https://paigeagent.ai/app/credit">
          View in PaigeAgent
        </Button>
        <Hr style={hr} />
        <Text style={footer}>© {new Date().getFullYear()} {SITE_NAME}. You received this because credit alerts are enabled in your notification preferences.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: CreditAlertEmail,
  subject: (data: Record<string, any>) => `🚨 Credit Alert — ${data.alertType || 'New Credit Event'} Detected`,
  displayName: 'Credit Alert',
  previewData: {
    alertType: 'New Hard Inquiry',
    alertTitle: 'New hard inquiry on your Experian report',
    alertDescription: 'A new hard inquiry was added to your Experian credit file in the last 24 hours.',
    fundingImpact: 'Multiple recent inquiries can lower your score 5-10 points and signal credit-seeking behavior to underwriters.',
    recommendedAction: 'Verify this inquiry was authorized. If unrecognized, dispute it through the bureau directly.',
    bureau: 'Experian',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }
const container = { padding: '40px 25px', maxWidth: '600px', margin: '0 auto' }
const logo = { display: 'block' as const, margin: '0 auto 8px' }
const subheading = { fontSize: '14px', color: '#6b7280', textAlign: 'center' as const, margin: '0' }
const hr = { borderColor: '#e5e7eb', margin: '24px 0' }
const alertBanner = { backgroundColor: '#fef2f2', padding: '12px 16px', borderRadius: '6px', borderLeft: '4px solid #dc2626', margin: '0 0 20px' }
const alertBadge = { fontSize: '14px', fontWeight: '600' as const, color: '#991b1b', margin: '0' }
const h2 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0a1628', margin: '0 0 12px' }
const h3 = { fontSize: '16px', fontWeight: '600' as const, color: '#0a1628', margin: '20px 0 8px' }
const text = { fontSize: '15px', color: '#374151', lineHeight: '1.6', margin: '0 0 12px' }
const meta = { fontSize: '13px', color: '#6b7280', margin: '0 0 12px' }
const button = { backgroundColor: '#CFAE70', color: '#ffffff', padding: '12px 30px', borderRadius: '6px', fontSize: '16px', fontWeight: '600' as const, textDecoration: 'none', display: 'block' as const, textAlign: 'center' as const, margin: '24px auto' }
const footer = { fontSize: '12px', color: '#9ca3af', textAlign: 'center' as const, margin: '0' }
