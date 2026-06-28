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
  message?: string | null
}

// Role-specific welcome copy + capability bullets.
// Keeps the SAME visual template but adapts the words to what the recipient
// actually gets to do once they sign in.
const ROLE_COPY: Record<string, { headline: string; intro: string; features: string[] }> = {
  Administrator: {
    headline: "You're now an Administrator",
    intro: "Full platform access — manage members, configure integrations, and oversee every client journey.",
    features: [
      "👥  Invite & manage the full team",
      "⚙️  Platform settings & integrations",
      "📊  Cross-client analytics & revenue reporting",
      "🔐  Audit log + security controls",
    ],
  },
  Coach: {
    headline: "Welcome to your coaching workspace",
    intro: "You'll be assigned clients to guide through the BUILD-to-FUND journey, with full visibility into their credit, business, and funding readiness.",
    features: [
      "🎯  Your assigned client roster & journey stages",
      "💬  Real-time messaging with each client",
      "📈  Health scores, milestones & next-best-action prompts",
      "🤖  Paige AI as your co-pilot in every session",
    ],
  },
  "Sales Rep": {
    headline: "Your pipeline is ready",
    intro: "Hit the ground running — manage your deals, follow up on warm leads, and route qualified buyers into the right offer.",
    features: [
      "📋  Kanban pipeline with custom stages",
      "🔔  SLA alerts when leads go cold",
      "📞  Conversation history per contact",
      "💰  Revenue attribution & quota tracking",
    ],
  },
  Broker: {
    headline: "Your broker workspace is live",
    intro: "Bring your clients into Paige, manage their funding strategy, and earn commission on every closed deal.",
    features: [
      "🏦  Client funding application tracking",
      "💵  Real-time commission ledger",
      "👥  Sub-team management (if applicable)",
      "🤝  Direct access to lender intelligence",
    ],
  },
  "Customer Success": {
    headline: "Welcome to Customer Success",
    intro: "Keep clients winning. You'll get the queues, the signals, and the playbooks to drive retention and outcomes.",
    features: [
      "❤️  Health-score dashboard across your book",
      "📨  Auto-escalations + check-in cadences",
      "🎓  Outcome milestone tracking",
      "📞  Direct messaging & note history",
    ],
  },
  Finance: {
    headline: "Welcome to the Finance workspace",
    intro: "Revenue, refunds, payouts, and reconciliation — all in one place, scoped to what you need to see.",
    features: [
      "💳  Stripe + invoice reconciliation",
      "💸  Commission & payout ledger",
      "📊  Revenue dashboards by offer",
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
    intro: "Keep the community healthy and the platform running smoothly.",
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
      "📊  Cross-platform reporting dashboards",
      "👀  Client journey & milestone visibility",
      "📈  Revenue & outcome metrics",
      "🔍  Search across the platform",
    ],
  },
  Client: {
    headline: "Welcome to your private workspace",
    intro: "Everything you need to build credit, structure your business, and get funded — in one place.",
    features: [
      "📊  AI-powered credit analysis & monitoring",
      "🎯  Personalized roadmap built for you",
      "💰  Funding readiness tools & lender matching",
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
            <Text style={tagline}>Mogul Maker Academy</Text>
          </Section>

          {/* Main content */}
          <Section style={contentSection}>
            <Heading as="h2" style={h2}>{copy.headline}</Heading>
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
          <Text style={footer}>© {new Date().getFullYear()} {SITE_NAME} · Mogul Maker Academy. All rights reserved.</Text>
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
  previewData: { role: 'Coach', inviteUrl: 'https://paigeagent.ai/accept-invite?token=sample', invitedBy: 'Antonio', message: 'Welcome aboard — excited to have you on the team.' },
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
