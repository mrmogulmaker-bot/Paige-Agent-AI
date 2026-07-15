// Growth templates + the seam-message translator — ONE copy, shared by the Growth
// libraries (GrowthHub) and the Studio's form/funnel modes. Extracted verbatim from
// GrowthHub.tsx so the two surfaces can never drift apart (§12: extend, never fork).
//
// House rules for everything in this file:
//  • §2/§9 — platform defaults are generic to client-based service businesses. No
//    vertical's offer, and nothing that reads as consumer finance, lives here.
//  • Proof is never fabricated. Testimonials, client logos, stat numbers, and prices
//    ship as *editing prompts*, not invented quotes/figures — a template must never hand
//    a tenant a fake review or a claim they didn't make. They fill them in the Studio.
//  • No dead links. `#apply` is the anchor the embedded_form block renders, so CTAs
//    pointing at it are only emitted when a real form is connected to the page.
import type { GrowthBlock, GrowthFormSchema } from "@/lib/growth";

// Platform-default template sets (§2/§9): these ship to EVERY tenant, so they stay
// generic to client-based service businesses — coaches, consultants, agencies, advisors,
// thought leaders. No vertical's content lives here. A tenant with a specific offer
// authors their own pages/forms in the Studio (or has Paige generate them); those are
// tenant-scoped rows, never platform defaults.
export const PAGE_TEMPLATES = [
  { key: "offer-sales", label: "Offer Sales Page", description: "The full pitch: how the work runs, what's included, pricing, and the questions people always ask." },
  { key: "lead-magnet", label: "Lead Magnet Opt-in", description: "One promise, what's inside, and the opt-in. Built to trade a resource for an email." },
  { key: "discovery-call", label: "Discovery Call Page", description: "What the call is, what happens on it, and the request form." },
  { key: "workshop", label: "Workshop Registration", description: "Live workshop or webinar — countdown, the agenda, and registration." },
  { key: "client-proof", label: "Results & Proof", description: "Client outcomes, quotes, and the names you work with — the page that closes doubters." },
];

export const FORM_TEMPLATES = [
  { key: "discovery-call", label: "Discovery Call Request", description: "Who they are, what they run, what's in the way, and when they want to move." },
  { key: "client-application", label: "Engagement Application", description: "Three steps: about them, their business, and whether the work is a fit." },
  { key: "client-intake", label: "New Client Intake", description: "Everything you need on day one — goals, context, how they like to work." },
  { key: "lead-magnet", label: "Lead Magnet Opt-in", description: "First name and email. Nothing else in the way." },
  { key: "client-story", label: "Client Story Request", description: "Ask a client for the outcome, the quote, and permission to use it." },
];

/**
 * Postgres RAISE messages arrive as "GROWTH_CODE: human half". Operators never see the
 * code, the table, or the function (§11) — they see the move that fixes it (§3 voice).
 */
