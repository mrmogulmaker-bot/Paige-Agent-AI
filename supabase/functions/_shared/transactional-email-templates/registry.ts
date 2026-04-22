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
import { template as affiliateApplicationReceived } from './affiliate-application-received.tsx'
import { template as affiliateApprovedWelcome } from './affiliate-approved-welcome.tsx'
import { template as affiliateConversionEarned } from './affiliate-conversion-earned.tsx'
import { template as affiliateCommissionPaid } from './affiliate-commission-paid.tsx'
import { template as eliteWaitlistConfirmed } from './elite-waitlist-confirmed.tsx'
import { template as affiliateMonthlyStatement } from './affiliate-monthly-statement.tsx'
import { template as brokerApplicationReceived } from './broker-application-received.tsx'
import { template as brokerApprovedWelcome } from './broker-approved-welcome.tsx'
import { template as brokerClientInvite } from './broker-client-invite.tsx'
import { template as mccNewServiceRequest } from './mcc-new-service-request.tsx'
import { template as businessSlotAdded } from './business-slot-added.tsx'
import { template as supportTicketCreated } from './support-ticket-created.tsx'
import { template as supportTicketReply } from './support-ticket-reply.tsx'
import { template as supportTicketResolved } from './support-ticket-resolved.tsx'
import { template as featureRequestStatusUpdate } from './feature-request-status-update.tsx'

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
  'affiliate-application-received': affiliateApplicationReceived,
  'affiliate-approved-welcome': affiliateApprovedWelcome,
  'affiliate-conversion-earned': affiliateConversionEarned,
  'affiliate-commission-paid': affiliateCommissionPaid,
  'elite-waitlist-confirmed': eliteWaitlistConfirmed,
  'affiliate-monthly-statement': affiliateMonthlyStatement,
  'broker-application-received': brokerApplicationReceived,
  'broker-approved-welcome': brokerApprovedWelcome,
  'broker-client-invite': brokerClientInvite,
  'mcc-new-service-request': mccNewServiceRequest,
  'business-slot-added': businessSlotAdded,
  'support-ticket-created': supportTicketCreated,
  'support-ticket-reply': supportTicketReply,
  'support-ticket-resolved': supportTicketResolved,
  'feature-request-status-update': featureRequestStatusUpdate,
}
