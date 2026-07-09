import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Preview, Text, Button, Hr, Section, Row, Column,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "Paige Agent AI"
const LOGO_URL = 'https://bfmyebsjyuoecmjskqhs.supabase.co/storage/v1/object/public/email-assets/paige-logo-transparent.png'

interface WeeklySummaryProps {
  name?: string
  newClients?: number
  followUpsSent?: number
  sessionsHeld?: number
  atRiskCount?: number
  topRecommendation?: string
}

const WeeklySummaryEmail = ({
  name,
  newClients = 0,
  followUpsSent = 0,
  sessionsHeld = 0,
  atRiskCount = 0,
  topRecommendation = 'Two clients have gone quiet for over a week — Paige has drafted check-in notes for each, ready for your approval.',
}: WeeklySummaryProps) => {
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Your weekly practice summary from Paige</Preview>
      <Body style={main}>
        <Container style={container}>
          <Img src={LOGO_URL} alt={SITE_NAME} width="160" height="auto" style={logo} />
          <Text style={subheading}>Weekly Practice Summary</Text>
          <Hr style={hr} />
          <Heading as="h2" style={h2}>{name ? `${name}'s week at a glance` : 'Your week at a glance'}</Heading>
          <Section style={statsRow}>
            <Row>
              <Column style={statCol}>
                <Text style={statLabel}>New Clients</Text>
                <Text style={statValue}>{newClients}</Text>
                <Text style={statSubLabel}>This week</Text>
              </Column>
              <Column style={statCol}>
                <Text style={statLabel}>Follow-ups</Text>
                <Text style={statValue}>{followUpsSent}</Text>
                <Text style={statSubLabel}>Sent</Text>
              </Column>
              <Column style={statCol}>
                <Text style={statLabel}>Sessions</Text>
                <Text style={statValue}>{sessionsHeld}</Text>
                <Text style={statSubLabel}>Held</Text>
              </Column>
              <Column style={statCol}>
                <Text style={statLabel}>At-Risk</Text>
                <Text style={{ ...statValue, color: atRiskCount > 0 ? '#dc2626' : '#0a1628' }}>{atRiskCount}</Text>
                <Text style={statSubLabel}>Flagged</Text>
              </Column>
            </Row>
          </Section>
          <Heading as="h3" style={h3}>Paige's recommendation this week</Heading>
          <Text style={text}>{topRecommendation}</Text>
          <Text style={motivational}>Every week you show up for your clients compounds. Keep it moving.</Text>
          <Button style={button} href="https://app.paigeagent.ai">
            Open Paige
          </Button>
          <Hr style={hr} />
          <Text style={footer}>© {new Date().getFullYear()} {SITE_NAME}. You received this because the weekly summary is enabled in your notification preferences.</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: WeeklySummaryEmail,
  subject: '📊 Your Weekly Practice Summary from Paige',
  displayName: 'Weekly Summary',
  previewData: {
    name: 'Antonio',
    newClients: 4,
    followUpsSent: 18,
    sessionsHeld: 9,
    atRiskCount: 2,
    topRecommendation: 'Two retainers renew in the next ten days. Paige has prepped the renewal notes and a recap of each client\'s recent wins — review and send before Friday to lock them in early.',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }
const container = { padding: '40px 25px', maxWidth: '600px', margin: '0 auto' }
const logo = { display: 'block' as const, margin: '0 auto 8px' }
const subheading = { fontSize: '14px', color: '#6b7280', textAlign: 'center' as const, margin: '0' }
const hr = { borderColor: '#e5e7eb', margin: '24px 0' }
const h2 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0a1628', margin: '0 0 16px' }
const h3 = { fontSize: '16px', fontWeight: '600' as const, color: '#0a1628', margin: '20px 0 8px' }
const text = { fontSize: '15px', color: '#374151', lineHeight: '1.6', margin: '0 0 12px' }
const motivational = { fontSize: '15px', color: '#EBB94C', fontStyle: 'italic' as const, lineHeight: '1.6', margin: '0 0 12px' }
const statsRow = { backgroundColor: '#f9fafb', padding: '24px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', margin: '16px 0 24px' }
const statCol = { textAlign: 'center' as const, padding: '0 4px' }
const statLabel = { fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.5px', margin: '0 0 6px' }
const statValue = { fontSize: '28px', fontWeight: 'bold' as const, color: '#0a1628', margin: '0 0 4px', lineHeight: '1' }
const statSubLabel = { fontSize: '11px', color: '#9ca3af', margin: '0' }
const button = { backgroundColor: '#EBB94C', color: '#ffffff', padding: '12px 30px', borderRadius: '6px', fontSize: '16px', fontWeight: '600' as const, textDecoration: 'none', display: 'block' as const, textAlign: 'center' as const, margin: '24px auto' }
const footer = { fontSize: '12px', color: '#9ca3af', textAlign: 'center' as const, margin: '0' }
