import type { Playbook } from "./types";

// ---------------------------------------------------------------------------
// Playbook presets — the starter vertical library.
// ---------------------------------------------------------------------------
// generalDefault is the truly vertical-NEUTRAL baseline every tenant inherits
// until they pick or author their own — it never says "coach" (§2: don't
// over-narrow to coaching). coachingDefault is one preset among the verticals
// (fitness, consult, agency) that show how one product goes native to many
// niches — the seed of the library a new tenant picks from at onboarding (§7/§8).
//
// Coaching/consulting-ops voice only (§2/§3): no credit / funding / finance
// language anywhere.

/** Shared, generic client-portal modules — no vertical assumptions. */
const GENERIC_MODULES = [
  { key: "home", label: "Home" },
  { key: "sessions", label: "Sessions" },
  { key: "progress", label: "Progress" },
  { key: "messages", label: "Messages" },
  { key: "resources", label: "Resources" },
  { key: "billing", label: "Billing" },
];

/**
 * The vertical-neutral baseline. This is what a tenant inherits before they pick
 * or author a Playbook, and the fallback for any unconfigured/malformed case —
 * so no tenant ever ships a client-facing Paige that calls their business a
 * "coach" (§2). Consultants, agencies, advisors, creators all read cleanly.
 */
export const generalDefault: Playbook = {
  slug: "general",
  name: "General Practice",
  vertical: "Client-based practice",
  persona: {
    name: "Paige",
    role: "your team's assistant",
    greeting:
      "Hi — I'm Paige, and I work alongside your team to keep things moving between touchpoints. What can I help you with today?",
    tone: "warm, direct, professional",
    domain: "your practice",
  },
  quickActions: [
    { label: "My next steps", prompt: "What should I focus on next?" },
    { label: "Book a time", prompt: "Help me schedule my next session" },
    { label: "My progress", prompt: "Show me where things stand" },
    { label: "Ask a question", prompt: "I have a question about my account" },
  ],
  probingQuestions: [
    { id: "goal", ask: "What's the main outcome you're working toward right now?", captures: "primary_goal" },
    { id: "timeline", ask: "What timeline are you hoping to hit that on?", captures: "timeline" },
    { id: "obstacle", ask: "What's the biggest thing getting in your way?", captures: "biggest_obstacle" },
  ],
  journey: [
    { key: "onboarding", label: "Onboarding", description: "Getting set up and aligned." },
    { key: "getting_started", label: "Getting Started", description: "First steps and quick wins." },
    { key: "in_progress", label: "In Progress", description: "Doing the work between touchpoints." },
    { key: "milestone", label: "Milestone", description: "A meaningful result reached." },
    { key: "ongoing", label: "Ongoing", description: "Sustained progress and renewal." },
  ],
  intake: [
    { key: "full_name", label: "Full name", type: "text", required: true },
    { key: "email", label: "Email", type: "text", required: true },
    { key: "phone", label: "Phone", type: "phone" },
    { key: "primary_goal", label: "What are you hoping to achieve?", type: "longtext", required: true },
    { key: "timeline", label: "Timeline", type: "select", options: ["ASAP", "1–3 months", "3–6 months", "6+ months"] },
  ],
  portal: { modules: GENERIC_MODULES },
};

export const coachingDefault: Playbook = {
  slug: "coaching-default",
  name: "General Coaching",
  vertical: "General coaching",
  persona: {
    name: "Paige",
    role: "your coach's assistant",
    greeting:
      "Hey — I'm Paige, and I work alongside your coach to keep you moving between sessions. What can I help you with today?",
    tone: "warm, direct, encouraging",
    domain: "coaching",
  },
  quickActions: [
    { label: "My next steps", prompt: "What should I focus on next?" },
    { label: "Book a session", prompt: "Help me schedule my next session" },
    { label: "My progress", prompt: "Show me how I'm progressing toward my goals" },
    { label: "Ask a question", prompt: "I have a question about my program" },
  ],
  probingQuestions: [
    { id: "goal", ask: "What's the main outcome you're working toward right now?", captures: "primary_goal" },
    { id: "timeline", ask: "What timeline are you hoping to hit that on?", captures: "timeline" },
    { id: "obstacle", ask: "What's the biggest thing getting in your way?", captures: "biggest_obstacle" },
    { id: "commitment", ask: "How much time can you realistically put in each week?", captures: "weekly_commitment" },
  ],
  journey: [
    { key: "onboarding", label: "Onboarding", description: "Getting set up and aligned on goals." },
    { key: "getting_started", label: "Getting Started", description: "First steps and quick wins." },
    { key: "in_progress", label: "In Progress", description: "Doing the work between sessions." },
    { key: "milestone", label: "Milestone", description: "A meaningful result reached." },
    { key: "ongoing", label: "Ongoing", description: "Sustained progress and renewal." },
  ],
  intake: [
    { key: "full_name", label: "Full name", type: "text", required: true },
    { key: "email", label: "Email", type: "text", required: true },
    { key: "phone", label: "Phone", type: "phone" },
    { key: "primary_goal", label: "What are you hoping to achieve?", type: "longtext", required: true },
    { key: "timeline", label: "Timeline", type: "select", options: ["ASAP", "1–3 months", "3–6 months", "6+ months"] },
    { key: "biggest_obstacle", label: "What's getting in your way?", type: "longtext" },
    { key: "experience_level", label: "Experience level", type: "select", options: ["Just starting", "Some experience", "Very experienced"] },
  ],
  portal: { modules: GENERIC_MODULES },
};

