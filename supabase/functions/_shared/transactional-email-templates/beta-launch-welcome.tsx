import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Preview, Text, Button, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { EmailFooter } from './email-footer.tsx'

const SITE_NAME = 'Paige Agent AI'
const LOGO_URL =
  'https://bfmyebsjyuoecmjskqhs.supabase.co/storage/v1/object/public/email-assets/paige-logo-transparent.png'

interface BetaLaunchProps {
  name?: string
  unsubscribeUrl?: string
}

const BetaLaunchEmail = ({ name, unsubscribeUrl }: BetaLaunchProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You are in — the Paige Agent AI Beta is officially live 🎉</Preview>
    <Body style={main}>
      {/* Navy header */}
      <Section style={header}>
        <Img src={LOGO_URL} alt={SITE_NAME} width="200" height="auto" style={logo} />
        <Text style={headerTagline}>Paige Agent AI</Text>
      </Section>

      <Container style={container}>
        {/* Opening */}
        <Heading as="h1" style={h1}>
          {name ? `Welcome to the Beta, ${name} 🎉` : 'Welcome to the Beta 🎉'}
        </Heading>
        <Text style={text}>
          Welcome to the Paige Agent AI Beta — and thank you for being one of our founding members.
        </Text>
        <Text style={text}>
          You signed up early and that means something. Everything we are about to share — you get to experience first.
        </Text>

        <Hr style={hr} />

        {/* Updates */}
        <Heading as="h2" style={h2Gold}>
          Here is What We Just Built For You
        </Heading>

        <Text style={text}>
          <strong style={strongNavy}>Paige now runs your practice end-to-end.</strong> She lives inside your business — your clients, your pipeline, your calendar — and works both sides at once: onboarding new clients while surfacing exactly what your existing ones need next. One teammate, no busywork.
        </Text>

        <Text style={text}>
          <strong style={strongNavy}>Every new client onboards themselves.</strong> Paige greets each client under your brand, runs the intake conversation, asks the right follow-up questions, and hands you a clean, complete profile — so no one falls through the cracks in their first week.
        </Text>

        <Text style={text}>
          <strong style={strongNavy}>She drafts every follow-up for you.</strong> Open a client and Paige has already written the next message — check-in, nudge, or answer — in your voice, ready to send or approve. The follow-ups you kept meaning to send now send themselves.
        </Text>

        <Text style={text}>
          <strong style={strongNavy}>At-risk clients get flagged before they slip.</strong> Paige watches for the quiet signals — gone quiet, missed a session, stalled in the journey — and puts the at-risk list in front of you with the recovery move already drafted.
        </Text>

        <Text style={text}>
          <strong style={strongNavy}>Your daily brief is ready every morning.</strong> Who needs attention, what closed, what is stuck, what to do first. Paige preps it so you open your day already knowing where to spend it — instead of digging through your inbox to find out.
        </Text>

        <Text style={text}>
          <strong style={strongNavy}>Your pipeline keeps moving on its own.</strong> Paige tracks every client and prospect through your stages, chases the ones that go cold, and keeps retainers and renewals from quietly lapsing — so revenue does not leak while you are doing the actual work.
        </Text>

        <Hr style={hr} />

        {/* Founding member card */}
        <Section style={foundingCard}>
          <Heading as="h3" style={h3Gold}>
            You are a founding Beta member.
          </Heading>
          <Text style={cardText}>
            Your pricing is locked for life — whatever you pay today is what you pay forever, regardless of what we charge future members.
          </Text>
          <Text style={cardText}>
            This is not a promotion. It is a thank you for believing in this early.
          </Text>
        </Section>

        {/* CTAs */}
        <Heading as="h2" style={h2Gold}>
          What To Do Now
        </Heading>

        <Button style={button} href="https://app.paigeagent.ai/onboarding">
          Set Up Your Paige Workspace
        </Button>
        <Button style={button} href="https://app.paigeagent.ai/clients">
          Add Your First Clients
        </Button>
        <Button style={button} href="https://app.paigeagent.ai">
          Ask Paige Anything
        </Button>

        <Hr style={hr} />

        {/* Closing */}
        <Text style={text}>
          We are building Paige Agent AI to be the intelligent client portal that actually runs the business behind it — for coaches, consultants, agencies, and advisors alike. You are not just a user — you are part of that story.
        </Text>
        <Text style={text}>
          If you run into anything, have a question, or want to share feedback — hit the Support tab inside the app. We read every ticket personally.
        </Text>

        <Text style={signoff}>To your growth,</Text>
        <Text style={signature}>The Paige Agent AI team</Text>

        <Hr style={hr} />
        <Text style={footer}>
          © {new Date().getFullYear()} {SITE_NAME}. All rights reserved.
        </Text>
        <EmailFooter unsubscribeUrl={unsubscribeUrl} />
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: BetaLaunchEmail,
  subject: 'You are in — the Paige Agent AI Beta is officially live 🎉',
  displayName: 'Beta Launch Welcome',
  previewData: { name: 'Jordan' },
} satisfies TemplateEntry

