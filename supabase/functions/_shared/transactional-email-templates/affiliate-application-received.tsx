import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'PaigeAgent.ai'

interface Props {
  name?: string
  tierKey?: 'external' | 'coach' | 'admin' | string
}

const AffiliateApplicationReceivedEmail = ({ name, tierKey }: Props) => {
  const isCoach = tierKey === 'coach'
  const tierLabel = isCoach ? 'Coach Partner' : 'Affiliate'
  const timeline = isCoach
    ? 'A PME team member will personally review your Coach Partner application within 24 hours.'
    : 'Affiliate accounts are activated instantly. Watch your inbox for your welcome email and unique referral link in the next few minutes.'

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>We received your {SITE_NAME} Partner application</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={headerBar}>
            <Heading style={logoText}>{SITE_NAME}</Heading>
            <Text style={tagline}>Partner Program</Text>
          </Section>

          <Section style={contentSection}>
            <Heading as="h2" style={h2}>
              {name ? `Thank you, ${name}!` : 'Thank you!'}
            </Heading>
            <Text style={text}>
              We received your application to join the PME Partner Program as a{' '}
              <strong>{tierLabel}</strong>. Our team has it in front of them now.
            </Text>

            <Section style={infoBox}>
              <Text style={infoLabel}>WHAT HAPPENS NEXT</Text>
              <Text style={infoText}>{timeline}</Text>
            </Section>

            <Text style={text}>
              Questions? Reach our partner team any time at{' '}
              <a href="mailto:partners@paigeagent.ai" style={link}>partners@paigeagent.ai</a>.
            </Text>

            <Button style={button} href="https://paigeagent.ai">
              Visit PaigeAgent
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
}

export const template = {
  component: AffiliateApplicationReceivedEmail,
  subject: 'Your PaigeAgent Partner Application is Received',
  displayName: 'Affiliate Application Received',
  previewData: { name: 'Jane', tierKey: 'coach' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }
const container = { maxWidth: '600px', margin: '0 auto' }
const headerBar = { backgroundColor: '#0a1628', padding: '32px 40px 28px', borderRadius: '8px 8px 0 0', textAlign: 'center' as const }
const logoText = { fontSize: '26px', fontWeight: 'bold' as const, color: '#CFAE70', margin: '0', letterSpacing: '0.5px' }
const tagline = { fontSize: '12px', color: '#9ca3af', margin: '6px 0 0', textTransform: 'uppercase' as const, letterSpacing: '2px' }
const contentSection = { padding: '36px 40px 24px' }
const h2 = { fontSize: '24px', fontWeight: 'bold' as const, color: '#0a1628', margin: '0 0 16px' }
const text = { fontSize: '15px', color: '#374151', lineHeight: '1.7', margin: '0 0 18px' }
const infoBox = { margin: '20px 0 24px', padding: '18px 20px', backgroundColor: '#f9fafb', borderLeft: '3px solid #CFAE70', borderRadius: '4px' }
const infoLabel = { fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '2px', margin: '0 0 8px', fontWeight: '600' as const }
const infoText = { fontSize: '14px', color: '#374151', lineHeight: '1.6', margin: '0' }
const button = { backgroundColor: '#CFAE70', color: '#0a1628', padding: '14px 36px', borderRadius: '6px', fontSize: '15px', fontWeight: '700' as const, textDecoration: 'none', display: 'block' as const, textAlign: 'center' as const, margin: '24px auto 8px', maxWidth: '240px' }
const link = { color: '#0a1628', fontWeight: 600 as const }
const hr = { borderColor: '#e5e7eb', margin: '24px 40px' }
const footer = { fontSize: '12px', color: '#9ca3af', textAlign: 'center' as const, margin: '0', padding: '0 40px 32px' }
