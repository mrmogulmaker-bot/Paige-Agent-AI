import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Button, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

// White-labeled per Doctrine §46/§123 — zero "Paige" strings.

interface Props {
  preferredName?: string
  fullName?: string
  inviteUrl?: string
  coachName?: string
}

const BtfWelcomeInvite = ({ preferredName, fullName, inviteUrl, coachName }: Props) => {
  const greetingName = preferredName || fullName || 'there'
  const link = inviteUrl || '#'

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Welcome to BUILD-to-FUND — your private workspace is ready</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={headerBar}>
            <Heading style={logoText}>Mogul Maker Academy</Heading>
            <Text style={tagline}>BUILD · TO · FUND</Text>
          </Section>

          <Section style={contentSection}>
            <Heading as="h2" style={h2}>You're in, {greetingName}.</Heading>

            <Text style={text}>
              This is Antonio. I wanted to send this one personally because the
              moment you said yes to BUILD-to-FUND, the work started on our
              side — and now it's time for you to step in.
            </Text>

            <Text style={text}>
              Click below to activate <strong>your private Build to Fund
              Workspace</strong>. It's where you and your coach will run every
              phase together — the intake, the documents we'll need, the
              milestones, and the day-to-day decisions that move you from
              "ready" to "funded."
            </Text>

            <Button style={button} href={link}>
              Activate My Workspace
            </Button>

            <Text style={helperText}>
              This link is private to you and expires in 7 days. If you didn't
              expect this email, you can ignore it.
            </Text>
          </Section>

          <Section style={featureSection}>
            <Text style={featureTitle}>Here's what happens next:</Text>
            <Text style={featureItem}>• {coachName ? `${coachName} is` : 'Your coach is'} already preparing your Phase 1 plan</Text>
            <Text style={featureItem}>• You'll complete a short intake so we can tailor the work</Text>
            <Text style={featureItem}>• Documents, messages, and progress all live in one place</Text>
            <Text style={featureItem}>• Reply to this email anytime — it comes straight to me</Text>
          </Section>

          <Hr style={hr} />
          <Text style={signoff}>— Antonio Cook<br />Founder, Mogul Maker Academy</Text>
          <Text style={footer}>Powered by Mogul Maker Academy · portal.mogulmakeracademy.com</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: BtfWelcomeInvite,
  subject: "Welcome to BUILD-to-FUND — let's get you funded",
  displayName: 'BTF Welcome Invite',
  previewData: {
    preferredName: 'Jacqueline',
    fullName: 'Jacqueline Turner',
    inviteUrl: 'https://portal.mogulmakeracademy.com/workspace/accept-invite?token=sample',
    coachName: 'Antonio',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "Georgia, 'Times New Roman', serif" }
const container = { maxWidth: '600px', margin: '0 auto' }
const headerBar = { backgroundColor: '#081428', padding: '36px 40px 28px', borderRadius: '4px 4px 0 0', textAlign: 'center' as const }
const logoText = { fontSize: '22px', fontWeight: 'bold' as const, color: '#CFAE70', margin: '0', letterSpacing: '1px', fontFamily: '"Bookman Old Style", Georgia, serif' }
const tagline = { fontSize: '11px', color: '#9ca3af', margin: '8px 0 0', textTransform: 'uppercase' as const, letterSpacing: '4px', fontFamily: '-apple-system, sans-serif' }
const contentSection = { padding: '40px 40px 24px' }
const h2 = { fontSize: '26px', fontWeight: 'normal' as const, color: '#081428', margin: '0 0 20px', fontFamily: '"Bookman Old Style", Georgia, serif' }
const text = { fontSize: '15px', color: '#1f2937', lineHeight: '1.75', margin: '0 0 18px' }
const button = { backgroundColor: '#CFAE70', color: '#081428', padding: '15px 40px', borderRadius: '4px', fontSize: '15px', fontWeight: '700' as const, textDecoration: 'none', display: 'block' as const, textAlign: 'center' as const, margin: '28px auto 14px', letterSpacing: '0.5px', textTransform: 'uppercase' as const, fontFamily: '-apple-system, sans-serif' }
const helperText = { fontSize: '12px', color: '#6b7280', lineHeight: '1.6', margin: '0', textAlign: 'center' as const, fontFamily: '-apple-system, sans-serif' }
const featureSection = { backgroundColor: '#f7f3ea', padding: '24px 40px', margin: '12px 0 0', borderRadius: '0 0 4px 4px' }
const featureTitle = { fontSize: '13px', fontWeight: '700' as const, color: '#081428', margin: '0 0 14px', textTransform: 'uppercase' as const, letterSpacing: '1.5px', fontFamily: '-apple-system, sans-serif' }
const featureItem = { fontSize: '14px', color: '#374151', lineHeight: '1.7', margin: '0 0 6px' }
const hr = { borderColor: '#e5e7eb', margin: '28px 40px 16px' }
const signoff = { fontSize: '14px', color: '#081428', margin: '0 0 18px', padding: '0 40px', fontStyle: 'italic' as const }
const footer = { fontSize: '11px', color: '#9ca3af', textAlign: 'center' as const, margin: '0', padding: '0 40px 32px', fontFamily: '-apple-system, sans-serif', letterSpacing: '0.5px' }
