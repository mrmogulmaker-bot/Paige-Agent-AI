import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Preview, Text, Button, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "PaigeAgent.ai"
const LOGO_URL = 'https://bfmyebsjyuoecmjskqhs.supabase.co/storage/v1/object/public/email-assets/paige-logo-transparent.png'

interface ScoreMilestoneProps {
  score?: number
  bureau?: string
  unlockedPrograms?: string
  nextMilestone?: number
  nextMilestoneBenefit?: string
  name?: string
}

const ScoreMilestoneEmail = ({
  score = 700,
  bureau = 'Experian',
  unlockedPrograms = 'most prime SBA programs, traditional bank lines of credit, and competitive equipment financing',
  nextMilestone = 720,
  nextMilestoneBenefit = 'top-tier rates and the BUILD Business graduation gate',
  name,
}: ScoreMilestoneProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`Your credit score hit ${score} — here's what this unlocks`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} alt={SITE_NAME} width="160" height="auto" style={logo} />
        <Text style={subheading}>Score Milestone</Text>
        <Hr style={hr} />
        <Heading as="h2" style={h2}>{name ? `${name}, you just hit a milestone` : 'You just hit a milestone'}</Heading>
        <Section style={scoreBox}>
          <Text style={scoreLabel}>{bureau}</Text>
          <Text style={scoreNumber}>{score}</Text>
        </Section>
        <Heading as="h3" style={h3}>What this score unlocks</Heading>
        <Text style={text}>You now qualify for {unlockedPrograms}.</Text>
        <Heading as="h3" style={h3}>Your next milestone: {nextMilestone}</Heading>
        <Text style={text}>Hitting {nextMilestone} unlocks {nextMilestoneBenefit}. Paige can show you the fastest path to get there.</Text>
        <Button style={button} href="https://paigeagent.ai/app/funding">
          See Your Updated Funding Options
        </Button>
        <Hr style={hr} />
        <Text style={footer}>© {new Date().getFullYear()} {SITE_NAME}. You received this because score milestone alerts are enabled in your notification preferences.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ScoreMilestoneEmail,
  subject: (data: Record<string, any>) => `🎯 Your Credit Score Hit ${data.score || 700} — Here's What This Unlocks`,
  displayName: 'Score Milestone',
  previewData: {
    score: 720,
    bureau: 'Experian',
    unlockedPrograms: 'top-tier SBA programs, prime bank financing, and the BUILD Business graduation gate',
    nextMilestone: 760,
    nextMilestoneBenefit: 'best-in-class rates and elite lender access',
    name: 'Antonio',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }
const container = { padding: '40px 25px', maxWidth: '600px', margin: '0 auto' }
const logo = { display: 'block' as const, margin: '0 auto 8px' }
const subheading = { fontSize: '14px', color: '#6b7280', textAlign: 'center' as const, margin: '0' }
const hr = { borderColor: '#e5e7eb', margin: '24px 0' }
const h2 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0a1628', margin: '0 0 16px' }
const h3 = { fontSize: '16px', fontWeight: '600' as const, color: '#0a1628', margin: '20px 0 8px' }
const text = { fontSize: '15px', color: '#374151', lineHeight: '1.6', margin: '0 0 12px' }
const scoreBox = { backgroundColor: '#0a1628', padding: '32px 16px', borderRadius: '8px', textAlign: 'center' as const, margin: '16px 0 24px' }
const scoreLabel = { fontSize: '12px', color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '1.5px', margin: '0 0 8px' }
const scoreNumber = { fontSize: '64px', fontWeight: 'bold' as const, color: '#CFAE70', margin: '0', lineHeight: '1' }
const button = { backgroundColor: '#CFAE70', color: '#ffffff', padding: '12px 30px', borderRadius: '6px', fontSize: '16px', fontWeight: '600' as const, textDecoration: 'none', display: 'block' as const, textAlign: 'center' as const, margin: '24px auto' }
const footer = { fontSize: '12px', color: '#9ca3af', textAlign: 'center' as const, margin: '0' }
