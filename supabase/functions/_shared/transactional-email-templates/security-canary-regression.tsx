import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Preview, Text, Button, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'PaigeAgent.ai'
const LOGO_URL = 'https://bfmyebsjyuoecmjskqhs.supabase.co/storage/v1/object/public/email-assets/paige-logo-transparent.png'

interface Regression {
  target: string
  leaked_columns: string[]
  http_status?: number | null
}

interface CanaryRegressionProps {
  recipientName?: string
  regressions?: Regression[]
  runAt?: string
  reviewUrl?: string
}

const subjectFor = (count: number) =>
  `🚨 Security canary regression — ${count} table${count === 1 ? '' : 's'} leaking`

const SecurityCanaryRegressionEmail = ({
  recipientName,
  regressions = [],
  runAt,
  reviewUrl = 'https://paigeagent.ai/admin/security',
}: CanaryRegressionProps) => {
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{subjectFor(regressions.length)}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Img src={LOGO_URL} alt={SITE_NAME} width="160" height="auto" style={logo} />
          <Text style={subheading}>Security Canary · Regression detected</Text>
          <Hr style={hr} />
          <Heading as="h2" style={h2}>
            {recipientName ? `${recipientName}, ` : ''}restricted columns are reachable by anonymous callers.
          </Heading>
          <Text style={body}>
            The hourly canary probe just confirmed that one or more columns on
            <strong> growth_forms</strong> or <strong>growth_pages</strong> can be read without
            authentication. This is a row-level-security or column-grant regression and needs
            review immediately.
          </Text>

          <Section style={detailBox}>
            <Text style={detailLabel}>Run timestamp</Text>
            <Text style={detailValue}>{runAt ?? new Date().toISOString()}</Text>
            <Hr style={innerHr} />
            {regressions.map((r, idx) => (
              <React.Fragment key={`${r.target}-${idx}`}>
                <Text style={detailLabel}>{r.target}</Text>
                <Text style={detailValue}>
                  Leaked: {r.leaked_columns.length > 0 ? r.leaked_columns.join(', ') : '(unknown)'}
                  {typeof r.http_status === 'number' ? ` · HTTP ${r.http_status}` : ''}
                </Text>
                {idx < regressions.length - 1 ? <Hr style={innerHr} /> : null}
              </React.Fragment>
            ))}
          </Section>

          <Button style={button} href={reviewUrl}>
            Open Security Console
          </Button>

          <Hr style={hr} />
          <Text style={footer}>
            © {new Date().getFullYear()} {SITE_NAME}. You received this because you are on the
            admin security notification list.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: SecurityCanaryRegressionEmail,
  subject: (data: Record<string, any>) =>
    subjectFor(Array.isArray(data?.regressions) ? data.regressions.length : 1),
  displayName: 'Security Canary Regression',
  previewData: {
    recipientName: 'Antonio',
    runAt: new Date().toISOString(),
    regressions: [
      { target: 'growth_forms', leaked_columns: ['tenant_id', 'workflow_slug'], http_status: 200 },
    ],
    reviewUrl: 'https://paigeagent.ai/admin/security',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }
const container = { padding: '40px 25px', maxWidth: '600px', margin: '0 auto' }
const logo = { display: 'block' as const, margin: '0 auto 8px' }
const subheading = { fontSize: '14px', color: '#b91c1c', textAlign: 'center' as const, margin: '0', fontWeight: '600' as const }
const hr = { borderColor: '#e5e7eb', margin: '24px 0' }
const innerHr = { borderColor: '#e5e7eb', margin: '12px 0' }
const h2 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0a1628', margin: '0 0 16px' }
const body = { fontSize: '15px', color: '#0a1628', lineHeight: '1.6', margin: '0 0 16px' }
const detailBox = { backgroundColor: '#fef2f2', padding: '20px', borderRadius: '8px', border: '1px solid #fecaca', margin: '16px 0 24px' }
const detailLabel = { fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.5px', margin: '0 0 4px' }
const detailValue = { fontSize: '15px', color: '#0a1628', fontWeight: '600' as const, margin: '0' }
const button = { backgroundColor: '#CFAE70', color: '#ffffff', padding: '12px 30px', borderRadius: '6px', fontSize: '16px', fontWeight: '600' as const, textDecoration: 'none', display: 'block' as const, textAlign: 'center' as const, margin: '24px auto' }
const footer = { fontSize: '12px', color: '#9ca3af', textAlign: 'center' as const, margin: '0' }