export function growthSeamMessage(err: unknown, fallback: string): string {
  const raw = String((err as { message?: string } | null)?.message ?? "");
  const code = /^(GROWTH_[A-Z_]+)\b/.exec(raw)?.[1];
  switch (code) {
    case "GROWTH_NO_DRAFT":
      return "Nothing to publish yet. Open this page in the Studio, make your edits, and save — then publish.";
    case "GROWTH_UNRESOLVED_PLACEHOLDER":
      return "This page still has fill-in-the-blank prompts on it. Replace them with your real dates, links, and words, then publish.";
    case "GROWTH_FORM_MISSING":
      return "The signup section on this page has no live form behind it. Re-save the page in the Studio and the form gets built for you.";
    case "GROWTH_NO_TENANT_SLUG":
      return "Your workspace has no public link yet. Set one in Settings, then publish.";
    case "GROWTH_INVALID_BLOCKS":
      return "One of the sections on this page isn't finished. Open it in the Studio, fix the section, and save.";
    case "GROWTH_INVALID_SLUG":
      return "This needs a link before it can go live.";
    case "GROWTH_INVALID_SCHEMA":
      return "One of the fields on this form isn't finished. Fix it, then try again.";
    case "GROWTH_INVALID_STEPS":
      return "One of the funnel's steps isn't finished. Fix it, then try again.";
    case "GROWTH_FUNNEL_EMPTY":
      return "This funnel has no steps yet. Add at least one before publishing.";
    case "GROWTH_FUNNEL_STEP_INCOMPLETE":
      return "One of the funnel's steps is missing its page or form. Fill it in, then publish.";
    case "GROWTH_FUNNEL_UNPUBLISHED_PAGE":
      return "A page in this funnel isn't live yet. Publish that page first, then publish the funnel.";
    case "GROWTH_FUNNEL_INACTIVE_FORM":
      return "A form in this funnel is turned off. Turn it on, then publish the funnel.";
    case "GROWTH_ENTRY_PAGE_NOT_FOUND":
    case "GROWTH_SUCCESS_PAGE_NOT_FOUND":
    case "GROWTH_STEP_PAGE_NOT_FOUND":
    case "GROWTH_STEP_FORM_NOT_FOUND":
      return "A page or form this funnel points to isn't in this workspace anymore. Refresh and try again.";
    case "GROWTH_NOT_FOUND":
      return "That isn't here anymore. Refresh and try again.";
    case "GROWTH_NO_TENANT":
      return "Pick a workspace first.";
    case "GROWTH_FORBIDDEN":
      return "You don't have access to do that.";
    default:
      return fallback;
  }
}

/** The DOM id the embedded_form block renders — the only in-page anchor target. */
export const APPLY_ANCHOR = "#apply";

/** CTA props for a hero/tier — omitted entirely when no form backs the page. */
const applyCta = (label: string, formSlug: string | null) =>
  formSlug ? { cta_label: label, cta_href: APPLY_ANCHOR } : {};

/** The form section — only when a real, existing form is connected. */
const formSection = (formSlug: string | null, title: string): GrowthBlock[] =>
  formSlug ? [{ type: "embedded_form", form_slug: formSlug, title }] : [];

/** The closing CTA — needs a live anchor to point at, so it follows the form. */
const closingCta = (formSlug: string | null, title: string, body: string, label: string): GrowthBlock[] =>
  formSlug ? [{ type: "cta", title, body, cta_label: label, cta_href: APPLY_ANCHOR }] : [];

/** Testimonials ship as prompts — the tenant replaces them with real client words. */
const TESTIMONIAL_PROMPTS: GrowthBlock = {
  type: "testimonial",
  items: [
    { quote: "Paste a client's own words here — what changed for them, and how fast.", author: "Client name", role: "Their role, their company" },
    { quote: "The strongest quote names the problem they walked in with and the result they walked out with.", author: "Client name", role: "Their role, their company" },
  ],
};

