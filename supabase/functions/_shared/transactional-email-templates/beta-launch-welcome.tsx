import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Preview, Text, Button, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'PaigeAgent.ai'
const LOGO_URL =
  'https://bfmyebsjyuoecmjskqhs.supabase.co/storage/v1/object/public/email-assets/paige-logo-transparent.png'

interface BetaLaunchProps {
  name?: string
}

const BetaLaunchEmail = ({ name }: BetaLaunchProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You are in — PaigeAgent AI Beta is officially live 🎉</Preview>
    <Body style={main}>
      {/* Navy header */}
      <Section style={header}>
        <Img src={LOGO_URL} alt={SITE_NAME} width="200" height="auto" style={logo} />
        <Text style={headerTagline}>Mogul Maker Academy</Text>
      </Section>

      <Container style={container}>
        {/* Opening */}
        <Heading as="h1" style={h1}>
          {name ? `Welcome to the Beta, ${name} 🎉` : 'Welcome to the Beta 🎉'}
        </Heading>
        <Text style={text}>
          Welcome to the PaigeAgent Beta — and thank you for being one of our founding members.
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
          <strong style={strongNavy}>Paige now knows your full financial story.</strong> Connect QuickBooks and she pulls your real banking data — account balances, average deposits, monthly revenue — and uses it to calculate how lenders actually see you. No more estimates.
        </Text>

        <Text style={text}>
          <strong style={strongNavy}>Three fundability scores instead of one.</strong> Your Personal Fundability, Small Business Fundability, and Commercial EIN-Only scores now calculate separately — because a no-doc business card approval works completely differently than an SBA loan. Each score shows exactly what is unlocked and what is blocking you.
        </Text>

        <Text style={text}>
          <strong style={strongNavy}>Product Approval Readiness.</strong> Open your Credit Intelligence tab and see which credit products you qualify for right now — from secured cards to DSCR loans to commercial lines — with your actual approval likelihood and the specific blockers holding you back.
        </Text>

        <Text style={text}>
          <strong style={strongNavy}>Your negative accounts now have grades.</strong> A collection from 3 months ago hits completely differently than one from 4 years ago. Paige now shows you exactly how each negative is weighted by lenders — and when it crosses out of the critical zone.
        </Text>

        <Text style={text}>
          <strong style={strongNavy}>Bureau-specific funding strategy.</strong> Your Experian score may be 15 points higher than your Equifax. Paige now shows you which bureau is your strongest and which lenders to approach first based on your real bureau profile.
        </Text>

        <Text style={text}>
          <strong style={strongNavy}>Your credit story by product.</strong> Paige now analyzes whether your credit history actually matches what lenders want to see for each specific product — and tells you exactly how they will read your file before you apply.
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

        <Button style={button} href="https://paigeagent.ai/app/financial-profile">
          Complete Your Financial Profile
        </Button>
        <Button style={button} href="https://paigeagent.ai/app/credit">
          See Your Product Approval Readiness
        </Button>
        <Button style={button} href="https://paigeagent.ai/app">
          Ask Paige Anything
        </Button>

        <Hr style={hr} />

        {/* Closing */}
        <Text style={text}>
          We are building PaigeAgent to be the most complete financial intelligence platform available to entrepreneurs. You are not just a user — you are part of that story.
        </Text>
        <Text style={text}>
          If you run into anything, have a question, or want to share feedback — hit the Support tab inside the app. We read every ticket personally.
        </Text>

        <Text style={signoff}>To making it,</Text>
        <Text style={signature}>Antonio Cook</Text>
        <Text style={signatureMeta}>Founder, PaigeAgent AI</Text>
        <Text style={signatureMeta}>Project Mogul Enterprise</Text>

        <Hr style={hr} />
        <Text style={footer}>
          © {new Date().getFullYear()} {SITE_NAME}. All rights reserved.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: BetaLaunchEmail,
  subject: 'You are in — PaigeAgent AI Beta is officially live 🎉',
  displayName: 'Beta Launch Welcome',
  previewData: { name: 'Antonio' },
} satisfies TemplateEntry

// Brand: Navy #0a1628, Gold #CFAE70, White #ffffff
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
  color: '#CFAE70',
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
  color: '#CFAE70',
  margin: '28px 0 16px',
  lineHeight: '1.3',
  borderBottom: '2px solid #CFAE70',
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
  border: '2px solid #CFAE70',
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
  backgroundColor: '#CFAE70',
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
