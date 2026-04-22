import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Preview, Text, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "PaigeAgent.ai"
const LOGO_URL = 'https://bfmyebsjyuoecmjskqhs.supabase.co/storage/v1/object/public/email-assets/paige-logo-transparent.png'

interface VerificationProps {
  code?: string
}

const VerificationEmail = ({ code = '000000' }: VerificationProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your PaigeAgent verification code</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} alt={SITE_NAME} width="160" height="auto" style={logo} />
        <Text style={subheading}>Verification Code</Text>
        <Hr style={hr} />
        <Heading as="h2" style={h2}>Your code</Heading>
        <Section style={codeBox}>
          <Text style={codeText}>{code}</Text>
        </Section>
        <Text style={text}>This code expires in 10 minutes. If you didn't request it, you can safely ignore this email.</Text>
        <Hr style={hr} />
        <Text style={footer}>© {new Date().getFullYear()} {SITE_NAME}.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: VerificationEmail,
  subject: 'Your PaigeAgent Verification Code',
  displayName: 'Verification Code',
  previewData: { code: '482917' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }
const container = { padding: '40px 25px', maxWidth: '600px', margin: '0 auto' }
const logo = { display: 'block' as const, margin: '0 auto 8px' }
const subheading = { fontSize: '14px', color: '#6b7280', textAlign: 'center' as const, margin: '0' }
const hr = { borderColor: '#e5e7eb', margin: '24px 0' }
const h2 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0a1628', margin: '0 0 16px', textAlign: 'center' as const }
const text = { fontSize: '14px', color: '#6b7280', lineHeight: '1.6', margin: '16px 0 0', textAlign: 'center' as const }
const codeBox = { backgroundColor: '#0a1628', padding: '24px', borderRadius: '8px', textAlign: 'center' as const, margin: '16px 0' }
const codeText = { fontSize: '40px', fontWeight: 'bold' as const, color: '#CFAE70', letterSpacing: '12px', margin: '0', fontFamily: "'Courier New', monospace" }
const footer = { fontSize: '12px', color: '#9ca3af', textAlign: 'center' as const, margin: '0' }
