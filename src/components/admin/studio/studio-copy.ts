// Every operator-facing string in the Vibe Studio, in one file.
//
// This ships to EVERY tenant by default, so it is the most doctrine-exposed surface in the
// Studio and it lives alone so the §2/§3 audit has exactly one place to read.
//
//   §2  — the audience is client-based service businesses: coaches AND consultants, agencies,
//         advisors, thought leaders. The seed briefs are written so each of them sees
//         themselves. ZERO credit / funding / lending / financing wording — a tenant may
//         CHOOSE to author a funding page, but the platform default must never suggest one.
//   §3  — direct, confident, mogul-founder. Never "AI-powered", "streamline", "seamless",
//         "empower".
//   §11 — no backend codes, table names, or function names ever reach the operator. The error
//         map below is what converts a raw server raise into a sentence they can act on.
//   §15 — the seed briefs are REAL, usable briefs. Not lorem, not [PLACEHOLDER].
import type { GrowthBlock } from "@/lib/growth";
import type { GenerationPhase, IntentChip, StudioErrorCode } from "./studio-types";

/** The narration for each phase of a run. Every line names work that actually happens —
 *  the phase ticker is not decoration, it is a report (§13). */
export const GENERATION_NOTES: Record<Exclude<GenerationPhase, "idle">, string> = {
  brief: "Reading your brief.",
  brand: "Pulling your brand — colors, type, logo.",
  drafting: "Writing the page.",
  validating: "Checking every section holds up.",
  composing: "Painting the canvas.",
  done: "Done.",
  error: "That didn't land.",
};

/**
 * Six starting briefs. Clicking one REPLACES the composer's text with the full brief, which
 * the operator then edits until it's theirs — there is no hidden template behind the chip.
 *
 * They are deliberately spread across the audience (§2): a coach running a masterclass, a
 * consultant selling calls, an agency owner giving away a checklist, a program operator, a
 * practice with a waitlist, a thought leader running a room. Each one models what a GOOD
 * brief looks like — the offer, who it's for, and the one action — because the quality of the
 * brief is the quality of the first draft.
 */
export const INTENT_CHIPS: IntentChip[] = [
  {
    id: "webinar-registration",
    label: "Webinar registration",
    seed:
      "A registration page for a live 60-minute masterclass I'm teaching for founders and " +
      "operators whose client follow-up keeps falling through the cracks. Say what they walk " +
      "away with, the three things we work through live, and why I'm the one teaching it. One " +
      "action: save a seat — name and email. I'll drop in the date and time before it goes out.",
  },
  {
    id: "strategy-call",
    label: "Strategy call",
    seed:
      "A page that books strategy calls with me. It's for consultants and agency owners who are " +
      "booked out but still doing every piece of delivery themselves. Cover what the call " +
      "actually covers, who it's for, who it isn't for, and what happens after it. One action: " +
      "request a call — name, email, and what they're working on right now.",
  },
  {
    id: "lead-magnet",
    label: "Lead magnet",
    seed:
      "A download page for my client-onboarding checklist — the exact steps my team runs in the " +
      "first two weeks of a new engagement. It's for practice and agency owners whose onboarding " +
      "comes out different every single time. Say what's inside, why it works, and who it's for. " +
      "One action: get the checklist — name and email.",
  },
  {
    id: "program-sales",
    label: "Program sales page",
    seed:
      "A sales page for my 12-week group program for coaches and advisors who want a repeatable " +
      "client process instead of running the whole practice on instinct. Cover the outcome, the " +
      "week-by-week arc, who it's for, what's included, and the pricing. Answer the three " +
      "objections I get every time. One action: apply.",
  },
  {
    id: "client-waitlist",
    label: "Client waitlist",
    seed:
      "A waitlist page for my next intake. I take a handful of clients at a time and the next " +
      "group opens soon, so make the scarcity honest — no fake countdown. Say what working with " +
      "me actually looks like week to week and who I do my best work with. One action: join the " +
      "waitlist — name, email, and what they need help with.",
  },
  {
    id: "workshop-event",
    label: "Workshop or event",
    seed:
      "An event page for a half-day in-person workshop, one small room of operators and advisors. " +
      "Cover the agenda, what they leave with, how small the room is, and why it's worth a day " +
      "away from the business. One action: request an invite — name, email, and company. I'll add " +
      "the venue and the date before I publish.",
  },
];

/** The human name for every block type. The operator never sees a backend type string (§11).
 *  Covers all 17 variants — TypeScript enforces that here. */
export const BLOCK_LABELS: Record<GrowthBlock["type"], string> = {
  hero: "Hero",
  phase_cards: "Phases",
  feature_grid: "Features",
  cta: "Call to action",
  rich_text: "Text",
  embedded_form: "Signup form",
  social_proof: "Logos",
  testimonial: "Testimonials",
  pricing: "Pricing",
  faq: "FAQ",
  media: "Video",
  stats: "Stats",
  countdown: "Countdown",
  two_column: "Split section",
  image: "Image",
  gallery: "Gallery",
  steps: "Steps",
};

/**
 * The translation layer between the server and the operator.
 *
 * The publish RPC raises hard, specific errors — unresolved placeholders, a signup section
 * with no live form behind it, a workspace with no public address. Those raises are precise
 * and they are ALSO full of machinery the operator must never see. Every one of them lands
 * here and leaves as a sentence that says what happened and what to do next (§11/§13).
 */
export const STUDIO_ERROR_COPY: Record<StudioErrorCode, string> = {
  NO_TENANT: "Pick a workspace first.",
  NO_TENANT_SLUG:
    "This workspace has no public web address yet. Set one in your brand settings, then publish.",
  EMPTY_BRIEF:
    "Tell Paige what the page is for — the offer, who it's for, and the action you want.",
  GENERATION_FAILED:
    "Paige couldn't draft the page. Try again, or add a little more detail to the brief.",
  GENERATION_CANCELLED: "Stopped. Nothing was changed.",
  INVALID_BLOCKS:
    "One of the sections didn't hold up. Regenerate, or edit that section and try again.",
  NO_DRAFT: "Save the page before publishing it.",
  UNRESOLVED_PLACEHOLDER: "Some sections still have blanks to fill in. Fill them, then publish.",
  FORM_MISSING:
    "The signup form on this page isn't set up yet. Save the page — Paige will build it — then publish.",
  INVALID_SLUG: "Give the page a web address (letters, numbers and dashes).",
  NOT_FOUND: "This page isn't in your workspace.",
  FORBIDDEN: "You don't have access to publish pages here.",
  SAVE_FAILED: "Couldn't save the draft. Try again.",
  PUBLISH_FAILED: "Couldn't publish. Try again.",
  EDIT_FAILED: "Couldn't apply that change. Try rewording it.",
  UNKNOWN: "Something went wrong. Try again.",
};
