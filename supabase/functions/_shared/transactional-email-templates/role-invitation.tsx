import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Button, Hr, Section, Img,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "Paige Agent AI"

interface RoleInvitationProps {
  role?: string
  inviteUrl?: string
  invitedBy?: string
  message?: string | null
}

// Role-specific welcome copy + capability bullets.
// Keeps the SAME visual template but adapts the words to what the recipient
// actually gets to do once they sign in.
const ROLE_COPY: Record<string, { headline: string; intro: string; features: string[] }> = {
  Administrator: {
    headline: "You're now an Administrator",
    intro: "Full workspace access — manage your team, configure Paige, and oversee every client relationship in the practice.",
    features: [
      "👥  Invite & manage the full team",
      "⚙️  Workspace settings & integrations",
      "📊  Cross-client analytics & retainer reporting",
      "🔐  Audit log + security controls",
    ],
  },
  Coach: {
    headline: "Welcome to your workspace",
    intro: "You'll be assigned clients to guide from onboarding through every session and outcome, with Paige surfacing what each one needs before you ask.",
    features: [
      "🎯  Your assigned client roster & journey stages",
      "💬  Real-time messaging with each client",
      "📈  At-risk signals, milestones & next-best-action prompts",
      "🤖  Paige as your co-pilot in every session",
    ],
  },
  "Enrollment Rep": {
    headline: "Your pipeline is ready",
    intro: "Hit the ground running — work your pipeline, follow up on warm leads, and enroll qualified prospects into the right program.",
    features: [
      "📋  Kanban pipeline with custom stages",
      "🔔  Follow-up alerts when leads go cold",
      "📞  Conversation history per contact",
      "💰  Enrollment tracking & goal attainment",
    ],
  },
  Assistant: {
    headline: "Your assistant workspace is live",
    intro: "Support your coach end to end — keep clients moving, handle follow-ups, and let Paige draft the next move for your approval.",
    features: [
      "🗂️  Shared client roster & task queue",
      "✍️  Paige-drafted follow-ups ready to send",
      "📅  Scheduling & session coordination",
      "🔔  At-risk flags routed straight to you",
    ],
  },
  "Client Success": {
    headline: "Welcome to Client Success",
    intro: "Keep clients winning. You'll get the queues, the signals, and the playbooks to drive retention and outcomes.",
    features: [
      "❤️  At-risk dashboard across your book",
      "📨  Auto-escalations + check-in cadences",
      "🎓  Outcome milestone tracking",
      "📞  Direct messaging & note history",
    ],
  },
  Billing: {
    headline: "Welcome to the Billing workspace",
    intro: "Retainers, invoices, payments, and reconciliation — all in one place, scoped to what you need to see.",
    features: [
      "💳  Invoice & payment reconciliation",
      "🔁  Retainer & subscription ledger",
      "📊  Revenue dashboards by program",
      "🧾  Refund & adjustment workflows",
    ],
  },
  "Affiliate Partner": {
    headline: "Welcome aboard, partner",
    intro: "Track your referrals, watch commissions accrue in real time, and grab everything you need to promote.",
    features: [
      "🔗  Personal referral links & QR codes",
      "💰  Real-time commission tracking",
      "📈  Conversion analytics",
      "🎨  Marketing assets & swipe copy",
    ],
  },
  Moderator: {
    headline: "Welcome, Moderator",
    intro: "Keep the community healthy and the workspace running smoothly.",
    features: [
      "💬  Conversation moderation tools",
      "🚩  Flagged-content review queue",
      "👥  Member status & history visibility",
      "🛡️  Escalation routing to admins",
    ],
  },
  Viewer: {
    headline: "Read-only access granted",
    intro: "You can review dashboards, reports, and client journeys without making changes.",
    features: [
      "📊  Cross-practice reporting dashboards",
      "👀  Client journey & milestone visibility",
      "📈  Retention & outcome metrics",
      "🔍  Search across the workspace",
    ],
  },
  Client: {
    headline: "Welcome to your private portal",
    intro: "Everything you need to work with your coach — sessions, next steps, and answers the moment you need them — in one place.",
    features: [
      "📊  Your personalized roadmap & progress",
      "🎯  Next steps tailored to your goals",
      "📅  Scheduling & session history",
      "💬  24/7 guidance from Paige",
    ],
  },
}

const DEFAULT_COPY = ROLE_COPY.Client

