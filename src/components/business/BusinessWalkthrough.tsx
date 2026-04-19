import {
  Building2,
  Globe,
  BarChart3,
  FileText,
  Award,
  ShieldCheck,
  Layers,
  TrendingUp,
} from "lucide-react";
import { PageWalkthrough, type WalkthroughStep } from "@/components/common/PageWalkthrough";

const STEPS: WalkthroughStep[] = [
  {
    num: 1,
    icon: Building2,
    title: "Lock in your Foundation",
    what: "Verify your legal name, EIN, business address, phone, NAICS code, and entity type. This is the data every bureau and lender pulls first.",
    why: "One mismatch between your IRS record, Secretary of State filing, and bank account is the #1 reason new businesses get auto-declined. Foundation must be 100% before anything else.",
    hack: "Use a real commercial address (not a UPS box, not your home) and a 411-listed business phone. D&B and Experian Business penalize residential addresses and unlisted numbers.",
  },
  {
    num: 2,
    icon: Globe,
    title: "Build your Public Presence",
    what: "Claim Google Business Profile, list on Yelp, set up a real website with matching name/address/phone (NAP), and verify socials. We track which listings match.",
    why: "Lenders Google your business before they fund it. No web presence = perceived as a shell company. Inconsistent NAP across listings tanks your fundability score before a human ever reviews you.",
  },
  {
    num: 3,
    icon: BarChart3,
    title: "Register with all 3 business bureaus",
    what: "Get your DUNS (D&B), Experian Business profile, and Equifax Business profile active in Week 1. Track PAYDEX, Intelliscore, and Equifax payment index here.",
    why: "Business credit doesn't auto-report like personal. You have to register, then send payments to vendors who report. No bureau profile = no business credit = no EIN-only funding.",
    hack: "Register all 3 the same week you form. The DUNS application is free — never pay D&B's $229 'expedite' fee.",
  },
  {
    num: 4,
    icon: FileText,
    title: "Upload your Financial Docs",
    what: "Articles of Incorporation, EIN letter (CP-575), Operating Agreement, business bank statements (last 3–6 months), and most recent tax return.",
    why: "Every lender past Tier 1 vendor credit asks for these. Having them organized here means you respond to funding requests in minutes, not days — speed wins approvals.",
  },
  {
    num: 5,
    icon: Layers,
    title: "Run the BUILD Business Program",
    what: "The 18-month roadmap: Base → Utilize → Integrate → Leverage → Dominate. Each phase tells you which vendor accounts to open, when to apply for store credit, and when to graduate to bank lines.",
    why: "Skip a phase and you'll get denied. The order matters — Tier 1 vendors (Uline, Quill, Grainger) build your PAYDEX so Tier 2 store cards (Home Depot, Amazon) approve you, which then unlocks Tier 3 bank lines.",
    hack: "5 reporting Tier 1 vendors with on-time payments for 60+ days is the magic threshold to unlock Tier 2 store credit. Don't apply for store cards before that — you'll just collect denials.",
  },
  {
    num: 6,
    icon: ShieldCheck,
    title: "Pass the Personal/Business Separation Audit",
    what: "We check that your business has its own EIN, bank account, phone, address, and credit profile — completely separated from your personal SSN.",
    why: "Co-mingled finances = lenders treat it as a sole proprietorship and pull your personal credit for everything. Full separation is what unlocks EIN-only funding (no PG required).",
  },
  {
    num: 7,
    icon: TrendingUp,
    title: "Track your Build Score & Tier",
    what: "Your overall fundability is scored 0–100 across foundation, public presence, bureau health, financial docs, and program progress. Each phase unlocks a new funding tier.",
    why: "This is the number lenders effectively see. Hit 80+ and you're in the zone where banks, SBA, and revenue-based lenders start saying yes to EIN-only deals.",
  },
  {
    num: 8,
    icon: Award,
    title: "Graduate to the FUND program",
    what: "Once your Build Score hits the threshold, the funding marketplace opens up — bank lines of credit, SBA loans, equipment financing, revenue-based capital.",
    why: "BUILD makes you fundable. FUND turns that fundability into actual capital in your account. Don't skip ahead — applying before you're ready burns inquiries and kills your scores.",
  },
];

export function BusinessWalkthrough() {
  return (
    <PageWalkthrough
      storageKey="business_walkthrough_dismissed_v1"
      title="How to use this page"
      steps={STEPS}
    />
  );
}
