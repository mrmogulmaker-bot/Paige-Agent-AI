import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Button, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "PaigeAgent.ai"

interface RoleInvitationProps {
  role?: string
  inviteUrl?: string
}

const RoleInvitationEmail = ({ role, inviteUrl }: RoleInvitationProps) => {
  const roleLabel = role || 'Team Member'
  const link = inviteUrl || '#'

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>You've been invited to join {SITE_NAME} as {roleLabel}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>{SITE_NAME}</Heading>
          <Text style={subheading}>Mogul Maker Academy</Text>
          <Hr style={hr} />
          <Heading as="h2" style={h2}>You've Been Invited!</Heading>
          <Text style={text}>
            You've been invited to join {SITE_NAME} with the role:
          </Text>
          <Text style={roleBadge}>{roleLabel.toUpperCase()}</Text>
          <Text style={text}>
            Click the button below to accept your invitation and create your account:
          </Text>
          <Button style={button} href={link}>
            Accept Invitation
          </Button>
          <Text style={smallText}>
            This invitation will expire in 7 days. If you didn't expect this invitation, you can safely ignore this email.
          </Text>
          <Hr style={hr} />
          <Text style={footer}>© {new Date().getFullYear()} {SITE_NAME}. All rights reserved.</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: RoleInvitationEmail,
  subject: (data: Record<string, any>) => `You're invited to join ${SITE_NAME} as ${data.role || 'Team Member'}`,
  displayName: 'Role Invitation',
  previewData: { role: 'Administrator', inviteUrl: 'https://paigeagent.ai/auth?invite=sample-token' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }
const container = { padding: '40px 25px', maxWidth: '600px', margin: '0 auto' }
const h1 = { fontSize: '28px', fontWeight: 'bold' as const, color: '#CFAE70', margin: '0', textAlign: 'center' as const }
const subheading = { fontSize: '14px', color: '#6b7280', textAlign: 'center' as const, margin: '4px 0 0' }
const h2 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0a1628', margin: '24px 0 12px' }
const text = { fontSize: '15px', color: '#374151', lineHeight: '1.6', margin: '0 0 16px' }
const roleBadge = { fontSize: '14px', fontWeight: '600' as const, color: '#0a1628', backgroundColor: '#f3f4f6', padding: '6px 16px', borderRadius: '4px', textAlign: 'center' as const, margin: '0 0 20px' }
const button = { backgroundColor: '#CFAE70', color: '#ffffff', padding: '12px 30px', borderRadius: '6px', fontSize: '16px', fontWeight: '600' as const, textDecoration: 'none', display: 'block' as const, textAlign: 'center' as const, margin: '24px auto' }
const smallText = { fontSize: '13px', color: '#9ca3af', lineHeight: '1.5', margin: '16px 0 0' }
const hr = { borderColor: '#e5e7eb', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#9ca3af', textAlign: 'center' as const, margin: '0' }
