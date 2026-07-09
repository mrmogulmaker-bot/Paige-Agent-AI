import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Preview, Text, Button, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "Paige Agent AI"
const LOGO_URL = 'https://bfmyebsjyuoecmjskqhs.supabase.co/storage/v1/object/public/email-assets/paige-logo-transparent.png'

interface OnboardingWelcomeProps {
  name?: string
}

const OnboardingWelcomeEmail = ({ name }: OnboardingWelcomeProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Welcome to {SITE_NAME} — your AI teammate is ready</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} alt={SITE_NAME} width="160" height="auto" style={logo} />
        <Text style={subheading}>Intelligent Client Portal</Text>
        <Hr style={hr} />
        <Heading as="h2" style={h2}>{name ? `Welcome to Paige Agent AI, ${name}` : 'Welcome to Paige Agent AI'}</Heading>
        <Text style={text}>
          Welcome to Paige Agent AI — glad to have you on the inside.
        </Text>
        <Text style={text}>
          You now have Paige — your dedicated AI teammate — working for you 24/7. She onboards your clients, drafts every follow-up, flags who's at risk before they slip, and preps your daily brief so you walk in already knowing what matters.
        </Text>
        <Heading as="h3" style={h3}>Get started in three steps</Heading>
        <Section style={stepBox}>
          <Text style={stepNumber}>1</Text>
          <Text style={stepText}>Add your first clients so Paige can start onboarding them for you.</Text>
        </Section>
        <Section style={stepBox}>
          <Text style={stepNumber}>2</Text>
          <Text style={stepText}>Set your playbook — Paige uses it to personalize every follow-up and next step.</Text>
        </Section>
        <Section style={stepBox}>
          <Text style={stepNumber}>3</Text>
          <Text style={stepText}>Ask Paige anything — your pipeline, follow-ups, scheduling, at-risk clients.</Text>
        </Section>
        <Button style={button} href="https://app.paigeagent.ai">
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
  subject: 'Welcome to Paige Agent AI — Your Teammate is Ready',
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
const stepBox = { display: 'flex' as const, alignItems: 'center' as const, padding: '12px 16px', backgroundColor: '#f9fafb', borderRadius: '6px', borderLeft: '4px solid #EBB94C', margin: '0 0 8px' }
const stepNumber = { fontSize: '20px', fontWeight: 'bold' as const, color: '#EBB94C', margin: '0 16px 0 0', display: 'inline-block' as const, minWidth: '24px' }
const stepText = { fontSize: '14px', color: '#374151', lineHeight: '1.5', margin: '0', display: 'inline-block' as const }
const button = { backgroundColor: '#EBB94C', color: '#0a1628', padding: '12px 30px', borderRadius: '6px', fontSize: '16px', fontWeight: '600' as const, textDecoration: 'none', display: 'block' as const, textAlign: 'center' as const, margin: '24px auto' }
const footer = { fontSize: '12px', color: '#9ca3af', textAlign: 'center' as const, margin: '0' }
