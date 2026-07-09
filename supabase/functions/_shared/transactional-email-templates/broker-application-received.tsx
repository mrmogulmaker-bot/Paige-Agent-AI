import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Paige Agent AI'
const SUPPORT_EMAIL = 'support@paigeagent.ai'

interface BrokerApplicationReceivedProps {
  firstName?: string
  businessName?: string
  /** When true, renders the decline-notification variant. */
  declineNotice?: boolean
  /** Optional decline reason — only surfaced if provided. */
  declineReason?: string
}

const BrokerApplicationReceivedEmail = ({
  firstName,
  businessName,
  declineNotice,
  declineReason,
}: BrokerApplicationReceivedProps) => {
  if (declineNotice) {
    return (
      <Html lang="en" dir="ltr">
        <Head />
        <Preview>Update on your {SITE_NAME} Broker application</Preview>
        <Body style={main}>
          <Container style={container}>
            <Heading style={brand}>{SITE_NAME}</Heading>
            <Heading style={h1}>
              {firstName ? `Hi ${firstName},` : 'Update on your application'}
            </Heading>
            <Text style={text}>
              Thank you for applying to the {SITE_NAME} Broker Program
              {businessName ? ` on behalf of ${businessName}` : ''}. After
              reviewing your application, we are not able to approve your
              broker workspace at this time.
            </Text>

            {declineReason ? (
              <Section style={card}>
                <Text style={cardLabel}>Reviewer note</Text>
                <Text style={cardItem}>{declineReason}</Text>
              </Section>
            ) : null}

            <Text style={text}>
              This is not the end of the road. You're welcome to reapply in
              <strong> 90 days</strong>, especially after building more
              client volume, completing additional credentials, or expanding
              your services. If you believe this was a mistake or want
              to discuss your application, please reach out to our team.
            </Text>

            <Section style={ctaWrap}>
              <Button href={`mailto:${SUPPORT_EMAIL}`} style={ctaButton}>
                Contact Support
              </Button>
            </Section>

            <Text style={text}>
              You can still use {SITE_NAME} to run your own practice — clients,
              follow-ups, onboarding, and scheduling. Your account remains
              active.
            </Text>

            <Text style={footer}>— The {SITE_NAME} Partnerships Team</Text>
          </Container>
        </Body>
      </Html>
    )
  }

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Your {SITE_NAME} Broker application is in</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={brand}>{SITE_NAME}</Heading>
          <Heading style={h1}>
            {firstName ? `Welcome, ${firstName}.` : 'Your Broker application is in.'}
          </Heading>
          <Text style={text}>
            Thanks for applying to the {SITE_NAME} Broker Program
            {businessName ? ` on behalf of ${businessName}` : ''}. Your application
            is being processed automatically — most brokers are approved instantly
            and will receive a follow-up welcome email with their referral code,
            client invite link, and dashboard access within the next minute.
          </Text>

          <Section style={card}>
            <Text style={cardLabel}>What happens next</Text>
            <Text style={cardItem}>1. You'll receive an approval email with your unique broker code.</Text>
            <Text style={cardItem}>2. Activate your $197/mo Broker Workspace from the dashboard.</Text>
            <Text style={cardItem}>3. Start inviting clients — they onboard at your $17/mo broker rate.</Text>
          </Section>

          <Text style={text}>
            Questions? Reply to this email or contact{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} style={link}>{SUPPORT_EMAIL}</a>.
          </Text>

          <Text style={footer}>— The {SITE_NAME} Partnerships Team</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: BrokerApplicationReceivedEmail,
  subject: (data: Record<string, any> = {}) =>
    data.declineNotice
      ? 'Update on Your Paige Agent AI Broker Application'
      : 'Your Paige Agent AI Broker Application is Received',
  displayName: 'Broker — Application received / declined',
  previewData: { firstName: 'Jordan', businessName: 'Apex Consulting Group' },
} satisfies TemplateEntry

const main: React.CSSProperties = {
  backgroundColor: '#ffffff',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif',
}
const container: React.CSSProperties = { padding: '32px 24px', maxWidth: '560px' }
const brand: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 700,
  color: '#CFAE70',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  margin: '0 0 18px',
}
const h1: React.CSSProperties = {
  fontSize: '24px',
  fontWeight: 700,
  color: '#0B1B2B',
  margin: '0 0 18px',
  lineHeight: 1.25,
}
const text: React.CSSProperties = {
  fontSize: '15px',
  color: '#3a4654',
  lineHeight: 1.6,
  margin: '0 0 18px',
}
const card: React.CSSProperties = {
  background: '#F8F4EC',
  border: '1px solid #E7DDC9',
  borderRadius: '8px',
  padding: '18px 20px',
  margin: '8px 0 22px',
}
const cardLabel: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 700,
  color: '#8B6F2F',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  margin: '0 0 8px',
}
const cardItem: React.CSSProperties = {
  fontSize: '14px',
  color: '#0B1B2B',
  lineHeight: 1.5,
  margin: '4px 0',
}
const link: React.CSSProperties = { color: '#0B1B2B', textDecoration: 'underline' }
const ctaWrap: React.CSSProperties = {
  textAlign: 'center',
  margin: '8px 0 22px',
}
const ctaButton: React.CSSProperties = {
  background: '#CFAE70',
  color: '#0B1B2B',
  fontSize: '14px',
  fontWeight: 700,
  letterSpacing: '0.04em',
  textDecoration: 'none',
  padding: '12px 22px',
  borderRadius: '6px',
  display: 'inline-block',
}
const footer: React.CSSProperties = {
  fontSize: '12px',
  color: '#888888',
  margin: '28px 0 0',
}
