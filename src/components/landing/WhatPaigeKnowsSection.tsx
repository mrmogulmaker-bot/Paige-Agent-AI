import { Badge } from "@/components/ui/badge";

const capabilities = [
  "Client Management (CRM)",
  "Pipeline & Deal Tracking",
  "Workflow Automation",
  "AI Advisor & Assistant",
  "Outreach & Message Drafting",
  "Scheduling & Reminders",
  "Task Tracking",
  "Team Collaboration",
  "Role & Permission Management",
  "Analytics & Reporting",
  "Performance Dashboards",
  "Live Business Signals",
  "Process & Playbook Design",
  "Operations Architecture",
  "Workload Analysis",
  "Capacity Planning",
  "Expense Optimization",
  "Resource Planning",
  "Productivity Coaching",
  "Payroll Platform Guidance",
  "CAC and LTV Analysis",
  "Break-Even Calculation",
  "Onboarding Automation",
  "Client Segmentation",
  "Knowledge Base",
  "Document Ingestion",
  "Predictive Business Intelligence",
  "Meeting Summaries",
  "Voice Conversations",
  "Client Journey Tracking",
  "Follow-Up Automation",
  "Goal Discovery Coaching",
  "Integrations Hub",
  "Custom Reporting",
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
            Trained across the full spectrum of client management, workflow
            automation, operations strategy, and operator psychology — so the
            answer you need is always inside the system, not somewhere on the internet.
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
