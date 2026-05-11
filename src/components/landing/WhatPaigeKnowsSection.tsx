import { Badge } from "@/components/ui/badge";

const capabilities = [
  "Three-Bureau Credit Analysis",
  "FICO Score Optimization",
  "Credit Score Simulator",
  "BRRRR Strategy",
  "DSCR Loan Intelligence",
  "Hard Money Financing",
  "SBA Loan Programs",
  "8(a) Business Certification",
  "HUBZone Eligibility",
  "WOSB Programs",
  "Veteran Business Programs",
  "FDIC Lender Search",
  "NCUA Credit Union Search",
  "Live Interest Rate Data",
  "Entity Structure Strategy",
  "HoldCo and OpCo Architecture",
  "Debt Concentration Analysis",
  "Capital Multiplication",
  "Expense Optimization",
  "Credit Card Float Strategy",
  "Working Capital Coaching",
  "Payroll Platform Guidance",
  "CAC and LTV Analysis",
  "Break-Even Calculation",
  "Bank Statement Loans",
  "Gig Worker Financing",
  "Minority Business Programs",
  "MBDA Business Centers",
  "CDFI Lenders",
  "Predictive Credit Intelligence",
  "Document Ingestion",
  "Voice Conversations",
  "Funding Journey Tracking",
  "Denial Letter Analysis",
  "Goal Discovery Coaching",
];

export function WhatPaigeKnowsSection() {
  return (
    <section className="py-20 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12 max-w-3xl mx-auto">
          <Badge className="mb-4 bg-gold/10 text-gold-dark border-gold/20">
            The Knowledge Stack
          </Badge>
          <h2 className="text-4xl lg:text-5xl font-bold mb-4">
            One Ecosystem.{" "}
            <span className="text-accent font-extrabold">Every Lever.</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            Trained across the full spectrum of credit, capital, real estate,
            entity strategy, and operator psychology — so the answer you need
            is always inside the system, not somewhere on the internet.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-2.5 max-w-5xl mx-auto">
          {capabilities.map((cap) => (
            <span
              key={cap}
              className="inline-flex items-center px-4 py-2 rounded-full text-sm font-medium bg-primary text-gold border border-gold/30 hover:border-gold hover:shadow-glow transition-all duration-300"
            >
              {cap}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