const RoleInvitationEmail = ({ role, inviteUrl, invitedBy, message }: RoleInvitationProps) => {
  const roleLabel = role || 'Team Member'
  const link = inviteUrl || '#'
  const copy = ROLE_COPY[roleLabel] ?? DEFAULT_COPY

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{copy.headline} — activate your {SITE_NAME} account</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header bar */}
          <Section style={headerBar}>
            <Heading style={logoText}>{SITE_NAME}</Heading>
            <Text style={tagline}>Intelligent Client Portal</Text>
          </Section>

          {/* Main content */}
          <Section style={contentSection}>
            <Heading as="h2" style={h2}>{copy.headline}</Heading>
            <Text style={text}>
              {invitedBy
                ? `${invitedBy} has invited you to join the ${SITE_NAME} workspace.`
                : `You've been invited to join the ${SITE_NAME} workspace.`}
            </Text>

            {/* Role badge */}
            <Section style={roleBadgeWrapper}>
              <Text style={roleBadgeLabel}>YOUR ROLE</Text>
              <Text style={roleBadge}>{roleLabel}</Text>
            </Section>

            <Text style={text}>{copy.intro}</Text>

            {message ? (
              <Section style={messageBlock}>
                <Text style={messageLabel}>A NOTE FROM {invitedBy ? invitedBy.toUpperCase() : 'YOUR ADMIN'}</Text>
                <Text style={messageText}>"{message}"</Text>
              </Section>
            ) : null}

            <Button style={button} href={link}>
              Activate Account & Set Password
            </Button>

            <Text style={helperText}>
              This invitation expires in 7 days. If you didn't expect this, you can safely ignore this email.
            </Text>
          </Section>

          {/* What to expect — role-specific */}
          <Section style={featureSection}>
            <Text style={featureTitle}>What you'll get access to:</Text>
            {copy.features.map((f, i) => (
              <Text key={i} style={featureItem}>{f}</Text>
            ))}
          </Section>

          <Hr style={hr} />
          <Text style={footer}>© {new Date().getFullYear()} {SITE_NAME}. All rights reserved.</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: RoleInvitationEmail,
  subject: (data: Record<string, any>) => {
    const role = data.role || 'Team Member'
    const copy = ROLE_COPY[role] ?? DEFAULT_COPY
    return `${copy.headline} · ${SITE_NAME}`
  },
  displayName: 'Role Invitation',
  previewData: { role: 'Coach', inviteUrl: 'https://app.paigeagent.ai/accept-invite?token=sample', invitedBy: 'Antonio', message: 'Welcome aboard — excited to have you on the team.' },
} satisfies TemplateEntry

// Styles — premium Paige branding (gold + indigo)
const main = { backgroundColor: '#ffffff', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }
const container = { maxWidth: '600px', margin: '0 auto' }
const headerBar = { backgroundColor: '#0a1628', padding: '32px 40px 28px', borderRadius: '8px 8px 0 0', textAlign: 'center' as const }
const logoText = { fontSize: '26px', fontWeight: 'bold' as const, color: '#EBB94C', margin: '0', letterSpacing: '0.5px' }
const tagline = { fontSize: '12px', color: '#9ca3af', margin: '6px 0 0', textTransform: 'uppercase' as const, letterSpacing: '2px' }
const contentSection = { padding: '36px 40px 24px' }
const h2 = { fontSize: '24px', fontWeight: 'bold' as const, color: '#0a1628', margin: '0 0 16px' }
const text = { fontSize: '15px', color: '#374151', lineHeight: '1.7', margin: '0 0 20px' }
const roleBadgeWrapper = { textAlign: 'center' as const, margin: '24px 0' }
const roleBadgeLabel = { fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '2px', margin: '0 0 8px', fontWeight: '600' as const }
const roleBadge = { fontSize: '18px', fontWeight: '700' as const, color: '#0a1628', backgroundColor: '#EBB94C', padding: '10px 28px', borderRadius: '6px', display: 'inline-block' as const, margin: '0' }
const button = { backgroundColor: '#EBB94C', color: '#0a1628', padding: '14px 36px', borderRadius: '6px', fontSize: '16px', fontWeight: '700' as const, textDecoration: 'none', display: 'block' as const, textAlign: 'center' as const, margin: '28px auto 16px' }
const helperText = { fontSize: '13px', color: '#9ca3af', lineHeight: '1.5', margin: '0', textAlign: 'center' as const }
const featureSection = { backgroundColor: '#f9fafb', padding: '24px 40px', margin: '8px 0 0', borderRadius: '0 0 8px 8px' }
const featureTitle = { fontSize: '14px', fontWeight: '600' as const, color: '#0a1628', margin: '0 0 14px' }
const featureItem = { fontSize: '14px', color: '#4b5563', lineHeight: '1.6', margin: '0 0 8px' }
const hr = { borderColor: '#e5e7eb', margin: '24px 40px' }
const footer = { fontSize: '12px', color: '#9ca3af', textAlign: 'center' as const, margin: '0', padding: '0 40px 32px' }
const messageBlock = { backgroundColor: '#fef9ef', borderLeft: '3px solid #EBB94C', padding: '14px 18px', margin: '0 0 24px', borderRadius: '4px' }
const messageLabel = { fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '1.5px', margin: '0 0 6px', fontWeight: '600' as const }
const messageText = { fontSize: '14px', color: '#374151', lineHeight: '1.6', margin: '0', fontStyle: 'italic' as const }
