/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Text,
  Hr,
} from 'npm:@react-email/components@0.0.22'

const SITE_NAME = 'Paige Agent AI'
const LOGO_URL = 'https://bfmyebsjyuoecmjskqhs.supabase.co/storage/v1/object/public/email-assets/paige-logo-transparent.png'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({
  siteName,
  confirmationUrl,
}: RecoveryEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Reset your password for {SITE_NAME}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} alt={SITE_NAME} width="180" height="auto" style={logo} />
        <Text style={subheading}>Mogul Maker Academy</Text>
        <Hr style={hr} />
        <Heading style={h1}>Reset Your Password</Heading>
        <Text style={text}>
          We received a request to reset your password for {SITE_NAME}. Click the button below to choose a new password.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Reset Password
        </Button>
        <Text style={smallText}>
          If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.
        </Text>
        <Hr style={hr} />
        <Text style={footer}>© {new Date().getFullYear()} {SITE_NAME}. All rights reserved.</Text>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail

const main = { backgroundColor: '#ffffff', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }
const container = { padding: '40px 25px', maxWidth: '600px', margin: '0 auto' }
const logo = { display: 'block' as const, margin: '0 auto 8px' }
const subheading = { fontSize: '14px', color: '#6b7280', textAlign: 'center' as const, margin: '0' }
const h1 = { fontSize: '24px', fontWeight: 'bold' as const, color: '#0a1628', margin: '24px 0 12px', textAlign: 'center' as const }
const text = { fontSize: '15px', color: '#374151', lineHeight: '1.6', margin: '0 0 16px' }
const smallText = { fontSize: '13px', color: '#9ca3af', lineHeight: '1.5', margin: '24px 0 0' }
const button = { backgroundColor: '#CFAE70', color: '#ffffff', padding: '12px 30px', borderRadius: '6px', fontSize: '16px', fontWeight: '600' as const, textDecoration: 'none', display: 'block' as const, textAlign: 'center' as const, margin: '24px auto' }
const hr = { borderColor: '#e5e7eb', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#9ca3af', textAlign: 'center' as const, margin: '0' }
