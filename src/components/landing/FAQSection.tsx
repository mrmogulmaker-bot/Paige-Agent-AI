import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    q: "Is Paige a real financial advisor?",
    a: "Paige is an AI-powered financial intelligence platform trained on credit, lending, real estate, and business strategy. She provides education, analysis, and strategy coaching. She is not a licensed financial advisor, attorney, or CPA. For legal and tax matters we always recommend working with licensed professionals — Paige will tell you the same thing.",
  },
  {
    q: "What is the difference between PaigeAgent and a credit repair company?",
    a: "PaigeAgent is a credit building and funding intelligence platform — not a credit repair service. Paige helps you build positive credit, optimize your profile for funding, and access capital. Dispute services for negative items are handled separately by our Mogul Credit AI team.",
  },
  {
    q: "Do I need good credit to start?",
    a: "No. Paige works with clients at every credit starting point. Whether your score is 480 or 740 Paige builds a strategy from where you are today toward where you need to be for your specific goal.",
  },
  {
    q: "How is this different from Credit Karma or Nav?",
    a: "Credit Karma shows you your score and recommends credit cards. Nav shows you business funding options. PaigeAgent gives you an AI advisor who connects your credit profile, your business structure, your funding strategy, and your operational health into one personalized roadmap — then searches for real lenders in real time, coaches your business fundamentals, and tracks your funding journey from first application to capital secured.",
  },
  {
    q: "Can I use Paige if I am self-employed or a gig worker?",
    a: "Absolutely — Paige has specific knowledge for self-employed borrowers including bank statement loan alternatives, quarterly tax planning, income documentation strategy, and lenders who work with non-traditional income. The gig economy creates unique funding challenges and Paige understands them.",
  },
  {
    q: "What is the Beta founding rate?",
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
            Questions About <span className="text-accent">Paige</span>
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
