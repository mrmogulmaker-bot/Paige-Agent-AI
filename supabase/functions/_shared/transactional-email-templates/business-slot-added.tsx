import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'PaigeAgent.ai'

interface Props {
  effectiveLimit?: number
}

const BusinessSlotAddedEmail = ({ effectiveLimit }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Business slot added — you can now add another entity to your portfolio</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={headerBar}>
          <Heading style={logoText}>{SITE_NAME}</Heading>
          <Text style={tagline}>Multi-Business Portfolio</Text>
        </Section>

        <Section style={contentSection}>
          <Heading as="h2" style={h2}>
            Your business slot is live.
          </Heading>
          <Text style={text}>
            Thanks for expanding your portfolio. Your additional business slot is active and you can add another entity to PaigeAgent right now.
          </Text>

          {effectiveLimit ? (
            <Section style={infoBox}>
              <Text style={infoLabel}>NEW LIMIT</Text>
              <Text style={infoText}>
                You can now manage up to <strong>{effectiveLimit}</strong> businesses on your account — each with its own fundability scores, business credit reports, and Paige strategy context.
              </Text>
            </Section>
          ) : null}

          <Heading as="h3" style={h3}>What's next</Heading>
          <Text style={listItem}>• Add the new entity in your Business Profile</Text>
          <Text style={listItem}>• Upload its D&amp;B, Experian Business, or Equifax SBFE report</Text>
          <Text style={listItem}>• Ask Paige for portfolio-level capital strategy across all your entities</Text>

          <Button style={button} href="https://paigeagent.ai/app/business-profile">
            Add Your Next Business
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

export const template = {
  component: BusinessSlotAddedEmail,
  subject: 'Business Slot Added — You can now add another business to PaigeAgent',
  displayName: 'Business Slot Added',
  previewData: { effectiveLimit: 4 },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }
const container = { maxWidth: '600px', margin: '0 auto' }
const headerBar = { backgroundColor: '#0a1628', padding: '32px 40px 28px', borderRadius: '8px 8px 0 0', textAlign: 'center' as const }
const logoText = { fontSize: '26px', fontWeight: 'bold' as const, color: '#CFAE70', margin: '0', letterSpacing: '0.5px' }
const tagline = { fontSize: '12px', color: '#9ca3af', margin: '6px 0 0', textTransform: 'uppercase' as const, letterSpacing: '2px' }
const contentSection = { padding: '36px 40px 24px' }
const h2 = { fontSize: '24px', fontWeight: 'bold' as const, color: '#0a1628', margin: '0 0 16px' }
const h3 = { fontSize: '16px', fontWeight: '700' as const, color: '#0a1628', margin: '20px 0 10px' }
const text = { fontSize: '15px', color: '#374151', lineHeight: '1.7', margin: '0 0 14px' }
const listItem = { fontSize: '14px', color: '#374151', lineHeight: '1.8', margin: '0 0 4px' }
const infoBox = { margin: '18px 0 8px', padding: '18px 20px', backgroundColor: '#f9fafb', borderLeft: '3px solid #CFAE70', borderRadius: '4px' }
const infoLabel = { fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '2px', margin: '0 0 8px', fontWeight: '600' as const }
const infoText = { fontSize: '14px', color: '#374151', lineHeight: '1.6', margin: '0' }
const button = { backgroundColor: '#CFAE70', color: '#0a1628', padding: '14px 36px', borderRadius: '6px', fontSize: '15px', fontWeight: '700' as const, textDecoration: 'none', display: 'block' as const, textAlign: 'center' as const, margin: '20px auto 8px', maxWidth: '260px' }
const hr = { borderColor: '#e5e7eb', margin: '24px 40px' }
const footer = { fontSize: '12px', color: '#9ca3af', textAlign: 'center' as const, margin: '0', padding: '0 40px 32px' }
