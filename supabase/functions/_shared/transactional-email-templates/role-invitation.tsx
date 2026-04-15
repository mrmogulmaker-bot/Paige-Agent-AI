import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Button, Hr, Section, Img,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "PaigeAgent.ai"

interface RoleInvitationProps {
  role?: string
  inviteUrl?: string
  invitedBy?: string
}

const RoleInvitationEmail = ({ role, inviteUrl, invitedBy }: RoleInvitationProps) => {
  const roleLabel = role || 'Team Member'
  const link = inviteUrl || '#'

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>You've been invited to join {SITE_NAME} as {roleLabel}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header bar */}
          <Section style={headerBar}>
            <Heading style={logoText}>{SITE_NAME}</Heading>
            <Text style={tagline}>Mogul Maker Academy</Text>
          </Section>

          {/* Main content */}
          <Section style={contentSection}>
            <Heading as="h2" style={h2}>You've Been Invited</Heading>
            <Text style={text}>
              {invitedBy
                ? `${invitedBy} has invited you to join the ${SITE_NAME} platform.`
                : `You've been invited to join the ${SITE_NAME} platform.`}
            </Text>

            {/* Role badge */}
            <Section style={roleBadgeWrapper}>
              <Text style={roleBadgeLabel}>YOUR ROLE</Text>
              <Text style={roleBadge}>{roleLabel}</Text>
            </Section>

            <Text style={text}>
              Your account has been created and is ready. Click the button below to set your password and get started:
            </Text>

            <Button style={button} href={link}>
              Accept Invitation & Set Password
            </Button>

            <Text style={helperText}>
              This invitation will expire in 7 days. If you didn't expect this, you can safely ignore this email.
            </Text>
          </Section>

          {/* What to expect */}
          <Section style={featureSection}>
            <Text style={featureTitle}>What you'll get access to:</Text>
            <Text style={featureItem}>📊  AI-powered credit analysis & monitoring</Text>
            <Text style={featureItem}>🎯  Personalized credit improvement roadmaps</Text>
            <Text style={featureItem}>💰  Funding readiness tools & lender matching</Text>
            <Text style={featureItem}>💬  24/7 guidance from Paige, your AI credit coach</Text>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>© {new Date().getFullYear()} {SITE_NAME} · Mogul Maker Academy. All rights reserved.</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: RoleInvitationEmail,
  subject: (data: Record<string, any>) => `You're invited to join ${SITE_NAME} as ${data.role || 'Team Member'}`,
  displayName: 'Role Invitation',
  previewData: { role: 'Administrator', inviteUrl: 'https://paigeagent.ai/auth?invite=sample-token', invitedBy: 'Antonio' },
} satisfies TemplateEntry

// Styles — premium PME branding
const main = { backgroundColor: '#ffffff', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }
const container = { maxWidth: '600px', margin: '0 auto' }
const headerBar = { backgroundColor: '#0a1628', padding: '32px 40px 28px', borderRadius: '8px 8px 0 0', textAlign: 'center' as const }
const logoText = { fontSize: '26px', fontWeight: 'bold' as const, color: '#CFAE70', margin: '0', letterSpacing: '0.5px' }
const tagline = { fontSize: '12px', color: '#9ca3af', margin: '6px 0 0', textTransform: 'uppercase' as const, letterSpacing: '2px' }
const contentSection = { padding: '36px 40px 24px' }
const h2 = { fontSize: '24px', fontWeight: 'bold' as const, color: '#0a1628', margin: '0 0 16px' }
const text = { fontSize: '15px', color: '#374151', lineHeight: '1.7', margin: '0 0 20px' }
const roleBadgeWrapper = { textAlign: 'center' as const, margin: '24px 0' }
const roleBadgeLabel = { fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '2px', margin: '0 0 8px', fontWeight: '600' as const }
const roleBadge = { fontSize: '18px', fontWeight: '700' as const, color: '#0a1628', backgroundColor: '#CFAE70', padding: '10px 28px', borderRadius: '6px', display: 'inline-block' as const, margin: '0' }
const button = { backgroundColor: '#CFAE70', color: '#0a1628', padding: '14px 36px', borderRadius: '6px', fontSize: '16px', fontWeight: '700' as const, textDecoration: 'none', display: 'block' as const, textAlign: 'center' as const, margin: '28px auto 16px' }
const helperText = { fontSize: '13px', color: '#9ca3af', lineHeight: '1.5', margin: '0', textAlign: 'center' as const }
const featureSection = { backgroundColor: '#f9fafb', padding: '24px 40px', margin: '8px 0 0', borderRadius: '0 0 8px 8px' }
const featureTitle = { fontSize: '14px', fontWeight: '600' as const, color: '#0a1628', margin: '0 0 14px' }
const featureItem = { fontSize: '14px', color: '#4b5563', lineHeight: '1.6', margin: '0 0 8px' }
const hr = { borderColor: '#e5e7eb', margin: '24px 40px' }
const footer = { fontSize: '12px', color: '#9ca3af', textAlign: 'center' as const, margin: '0', padding: '0 40px 32px' }