export function templateBlocks(template: string, title: string, formSlug: string | null): GrowthBlock[] {
  switch (template) {
    case "offer-sales":
      return [
        { type: "hero", eyebrow: "Work with us", title,
          subtitle: "The problem you're carrying, the work we do about it, and what it looks like when it's handled.",
          ...applyCta("Apply to work together", formSlug) },
        { type: "stats", title: "The short version", items: [
          { value: "—", label: "Clients served to date" },
          { value: "—", label: "Years doing this work" },
          { value: "—", label: "Typical engagement length" },
        ]},
        { type: "steps", title: "How the work runs", items: [
          { number: "01", title: "We get the full picture", body: "One deep session where we map what you're running, who your clients are, and where it's leaking. No guessing — we look at the real thing." },
          { number: "02", title: "We build the plan", body: "You get a written plan with the moves, the order, and who owns each one. It's yours whether or not we go further." },
          { number: "03", title: "We run it with you", body: "Standing sessions, work between them, and a team that answers. You're never sitting on a decision alone." },
        ]},
        { type: "feature_grid", title: "What's included", items: [
          { title: "Standing sessions", body: "A recurring hour with a real person who knows your business and remembers last time." },
          { title: "The plan, in writing", body: "Priorities, owners, and dates. Everyone can see what happens next." },
          { title: "Between-session access", body: "You don't wait a week to ask the question that's blocking you today." },
          { title: "Your team, not just you", body: "We bring in whoever else needs to be in the room so the work actually lands." },
        ]},
        TESTIMONIAL_PROMPTS,
        { type: "pricing", title: "Ways to work together", tiers: [
          { name: "Intensive", price: "—", period: "one-time", features: ["A single deep working session", "The written plan", "Two weeks of follow-up"], ...applyCta("Start here", formSlug) },
          { name: "Ongoing", price: "—", period: "per month", features: ["Standing sessions", "Between-session access", "Plan owned and driven end to end"], featured: true, ...applyCta("Apply", formSlug) },
          { name: "Team", price: "—", period: "per month", features: ["Everything in Ongoing", "Sessions with your team", "Quarterly review with leadership"], ...applyCta("Talk to us", formSlug) },
        ]},
        { type: "faq", title: "Before you ask", items: [
          { question: "Who is this actually for?", answer: "People running client work who are past the beginner questions and are being held back by something specific. If you can name the problem, we can work on it." },
          { question: "How fast do we start?", answer: "Send the application. If it's a fit, we'll get you on the calendar and tell you exactly what to bring." },
          { question: "What if it isn't a fit?", answer: "We'll tell you, and we'll point you at what would serve you better. Nobody's time is worth wasting." },
          { question: "What do you need from me?", answer: "Honesty about where things really are, and the time you committed to. That's it." },
        ]},
        ...formSection(formSlug, "Apply"),
        ...closingCta(formSlug, "Ready when you are.", "Tell us what you're working on. We'll tell you straight whether we can help.", "Apply to work together"),
      ];

    case "lead-magnet":
      return [
        { type: "hero", eyebrow: "Free resource", title,
          subtitle: "One thing you can use today. Drop your details and it's yours.",
          ...applyCta("Send it to me", formSlug) },
        { type: "feature_grid", title: "What's inside", items: [
          { title: "The thing itself", body: "Say plainly what they get — the checklist, the template, the walkthrough." },
          { title: "Why it matters", body: "Name the problem it solves. One sentence, no throat-clearing." },
          { title: "What to do with it", body: "Tell them the first move to make once they have it." },
        ]},
        ...formSection(formSlug, "Where should we send it?"),
      ];

    case "discovery-call":
      return [
        { type: "hero", eyebrow: "Book a call", title,
          subtitle: "Thirty minutes. You leave knowing your next move, whether or not you work with us.",
          ...applyCta("Request a call", formSlug) },
        { type: "steps", title: "What happens on the call", items: [
          { number: "01", title: "You talk, we listen", body: "Where the business is, what you've already tried, what's actually in the way." },
          { number: "02", title: "We tell you what we see", body: "The honest read — including when the answer is that you don't need us." },
          { number: "03", title: "You get the next move", body: "One clear recommendation you can act on this week." },
        ]},
        TESTIMONIAL_PROMPTS,
        { type: "faq", title: "Questions people ask first", items: [
          { question: "Is this a sales call?", answer: "It's a working call. If it makes sense to keep going, we'll say so at the end — you won't have to sit through a pitch to get value." },
          { question: "How should I prepare?", answer: "Bring the real numbers and the real problem. The more honest the input, the more useful the half hour." },
          { question: "How long until we speak?", answer: "Send the request and we'll come back with times that work." },
        ]},
        ...formSection(formSlug, "Request your call"),
        ...closingCta(formSlug, "Grab a time.", "Tell us where things stand. We'll take it from there.", "Request a call"),
      ];

    case "workshop":
      return [
        { type: "hero", eyebrow: "Live workshop", title,
          subtitle: "Live, working, and recorded. Come with a real problem and leave with it half-solved.",
          ...applyCta("Save my seat", formSlug) },
        { type: "countdown", title: "Doors close in", subtitle: "Set the real date and time in the Studio.",
          ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          expired_text: "Registration is closed — join the list for the next one." },
        { type: "steps", title: "What we'll cover", items: [
          { number: "01", title: "The first thing", body: "Name the segment and what they walk away able to do." },
          { number: "02", title: "The second thing", body: "Keep it concrete — a move they can run the same week." },
          { number: "03", title: "Live Q&A", body: "Bring the question you can't get a straight answer to anywhere else." },
        ]},
        { type: "faq", title: "Details", items: [
          { question: "Is it recorded?", answer: "Yes. Register and you'll get the recording either way." },
          { question: "What does it cost?", answer: "Say it plainly here — free, or the price." },
          { question: "Who should come?", answer: "Describe the person this is built for, and who it isn't." },
        ]},
        ...formSection(formSlug, "Register"),
        ...closingCta(formSlug, "Save your seat.", "Seats are live now. Register and we'll send the link.", "Save my seat"),
      ];

    case "client-proof":
      return [
        { type: "hero", eyebrow: "Results", title,
          subtitle: "The work, in the words of the people it was done for.",
          ...applyCta("Work with us", formSlug) },
        { type: "stats", title: "By the numbers", items: [
          { value: "—", label: "Clients served" },
          { value: "—", label: "Average result" },
          { value: "—", label: "Years in the work" },
        ]},
        TESTIMONIAL_PROMPTS,
        { type: "social_proof", title: "The people we work with", logos: [
          { name: "Client or partner name" },
          { name: "Client or partner name" },
          { name: "Client or partner name" },
          { name: "Client or partner name" },
        ]},
        ...formSection(formSlug, "Start the conversation"),
        ...closingCta(formSlug, "Want results like these?", "Tell us where you are. We'll tell you what it would take.", "Work with us"),
      ];

    default:
      return [
        { type: "hero", title, subtitle: "Tell them what this page is for, in one line.",
          ...applyCta("Get started", formSlug) },
        ...formSection(formSlug, "Get in touch"),
      ];
  }
}

