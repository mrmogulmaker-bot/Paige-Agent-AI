import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Preview, Text, Button, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "Paige Agent AI"
const LOGO_URL = 'https://bfmyebsjyuoecmjskqhs.supabase.co/storage/v1/object/public/email-assets/paige-logo-transparent.png'

interface WelcomeProps {
  name?: string
}

const WelcomeEmail = ({ name }: WelcomeProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Welcome to {SITE_NAME} — let's give you back your time</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} alt={SITE_NAME} width="180" height="auto" style={logo} />
        <Text style={subheading}>Intelligent Client Portal</Text>
        <Hr style={hr} />
        <Heading as="h2" style={h2}>
          {name ? `Welcome aboard, ${name}!` : 'Welcome aboard!'}
        </Heading>
        <Text style={text}>
          You've taken the first step toward running your practice on autopilot. Paige, your AI teammate, is ready to handle the busywork — onboarding clients, chasing follow-ups, flagging who's at risk, and prepping your daily brief.
        </Text>
        <Text style={text}>
          Here's what you can do right now:
        </Text>
        <Text style={listItem}>📊 Add your first clients and watch Paige onboard them</Text>
        <Text style={listItem}>🎯 Set your playbook so every follow-up sounds like you</Text>
        <Text style={listItem}>💬 Ask Paige anything about your pipeline 24/7</Text>
        <Button style={button} href="https://app.paigeagent.ai">
          Get Started
        </Button>
        <Hr style={hr} />
        <Text style={footer}>© {new Date().getFullYear()} {SITE_NAME}. All rights reserved.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: WelcomeEmail,
  subject: `Welcome to ${SITE_NAME} — let's give you back your time`,
  displayName: 'Welcome Email',
  previewData: { name: 'Antonio' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }
const container = { padding: '40px 25px', maxWidth: '600px', margin: '0 auto' }
const logo = { display: 'block' as const, margin: '0 auto 8px' }
const subheading = { fontSize: '14px', color: '#6b7280', textAlign: 'center' as const, margin: '0' }
const h2 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0a1628', margin: '24px 0 12px' }
const text = { fontSize: '15px', color: '#374151', lineHeight: '1.6', margin: '0 0 16px' }
const listItem = { fontSize: '15px', color: '#374151', lineHeight: '1.6', margin: '0 0 8px', paddingLeft: '4px' }
const button = { backgroundColor: '#EBB94C', color: '#0a1628', padding: '12px 30px', borderRadius: '6px', fontSize: '16px', fontWeight: '600' as const, textDecoration: 'none', display: 'block' as const, textAlign: 'center' as const, margin: '24px auto' }
const hr = { borderColor: '#e5e7eb', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#9ca3af', textAlign: 'center' as const, margin: '0' }
