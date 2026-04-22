import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'PaigeAgent.ai'

interface Props {
  name?: string
}

const EliteWaitlistConfirmedEmail = ({ name }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You're on the Paige Elite waitlist</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={headerBar}>
          <Heading style={logoText}>{SITE_NAME}</Heading>
          <Text style={tagline}>Paige Elite</Text>
        </Section>

        <Section style={contentSection}>
          <Heading as="h2" style={h2}>
            {name ? `You're on the list, ${name}.` : `You're on the list.`}
          </Heading>
          <Text style={text}>
            Welcome to the Paige Elite waitlist. Elite is our white-glove tier for serious
            wealth builders who want done-with-you funding and entity strategy.
          </Text>

          <Heading as="h3" style={h3}>What Elite includes</Heading>
          <Text style={listItem}>• Assigned PME consultant — personal point of contact</Text>
          <Text style={listItem}>• Mogul Credit AI coordination across personal and business files</Text>
          <Text style={listItem}>• Monthly 1:1 strategy session</Text>
          <Text style={listItem}>• Priority funding application review</Text>

          <Section style={infoBox}>
            <Text style={infoLabel}>EXPECTED TIMELINE</Text>
            <Text style={infoText}>
              Our team reviews waitlist applications weekly. We'll reach out within 7–14
              days to discuss next steps and see if Elite is the right fit for your goals.
            </Text>
          </Section>

          <Heading as="h3" style={h3}>While you wait — start with Pro</Heading>
          <Text style={text}>
            Get full access to PaigeAgent today for $67/month. Use the platform now and
            seamlessly upgrade to Elite when your spot opens.
          </Text>

          <Button style={button} href="https://paigeagent.ai/pricing">
            Start With Pro — $67/mo
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
  component: EliteWaitlistConfirmedEmail,
  subject: 'You Are on the Paige Elite Waitlist — Here is What to Expect',
  displayName: 'Elite Waitlist Confirmed',
  previewData: { name: 'Jane' },
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