export function formTemplateSchema(template: string): GrowthFormSchema {
  switch (template) {
    case "client-application":
      return {
        submit_label: "Submit application",
        sections: [
          { title: "About you", description: "The basics, so we know who we're talking to.", fields: [
            { key: "first_name", label: "First name", type: "text", required: true, maps_to: "clients.first_name" },
            { key: "last_name", label: "Last name", type: "text", required: true, maps_to: "clients.last_name" },
            { key: "email", label: "Email", type: "email", required: true, maps_to: "clients.email" },
            { key: "phone", label: "Phone", type: "tel", maps_to: "clients.phone" },
            { key: "role", label: "Your role", type: "text", placeholder: "Founder, principal, partner…" },
            { key: "location", label: "Where are you based?", type: "text", help: "So we can find hours that work for both of us." },
          ]},
          { title: "Your business", description: "Where things actually stand today.", fields: [
            { key: "business_name", label: "Business name", type: "text", maps_to: "businesses.legal_name" },
            { key: "website", label: "Website", type: "text", maps_to: "businesses.website" },
            { key: "what_you_do", label: "What does your business do?", type: "textarea", required: true, placeholder: "Who you serve and what you sell them." },
            { key: "team_size", label: "How many people on the team?", type: "number" },
            { key: "years_operating", label: "Years operating", type: "number" },
            { key: "clients_active", label: "How many active clients right now?", type: "number" },
          ]},
          { title: "The work", description: "What you want moved, and whether now is the time.", fields: [
            { key: "primary_goal", label: "What outcome are you after?", type: "textarea", required: true, placeholder: "Be specific. What's different in six months if this works?" },
            { key: "biggest_obstacle", label: "What's in the way?", type: "textarea", required: true },
            { key: "tried_already", label: "What have you already tried?", type: "textarea", help: "Saves us both from re-running something that didn't work." },
            { key: "timeline", label: "When do you want to start?", type: "select", required: true,
              options: ["Right away", "In the next 30 days", "This quarter", "Just exploring for now"] },
            { key: "budget_range", label: "What have you set aside for this?", type: "select",
              options: ["Not sure yet", "Under $2,500", "$2,500 – $10,000", "$10,000 – $25,000", "$25,000+"] },
            { key: "commitment", label: "I'm ready to do the work between sessions, not just show up to them.", type: "checkbox" },
          ]},
        ],
      };

    case "client-intake":
      return {
        submit_label: "Send it over",
        sections: [
          { title: "Your details", fields: [
            { key: "first_name", label: "First name", type: "text", required: true, maps_to: "clients.first_name" },
            { key: "last_name", label: "Last name", type: "text", required: true, maps_to: "clients.last_name" },
            { key: "email", label: "Email", type: "email", required: true, maps_to: "clients.email" },
            { key: "phone", label: "Phone", type: "tel", maps_to: "clients.phone" },
            { key: "business_name", label: "Business name", type: "text", maps_to: "businesses.legal_name" },
            { key: "start_date", label: "When do you want to start?", type: "date" },
          ]},
          { title: "How we'll work", description: "So the first session starts at full speed instead of warming up.", fields: [
            { key: "primary_goal", label: "What are we working toward?", type: "textarea", required: true },
            { key: "success_looks_like", label: "What does 'this worked' look like to you?", type: "textarea" },
            { key: "biggest_obstacle", label: "What's the biggest thing in the way?", type: "textarea" },
            { key: "weekly_hours", label: "Hours a week you can genuinely put in", type: "number" },
            { key: "meeting_preference", label: "How do you like to meet?", type: "radio",
              options: ["Video call", "Phone", "In person", "Whatever's easiest"] },
            { key: "comms_preference", label: "Best way to reach you between sessions", type: "radio",
              options: ["Email", "Text", "Client portal"] },
            { key: "anything_else", label: "Anything we should know before we start?", type: "textarea" },
          ]},
        ],
      };

    case "lead-magnet":
      return {
        submit_label: "Send it to me",
        sections: [{ title: "Where should we send it?", fields: [
          { key: "first_name", label: "First name", type: "text", required: true, maps_to: "clients.first_name" },
          { key: "email", label: "Email", type: "email", required: true, maps_to: "clients.email" },
        ]}],
      };

    case "client-story":
      return {
        submit_label: "Send my story",
        sections: [{ title: "Tell us what changed", description: "A few minutes from you, and we can show other people what this work actually does.", fields: [
          { key: "first_name", label: "First name", type: "text", required: true, maps_to: "clients.first_name" },
          { key: "last_name", label: "Last name", type: "text", maps_to: "clients.last_name" },
          { key: "email", label: "Email", type: "email", required: true, maps_to: "clients.email" },
          { key: "role", label: "Your role and company", type: "text", help: "How you'd like to be named when we quote you." },
          { key: "before", label: "Where were you before we started?", type: "textarea", required: true },
          { key: "after", label: "Where are you now?", type: "textarea", required: true },
          { key: "quote", label: "If you had one line to say about the work, what would it be?", type: "textarea" },
          { key: "rating", label: "How likely are you to recommend us?", type: "select",
            options: ["5 — Without hesitation", "4 — Very likely", "3 — Maybe", "2 — Unlikely", "1 — No"] },
          { key: "permission", label: "You can use my words and name publicly.", type: "checkbox" },
        ]}],
      };

    default: // discovery-call
      return {
        submit_label: "Request a call",
        sections: [{ title: "Tell us about your business", fields: [
          { key: "first_name", label: "First name", type: "text", required: true, maps_to: "clients.first_name" },
          { key: "last_name", label: "Last name", type: "text", required: true, maps_to: "clients.last_name" },
          { key: "email", label: "Email", type: "email", required: true, maps_to: "clients.email" },
          { key: "phone", label: "Phone", type: "tel", maps_to: "clients.phone" },
          { key: "business_name", label: "Business name", type: "text", maps_to: "businesses.legal_name" },
          { key: "what_you_do", label: "What do you do, and who for?", type: "textarea", required: true },
          { key: "biggest_obstacle", label: "What's the one thing in the way right now?", type: "textarea", required: true },
          { key: "timeline", label: "When do you want to move on this?", type: "select",
            options: ["Right away", "In the next 30 days", "This quarter", "Just exploring for now"] },
        ]}],
      };
  }
}