export const fitnessCoach: Playbook = {
  slug: "fitness",
  name: "Fitness Coaching",
  vertical: "Fitness & wellness coaching",
  persona: {
    name: "Paige",
    role: "your coach's training assistant",
    greeting:
      "Hey! I'm Paige, working with your coach to keep your training on track. How did this week go — and what do you need from me?",
    tone: "energetic, supportive, accountable",
    domain: "fitness coaching",
  },
  quickActions: [
    { label: "Log this week", prompt: "I want to log how my training and nutrition went this week" },
    { label: "My program", prompt: "Show me my current training program" },
    { label: "Book a check-in", prompt: "Help me schedule my next check-in" },
    { label: "I'm struggling", prompt: "I'm having a hard time staying consistent — can you help?" },
  ],
  probingQuestions: [
    { id: "goal", ask: "What's your main goal right now — strength, fat loss, endurance, or something else?", captures: "fitness_goal" },
    { id: "adherence", ask: "How consistent were you with training and nutrition this week?", captures: "adherence" },
    { id: "nutrition", ask: "How's your nutrition feeling lately — dialed in, or a struggle?", captures: "nutrition_status" },
    { id: "constraints", ask: "Any injuries, schedule limits, or things I should factor in?", captures: "constraints" },
  ],
  journey: [
    { key: "assessment", label: "Assessment", description: "Baseline, goals, and constraints." },
    { key: "program", label: "Program", description: "Training and nutrition plan built." },
    { key: "check_ins", label: "Check-ins", description: "Weekly adherence and adjustments." },
    { key: "progress", label: "Progress", description: "Measurable results tracked." },
    { key: "maintenance", label: "Maintenance", description: "Sustained habits and renewal." },
  ],
  intake: [
    { key: "full_name", label: "Full name", type: "text", required: true },
    { key: "email", label: "Email", type: "text", required: true },
    { key: "fitness_goal", label: "Your main goal", type: "longtext", required: true },
    { key: "current_activity", label: "Current activity level", type: "select", options: ["Sedentary", "Lightly active", "Active", "Very active"] },
    { key: "injuries", label: "Any injuries or limitations?", type: "longtext" },
    { key: "training_days", label: "Days per week you can train", type: "number" },
  ],
  portal: {
    modules: [
      { key: "home", label: "Home" },
      { key: "program", label: "My Program" },
      { key: "check_ins", label: "Check-ins" },
      { key: "progress", label: "Progress" },
      { key: "messages", label: "Messages" },
      { key: "billing", label: "Billing" },
    ],
  },
};

