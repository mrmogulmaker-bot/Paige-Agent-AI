import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Preview, Text, Button, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "Paige Agent AI"
const LOGO_URL = 'https://bfmyebsjyuoecmjskqhs.supabase.co/storage/v1/object/public/email-assets/paige-logo-transparent.png'

interface CoachingReminderProps {
  name?: string
  sessionDate?: string
  sessionTime?: string
  coachName?: string
  joinUrl?: string
  rescheduleUrl?: string
  agenda?: string
}

const CoachingReminderEmail = ({
  name,
  sessionDate = 'Tomorrow',
  sessionTime = '10:00 AM EST',
  coachName = 'Your coach',
  joinUrl = 'https://app.paigeagent.ai',
  rescheduleUrl = 'https://app.paigeagent.ai',
  agenda = 'Review your progress, work through your current goals, and set the next steps.',
}: CoachingReminderProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Reminder — your strategy session is {sessionDate}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} alt={SITE_NAME} width="160" height="auto" style={logo} />
        <Text style={subheading}>Session Reminder</Text>
        <Hr style={hr} />
        <Heading as="h2" style={h2}>{name ? `${name}, your session is ${sessionDate}` : `Your session is ${sessionDate}`}</Heading>
        <Section style={detailBox}>
          <Text style={detailLabel}>When</Text>
          <Text style={detailValue}>{sessionDate}, {sessionTime}</Text>
          <Hr style={innerHr} />
          <Text style={detailLabel}>With</Text>
          <Text style={detailValue}>{coachName}</Text>
          <Hr style={innerHr} />
          <Text style={detailLabel}>Agenda</Text>
          <Text style={detailValue}>{agenda}</Text>
        </Section>
        <Heading as="h3" style={h3}>How to prepare</Heading>
        <Text style={text}>• Open your latest progress notes and action items in Paige</Text>
        <Text style={text}>• Review your current goals and where you left off last session</Text>
        <Text style={text}>• Have your top 2-3 questions ready</Text>
        <Button style={button} href={joinUrl}>
          Join Session
        </Button>
        <Text style={secondaryLink}>
          Need to reschedule? <a href={rescheduleUrl} style={link}>Pick a new time</a>
        </Text>
        <Hr style={hr} />
        <Text style={footer}>© {new Date().getFullYear()} {SITE_NAME}. You received this because session reminders are enabled in your notification preferences.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: CoachingReminderEmail,
  subject: '📅 Reminder — Your Strategy Session is Tomorrow',
  displayName: 'Session Reminder',
  previewData: {
    name: 'Antonio',
    sessionDate: 'Tomorrow',
    sessionTime: '10:00 AM EST',
    coachName: 'Coach Candace',
    agenda: 'Review last month\'s wins, work through your current goals, and lock in your next three action items.',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }
const container = { padding: '40px 25px', maxWidth: '600px', margin: '0 auto' }
const logo = { display: 'block' as const, margin: '0 auto 8px' }
const subheading = { fontSize: '14px', color: '#6b7280', textAlign: 'center' as const, margin: '0' }
const hr = { borderColor: '#e5e7eb', margin: '24px 0' }
const innerHr = { borderColor: '#e5e7eb', margin: '12px 0' }
const h2 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0a1628', margin: '0 0 16px' }
const h3 = { fontSize: '16px', fontWeight: '600' as const, color: '#0a1628', margin: '20px 0 8px' }
const text = { fontSize: '15px', color: '#374151', lineHeight: '1.6', margin: '0 0 6px' }
const detailBox = { backgroundColor: '#f9fafb', padding: '20px', borderRadius: '8px', border: '1px solid #e5e7eb', margin: '16px 0 24px' }
const detailLabel = { fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.5px', margin: '0 0 4px' }
const detailValue = { fontSize: '15px', color: '#0a1628', fontWeight: '600' as const, margin: '0' }
const button = { backgroundColor: '#EBB94C', color: '#ffffff', padding: '12px 30px', borderRadius: '6px', fontSize: '16px', fontWeight: '600' as const, textDecoration: 'none', display: 'block' as const, textAlign: 'center' as const, margin: '24px auto' }
const secondaryLink = { fontSize: '13px', color: '#6b7280', textAlign: 'center' as const, margin: '12px 0 0' }
const link = { color: '#EBB94C', textDecoration: 'underline' }
const footer = { fontSize: '12px', color: '#9ca3af', textAlign: 'center' as const, margin: '0' }
