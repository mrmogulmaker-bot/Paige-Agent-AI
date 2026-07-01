INSERT INTO public.paige_subagents (
  slug, name, domain, description, runtime, edge_function, triggers, display_order, enabled
) VALUES (
  'email-composer',
  'Email Composer',
  'Comms',
  'Dedicated free-form email drafter. Accepts intent + tone (professional, warm, welcoming, stern, friendly, executive, apologetic, celebratory, direct, empathetic, urgent) + key points + length + CTA. Returns {subject, body_html, body_text, compliance_flags}. Never sends — Paige pairs the draft with send_composed_email or send_transactional_email after review.',
  'local',
  'subagent-email-composer',
  ARRAY[
    'compose email','draft an email','write an email','email draft',
    'welcome email','stern email','warm email','professional email',
    'apology email','follow-up email','announcement email'
  ],
  12,
  true
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  domain = EXCLUDED.domain,
  description = EXCLUDED.description,
  runtime = EXCLUDED.runtime,
  edge_function = EXCLUDED.edge_function,
  triggers = EXCLUDED.triggers,
  enabled = EXCLUDED.enabled,
  updated_at = now();