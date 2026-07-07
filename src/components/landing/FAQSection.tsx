import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    q: "What does Paige actually do?",
    a: "Paige is an AI operating system for client-based businesses — coaches, consultants, and agencies. She handles client management, workflow automation, outreach and message drafting, scheduling, task tracking, and reporting, and acts as an AI advisor that helps you run and scale your operation. Think of her as an always-on AI teammate for the day-to-day work of running your business.",
  },
  {
    q: "How is my data kept secure?",
    a: "Your data is encrypted in transit and at rest, and access is controlled by role-based permissions. We never sell your data or use it to train third-party AI models. Every integration is opt-in, disclosed in plain English, and can be disconnected from your account settings at any time.",
  },
  {
    q: "Can my whole team use Paige?",
    a: "Yes. Paige is built for teams. You can invite teammates, assign tasks and clients, set role-based permissions, and collaborate in a shared workspace — so everyone stays aligned on the same pipeline, playbooks, and priorities.",
  },
  {
    q: "What can Paige connect to?",
    a: "Paige connects to the tools you already use, including Google Calendar for scheduling, email and SMS for outreach and reminders, and accounting tools for performance insights. Every integration is opt-in and requests only the access a given feature requires. See our Integrations section for the full list and the exact scopes.",
  },
  {
    q: "Do I need to be technical to use Paige?",
    a: "Not at all. Paige works through natural conversation and voice — just tell her what you need. She drafts messages, sets up workflows, tracks tasks, and surfaces the next best action, so you get the benefit of automation without building anything yourself.",
  },
  {
    q: "Is there a trial, and what is the Beta founding rate?",
    a: "During Beta launch we are offering reduced pricing that locks in for life as long as your subscription stays active. This is our way of rewarding early members who help us build the best possible platform.",
  },
];

export function FAQSection() {
  return (
    <section className="py-20 bg-background">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <Badge className="mb-4 bg-accent/10 text-accent border-accent/20">
            FAQ
          </Badge>
          <h2 className="text-4xl lg:text-5xl font-bold mb-4">
            What Operators <span className="text-accent">Ask First</span>
          </h2>
        </div>

        <Accordion type="single" collapsible className="w-full space-y-3">
          {faqs.map((f, i) => (
            <AccordionItem
              key={i}
              value={`item-${i}`}
              className="bg-card border border-border rounded-lg px-5 hover:border-accent/40 transition-colors"
            >
              <AccordionTrigger className="text-left font-semibold text-base hover:text-accent hover:no-underline">
                {f.q}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed text-sm">
                {f.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
