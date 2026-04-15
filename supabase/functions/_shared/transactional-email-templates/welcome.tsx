import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Button, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "PaigeAgent.ai"

interface WelcomeProps {
  name?: string
}

const WelcomeEmail = ({ name }: WelcomeProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Welcome to {SITE_NAME} — let's build your credit empire</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{SITE_NAME}</Heading>
        <Text style={subheading}>Mogul Maker Academy</Text>
        <Hr style={hr} />
        <Heading as="h2" style={h2}>
          {name ? `Welcome aboard, ${name}!` : 'Welcome aboard!'}
        </Heading>
        <Text style={text}>
          You've taken the first step toward building fundable credit. Paige, your AI credit coach, is ready to guide you through every stage — from personal credit optimization to business funding readiness.
        </Text>
        <Text style={text}>
          Here's what you can do right now:
        </Text>
        <Text style={listItem}>📊 Upload your credit report for instant analysis</Text>
        <Text style={listItem}>🎯 Get your personalized credit improvement plan</Text>
        <Text style={listItem}>💬 Chat with Paige for expert guidance 24/7</Text>
        <Button style={button} href="https://paigeagent.ai/app">
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
  subject: `Welcome to ${SITE_NAME} — let's build your credit empire`,
  displayName: 'Welcome Email',
  previewData: { name: 'Antonio' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }
const container = { padding: '40px 25px', maxWidth: '600px', margin: '0 auto' }
const h1 = { fontSize: '28px', fontWeight: 'bold' as const, color: '#CFAE70', margin: '0', textAlign: 'center' as const }
const subheading = { fontSize: '14px', color: '#6b7280', textAlign: 'center' as const, margin: '4px 0 0' }
const h2 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0a1628', margin: '24px 0 12px' }
const text = { fontSize: '15px', color: '#374151', lineHeight: '1.6', margin: '0 0 16px' }
const listItem = { fontSize: '15px', color: '#374151', lineHeight: '1.6', margin: '0 0 8px', paddingLeft: '4px' }
const button = { backgroundColor: '#CFAE70', color: '#ffffff', padding: '12px 30px', borderRadius: '6px', fontSize: '16px', fontWeight: '600' as const, textDecoration: 'none', display: 'block' as const, textAlign: 'center' as const, margin: '24px auto' }
const hr = { borderColor: '#e5e7eb', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#9ca3af', textAlign: 'center' as const, margin: '0' }
