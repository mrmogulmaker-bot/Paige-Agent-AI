/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as roleInvitation } from './role-invitation.tsx'
import { template as welcomeEmail } from './welcome.tsx'
import { template as affiliateInvitation } from './affiliate-invitation.tsx'
import { template as creditAlert } from './credit-alert.tsx'
import { template as scoreMilestone } from './score-milestone.tsx'
import { template as fundingOpportunity } from './funding-opportunity.tsx'
import { template as weeklySummary } from './weekly-summary.tsx'
import { template as onboardingWelcome } from './onboarding-welcome.tsx'
import { template as coachingReminder } from './coaching-reminder.tsx'
import { template as smsVerification } from './sms-verification.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'role-invitation': roleInvitation,
  'welcome': welcomeEmail,
  'affiliate-invitation': affiliateInvitation,
  'credit-alert': creditAlert,
  'score-milestone': scoreMilestone,
  'funding-opportunity': fundingOpportunity,
  'weekly-summary': weeklySummary,
  'onboarding-welcome': onboardingWelcome,
  'coaching-reminder': coachingReminder,
  'sms-verification': smsVerification,
}
