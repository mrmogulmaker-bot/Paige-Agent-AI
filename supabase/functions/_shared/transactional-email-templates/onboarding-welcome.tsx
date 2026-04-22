import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Preview, Text, Button, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "PaigeAgent.ai"
const LOGO_URL = 'https://bfmyebsjyuoecmjskqhs.supabase.co/storage/v1/object/public/email-assets/paige-logo-transparent.png'

interface OnboardingWelcomeProps {
  name?: string
}

const OnboardingWelcomeEmail = ({ name }: OnboardingWelcomeProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Welcome to {SITE_NAME} — your AI funding advisor is ready</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} alt={SITE_NAME} width="160" height="auto" style={logo} />
        <Text style={subheading}>Project Mogul Enterprise</Text>
        <Hr style={hr} />
        <Heading as="h2" style={h2}>{name ? `Welcome to PaigeAgent, ${name}` : 'Welcome to PaigeAgent'}</Heading>
        <Text style={text}>
          I'm Antonio Cook, founder of Project Mogul Enterprise. Glad to have you on the inside.
        </Text>
        <Text style={text}>
          You now have Paige — your dedicated AI funding advisor — working for you 24/7. She analyzes your credit, surfaces lender matches, flags risks before they cost you, and walks you through every move.
        </Text>
        <Heading as="h3" style={h3}>Get started in three steps</Heading>
        <Section style={stepBox}>
          <Text style={stepNumber}>1</Text>
          <Text style={stepText}>Upload your most recent credit report so Paige can read your file.</Text>
        </Section>
        <Section style={stepBox}>
          <Text style={stepNumber}>2</Text>
          <Text style={stepText}>Set your funding goal — Paige uses it to filter every recommendation.</Text>
        </Section>
        <Section style={stepBox}>
          <Text style={stepNumber}>3</Text>
          <Text style={stepText}>Ask Paige anything — credit, funding, lender selection, structure.</Text>
        </Section>
        <Button style={button} href="https://paigeagent.ai/app">
          Start With Paige Now
        </Button>
        <Hr style={hr} />
        <Text style={footer}>© {new Date().getFullYear()} {SITE_NAME}. You received this because you signed up for an account.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: OnboardingWelcomeEmail,
  subject: 'Welcome to PaigeAgent — Your Advisor is Ready',
  displayName: 'Onboarding Welcome',
  previewData: { name: 'Antonio' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }
const container = { padding: '40px 25px', maxWidth: '600px', margin: '0 auto' }
const logo = { display: 'block' as const, margin: '0 auto 8px' }
const subheading = { fontSize: '14px', color: '#6b7280', textAlign: 'center' as const, margin: '0' }
const hr = { borderColor: '#e5e7eb', margin: '24px 0' }
const h2 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0a1628', margin: '0 0 16px' }
const h3 = { fontSize: '16px', fontWeight: '600' as const, color: '#0a1628', margin: '24px 0 12px' }
const text = { fontSize: '15px', color: '#374151', lineHeight: '1.6', margin: '0 0 16px' }
const stepBox = { display: 'flex' as const, alignItems: 'center' as const, padding: '12px 16px', backgroundColor: '#f9fafb', borderRadius: '6px', borderLeft: '4px solid #CFAE70', margin: '0 0 8px' }
const stepNumber = { fontSize: '20px', fontWeight: 'bold' as const, color: '#CFAE70', margin: '0 16px 0 0', display: 'inline-block' as const, minWidth: '24px' }
const stepText = { fontSize: '14px', color: '#374151', lineHeight: '1.5', margin: '0', display: 'inline-block' as const }
const button = { backgroundColor: '#CFAE70', color: '#ffffff', padding: '12px 30px', borderRadius: '6px', fontSize: '16px', fontWeight: '600' as const, textDecoration: 'none', display: 'block' as const, textAlign: 'center' as const, margin: '24px auto' }
const footer = { fontSize: '12px', color: '#9ca3af', textAlign: 'center' as const, margin: '0' }