// Brand: Navy #0a1628, Gold #EBB94C, White #ffffff
const main = {
  backgroundColor: '#ffffff',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  margin: 0,
  padding: 0,
}
const header = {
  backgroundColor: '#0a1628',
  padding: '32px 24px',
  textAlign: 'center' as const,
}
const logo = { display: 'block' as const, margin: '0 auto 8px' }
const headerTagline = {
  fontSize: '13px',
  color: '#EBB94C',
  letterSpacing: '2px',
  textTransform: 'uppercase' as const,
  textAlign: 'center' as const,
  margin: '8px 0 0',
}
const container = { padding: '40px 28px', maxWidth: '600px', margin: '0 auto' }
const h1 = {
  fontSize: '26px',
  fontWeight: 'bold' as const,
  color: '#0a1628',
  margin: '0 0 20px',
  lineHeight: '1.3',
}
const h2Gold = {
  fontSize: '20px',
  fontWeight: 'bold' as const,
  color: '#EBB94C',
  margin: '28px 0 16px',
  lineHeight: '1.3',
  borderBottom: '2px solid #EBB94C',
  paddingBottom: '8px',
}
const h3Gold = {
  fontSize: '18px',
  fontWeight: 'bold' as const,
  color: '#0a1628',
  margin: '0 0 12px',
}
const text = {
  fontSize: '15px',
  color: '#374151',
  lineHeight: '1.7',
  margin: '0 0 16px',
}
const strongNavy = { color: '#0a1628', fontWeight: 700 as const }
const hr = { borderColor: '#e5e7eb', margin: '28px 0' }
const foundingCard = {
  backgroundColor: '#fdfaf3',
  border: '2px solid #EBB94C',
  borderRadius: '8px',
  padding: '24px',
  margin: '24px 0',
}
const cardText = {
  fontSize: '15px',
  color: '#374151',
  lineHeight: '1.7',
  margin: '0 0 12px',
}
const button = {
  backgroundColor: '#EBB94C',
  color: '#ffffff',
  padding: '14px 24px',
  borderRadius: '6px',
  fontSize: '15px',
  fontWeight: 600 as const,
  textDecoration: 'none',
  display: 'block' as const,
  textAlign: 'center' as const,
  margin: '12px auto',
  width: '80%',
}
const signoff = { fontSize: '15px', color: '#374151', margin: '20px 0 4px' }
const signature = {
  fontSize: '16px',
  color: '#0a1628',
  fontWeight: 700 as const,
  margin: '0 0 4px',
}
const signatureMeta = { fontSize: '13px', color: '#6b7280', margin: '0' }
const footer = {
  fontSize: '12px',
  color: '#9ca3af',
  textAlign: 'center' as const,
  margin: '0',
}
