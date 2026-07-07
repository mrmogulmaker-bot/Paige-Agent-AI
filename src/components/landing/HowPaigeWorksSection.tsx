import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Search, Map, ArrowRight } from "lucide-react";

const steps = [
  {
    icon: MessageCircle,
    n: "01",
    title: "Define the Mission",
    body: "Every operator moves with intent. Paige starts by mapping your real objective — the clients you're serving, the offers you're launching, the workflows you're scaling — and aligns your entire operation to it.",
  },
  {
    icon: Search,
    n: "02",
    title: "Read the Landscape",
    body: "Client activity, pipeline signals, team workload, engagement patterns — Paige analyzes the full operating picture across every data layer to surface what actually moves the needle.",
  },
  {
    icon: Map,
    n: "03",
    title: "Engineer the Path",
    body: "Not generic advice. A precision playbook — which clients to prioritize, which messages to send, which processes to automate, which actions in what order — built around how you actually operate.",
  },
  {
    icon: ArrowRight,
    n: "04",
    title: "Execute With Momentum",
    body: "Paige stays in motion with you — adapting as your business evolves, surfacing new opportunities, and keeping you accountable to the next move that compounds.",
  },
];

export function HowPaigeWorksSection() {
  return (
    <section id="how-paige-works" className="py-20 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14 max-w-3xl mx-auto">
          <Badge className="mb-4 bg-accent/10 text-accent border-accent/20">
            How It Works
          </Badge>
          <h2 className="text-4xl lg:text-5xl font-bold mb-4">
            Strategy. Execution.{" "}
            <span className="text-accent font-extrabold">Scale.</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            Paige isn't a chatbot answering questions. It's an intelligent
            operating system engineered around how serious operators
            actually build, run, and scale their businesses.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((s, i) => (
            <Card
              key={i}
              className="relative p-6 bg-card border-border hover:border-accent/50 hover:shadow-glow transition-all duration-300 group"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-gradient-gold flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <s.icon className="w-5 h-5 text-primary" strokeWidth={2.25} />
                </div>
                <span className="text-3xl font-extrabold text-accent/30 tabular-nums">
                  {s.n}
                </span>
              </div>
              <h3 className="font-bold text-lg mb-2 text-foreground">
                {s.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {s.body}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
