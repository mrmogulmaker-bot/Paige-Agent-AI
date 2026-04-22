import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Preview, Text, Button, Hr, Section, Row, Column,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "PaigeAgent.ai"
const LOGO_URL = 'https://bfmyebsjyuoecmjskqhs.supabase.co/storage/v1/object/public/email-assets/paige-logo-transparent.png'

interface FundingOpportunityProps {
  lenderName?: string
  productType?: string
  rate?: string
  amount?: string
  term?: string
  matchReason?: string
  name?: string
}

const FundingOpportunityEmail = ({
  lenderName = 'Featured Lender',
  productType = 'Working Capital',
  rate = '8.5',
  amount = '$50,000–$150,000',
  term = '12–36 months',
  matchReason = 'Your business profile and credit standing align with this lender\'s preferred borrower criteria.',
  name,
}: FundingOpportunityProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`New funding match — ${lenderName} at ${rate}%`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} alt={SITE_NAME} width="160" height="auto" style={logo} />
        <Text style={subheading}>Funding Match</Text>
        <Hr style={hr} />
        <Heading as="h2" style={h2}>{name ? `${name}, Paige found a match` : 'Paige found a new funding match'}</Heading>
        <Section style={lenderBox}>
          <Text style={lenderName_}>{lenderName}</Text>
          <Text style={productLabel}>{productType}</Text>
          <Hr style={innerHr} />
          <Row>
            <Column style={termCol}>
              <Text style={termLabel}>Rate</Text>
              <Text style={termValue}>{rate}%</Text>
            </Column>
            <Column style={termCol}>
              <Text style={termLabel}>Amount</Text>
              <Text style={termValueSmall}>{amount}</Text>
            </Column>
            <Column style={termCol}>
              <Text style={termLabel}>Term</Text>
              <Text style={termValueSmall}>{term}</Text>
            </Column>
          </Row>
        </Section>
        <Heading as="h3" style={h3}>Why Paige matched this to you</Heading>
        <Text style={text}>{matchReason}</Text>
        <Button style={button} href="https://paigeagent.ai/app/funding">
          View This Opportunity
        </Button>
        <Hr style={hr} />
        <Text style={footer}>© {new Date().getFullYear()} {SITE_NAME}. You received this because funding alerts are enabled in your notification preferences.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: FundingOpportunityEmail,
  subject: (data: Record<string, any>) => `💰 New Funding Match — ${data.lenderName || 'Featured Lender'} at ${data.rate || '8.5'}%`,
  displayName: 'Funding Opportunity',
  previewData: {
    lenderName: 'Bluevine',
    productType: 'Line of Credit',
    rate: '7.9',
    amount: '$75,000',
    term: '24 months',
    matchReason: 'Your TIB, monthly revenue, and Intelliscore all sit comfortably above this lender\'s minimums.',
    name: 'Antonio',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }
const container = { padding: '40px 25px', maxWidth: '600px', margin: '0 auto' }
const logo = { display: 'block' as const, margin: '0 auto 8px' }
const subheading = { fontSize: '14px', color: '#6b7280', textAlign: 'center' as const, margin: '0' }
const hr = { borderColor: '#e5e7eb', margin: '24px 0' }
const innerHr = { borderColor: '#e5e7eb', margin: '16px 0' }
const h2 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0a1628', margin: '0 0 16px' }
const h3 = { fontSize: '16px', fontWeight: '600' as const, color: '#0a1628', margin: '20px 0 8px' }
const text = { fontSize: '15px', color: '#374151', lineHeight: '1.6', margin: '0 0 12px' }
const lenderBox = { backgroundColor: '#f9fafb', padding: '20px', borderRadius: '8px', border: '1px solid #e5e7eb', margin: '16px 0 24px' }
const lenderName_ = { fontSize: '20px', fontWeight: 'bold' as const, color: '#0a1628', margin: '0 0 4px' }
const productLabel = { fontSize: '13px', color: '#CFAE70', fontWeight: '600' as const, textTransform: 'uppercase' as const, letterSpacing: '1px', margin: '0' }
const termCol = { textAlign: 'center' as const, padding: '0 4px' }
const termLabel = { fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.5px', margin: '0 0 4px' }
const termValue = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0a1628', margin: '0' }
const termValueSmall = { fontSize: '14px', fontWeight: '600' as const, color: '#0a1628', margin: '0' }
const button = { backgroundColor: '#CFAE70', color: '#ffffff', padding: '12px 30px', borderRadius: '6px', fontSize: '16px', fontWeight: '600' as const, textDecoration: 'none', display: 'block' as const, textAlign: 'center' as const, margin: '24px auto' }
const footer = { fontSize: '12px', color: '#9ca3af', textAlign: 'center' as const, margin: '0' }