export const businessConsultant: Playbook = {
  slug: "consultant",
  name: "Business Consulting",
  vertical: "Business & strategy consulting",
  persona: {
    name: "Paige",
    role: "your consultant's engagement assistant",
    greeting:
      "Hi — I'm Paige, working alongside your consultant to keep the engagement moving. What do you need to make progress on today?",
    tone: "sharp, professional, proactive",
    domain: "business consulting",
  },
  quickActions: [
    { label: "Engagement status", prompt: "Where are we in the engagement and what's next?" },
    { label: "Share an update", prompt: "I have an update on our progress to share" },
    { label: "Flag a blocker", prompt: "Something is blocking us — I need to flag it" },
    { label: "Book a working session", prompt: "Help me schedule our next working session" },
  ],
  probingQuestions: [
    { id: "objective", ask: "What's the core outcome this engagement needs to deliver?", captures: "objective" },
    { id: "stakeholders", ask: "Who are the key stakeholders and decision-makers involved?", captures: "stakeholders" },
    { id: "blockers", ask: "What's the biggest thing currently blocking progress?", captures: "blockers" },
    { id: "metrics", ask: "How will we know this worked — what does success look like in numbers?", captures: "success_metrics" },
  ],
  journey: [
    { key: "discovery", label: "Discovery", description: "Scope, stakeholders, and objectives." },
    { key: "engagement", label: "Engagement", description: "Active delivery of the work." },
    { key: "delivery", label: "Delivery", description: "Outputs and recommendations delivered." },
    { key: "review", label: "Review", description: "Results reviewed against goals." },
    { key: "retainer", label: "Retainer", description: "Ongoing advisory relationship." },
  ],
  intake: [
    { key: "full_name", label: "Full name", type: "text", required: true },
    { key: "email", label: "Email", type: "text", required: true },
    { key: "company", label: "Company", type: "text" },
    { key: "objective", label: "What outcome are you hiring us to deliver?", type: "longtext", required: true },
    { key: "timeline", label: "Timeline", type: "select", options: ["ASAP", "This quarter", "Next quarter", "Exploratory"] },
    { key: "success_metrics", label: "How will you measure success?", type: "longtext" },
  ],
  portal: {
    modules: [
      { key: "home", label: "Home" },
      { key: "engagement", label: "Engagement" },
      { key: "deliverables", label: "Deliverables" },
      { key: "sessions", label: "Sessions" },
      { key: "messages", label: "Messages" },
      { key: "billing", label: "Billing" },
    ],
  },
};

export const marketingAgency: Playbook = {
  slug: "agency",
  name: "Marketing Agency",
  vertical: "Marketing & creative agency",
  persona: {
    name: "Paige",
    role: "your account assistant",
    greeting:
      "Hey — I'm Paige, your account assistant. I keep your campaigns, assets, and approvals moving. What can I get rolling for you?",
    tone: "creative, responsive, on-it",
    domain: "marketing agency",
  },
  quickActions: [
    { label: "Campaign status", prompt: "What's the status of my campaigns right now?" },
    { label: "Approve work", prompt: "Show me what's waiting for my approval" },
    { label: "Send assets", prompt: "I need to send over assets or brand materials" },
    { label: "Request something", prompt: "I'd like to request a new piece of work" },
  ],
  probingQuestions: [
    { id: "goal", ask: "What's the main result you want these campaigns to drive?", captures: "campaign_goal" },
    { id: "channels", ask: "Which channels matter most to you right now?", captures: "channels" },
    { id: "budget", ask: "What monthly budget are we working with?", captures: "budget" },
    { id: "assets", ask: "What brand assets and access do you already have ready for us?", captures: "assets" },
  ],
  journey: [
    { key: "onboarding", label: "Onboarding", description: "Access, brand, and goals gathered." },
    { key: "strategy", label: "Strategy", description: "Plan and channels defined." },
    { key: "launch", label: "Launch", description: "Campaigns live." },
    { key: "optimize", label: "Optimize", description: "Testing and iteration." },
    { key: "report", label: "Report", description: "Results reported and renewed." },
  ],
  intake: [
    { key: "full_name", label: "Full name", type: "text", required: true },
    { key: "email", label: "Email", type: "text", required: true },
    { key: "brand", label: "Brand / company", type: "text" },
    { key: "campaign_goal", label: "What result do you want to drive?", type: "longtext", required: true },
    { key: "channels", label: "Priority channels", type: "text" },
    { key: "budget", label: "Monthly budget", type: "select", options: ["< $2k", "$2k–$5k", "$5k–$15k", "$15k+"] },
  ],
  portal: {
    modules: [
      { key: "home", label: "Home" },
      { key: "campaigns", label: "Campaigns" },
      { key: "approvals", label: "Approvals" },
      { key: "assets", label: "Assets" },
      { key: "messages", label: "Messages" },
      { key: "billing", label: "Billing" },
    ],
  },
};

/** The starter Playbook library a tenant picks from at onboarding. */
export const PLAYBOOK_LIBRARY: Playbook[] = [
  generalDefault,
  coachingDefault,
  fitnessCoach,
  businessConsultant,
  marketingAgency,
];
