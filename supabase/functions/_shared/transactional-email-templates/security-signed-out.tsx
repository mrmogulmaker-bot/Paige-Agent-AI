import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Preview, Text, Button, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'PaigeAgent.ai'
const LOGO_URL = 'https://bfmyebsjyuoecmjskqhs.supabase.co/storage/v1/object/public/email-assets/paige-logo-transparent.png'

interface Props {
  recipientName?: string
  actor_email?: string
  signed_out_at?: string
  reviewUrl?: string
}

const SecuritySignedOutEmail = ({
  recipientName,
  actor_email = 'an administrator',
  signed_out_at,
  reviewUrl = 'https://paigeagent.ai/auth',
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You were signed out of PaigeAgent.ai</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} alt={SITE_NAME} width="160" height="auto" style={logo} />
        <Text style={subheading}>Security · Session ended</Text>
        <Hr style={hr} />
        <Heading as="h2" style={h2}>
          {recipientName ? `${recipientName}, ` : ''}your active sessions were ended.
        </Heading>
        <Text style={body}>
          {actor_email} signed you out of every device. You'll need to sign in
          again to keep using PaigeAgent.ai. If you didn't expect this, contact
          support right away.
        </Text>

        <Section style={detailBox}>
          <Text style={detailLabel}>When</Text>
          <Text style={detailValue}>{signed_out_at ?? new Date().toISOString()}</Text>
          <Hr style={innerHr} />
          <Text style={detailLabel}>Signed out by</Text>
          <Text style={detailValue}>{actor_email}</Text>
        </Section>

        <Button style={button} href={reviewUrl}>
          Sign back in
        </Button>

        <Hr style={hr} />
        <Text style={footer}>
          © {new Date().getFullYear()} {SITE_NAME}. Need help? Reply to this email or call +1 470-594-4470.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: SecuritySignedOutEmail,
  subject: 'You were signed out of PaigeAgent.ai',
  displayName: 'Security · Signed Out',
  previewData: {
    recipientName: 'Antonio',
    actor_email: 'support@paigeagent.ai',
    signed_out_at: new Date().toISOString(),
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }
const container = { padding: '40px 25px', maxWidth: '600px', margin: '0 auto' }
const logo = { display: 'block' as const, margin: '0 auto 8px' }
const subheading = { fontSize: '14px', color: '#EBB94C', textAlign: 'center' as const, margin: '0', fontWeight: '600' as const }
const hr = { borderColor: '#e5e7eb', margin: '24px 0' }
const innerHr = { borderColor: '#e5e7eb', margin: '12px 0' }
const h2 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0a1628', margin: '0 0 16px' }
const body = { fontSize: '15px', color: '#0a1628', lineHeight: '1.6', margin: '0 0 16px' }
const detailBox = { backgroundColor: '#fafafa', padding: '20px', borderRadius: '8px', border: '1px solid #e5e7eb', margin: '16px 0 24px' }
const detailLabel = { fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.5px', margin: '0 0 4px' }
const detailValue = { fontSize: '15px', color: '#0a1628', fontWeight: '600' as const, margin: '0' }
const button = { backgroundColor: '#000000', color: '#ffffff', padding: '12px 30px', borderRadius: '6px', fontSize: '16px', fontWeight: '600' as const, textDecoration: 'none', display: 'block' as const, textAlign: 'center' as const, margin: '24px auto' }
const footer = { fontSize: '12px', color: '#9ca3af', textAlign: 'center' as const, margin: '0' }
