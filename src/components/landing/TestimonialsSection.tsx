import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Quote } from "lucide-react";

const testimonials = [
  {
    quote:
      "Paige helped me understand exactly what score I needed for my first DSCR loan and built me a 90-day roadmap to get there. I closed on my first rental property 4 months after joining.",
    name: "[Client name]",
    role: "Real Estate Investor",
    location: "Atlanta, GA",
  },
  {
    quote:
      "I had no idea I qualified for the 8(a) program until Paige flagged it. That certification opened doors to federal contracts I never knew existed.",
    name: "[Client name]",
    role: "Business Owner",
    location: "[City, State]",
  },
  {
    quote:
      "The entity structure coaching alone was worth 10x the subscription price. Paige caught that I was concentrating too much debt in one LLC before it became a problem.",
    name: "[Client name]",
    role: "Entrepreneur",
    location: "[City, State]",
  },
];

export function TestimonialsSection() {
  return (
    <section className="py-20 bg-primary text-primary-foreground relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-primary/90" />
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-gold/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <Badge className="mb-4 bg-gold/20 text-gold border-gold/30">
            Sample Testimonials — Replace with Real Ones
          </Badge>
          <h2 className="text-4xl lg:text-5xl font-bold mb-4">
            Built for the Entrepreneur Who Is{" "}
            <span className="text-gold font-extrabold">Done Waiting</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((t, i) => (
            <Card
              key={i}
              className="p-7 bg-primary-foreground/5 border-gold/20 backdrop-blur-sm hover:border-gold/40 hover:shadow-glow transition-all duration-300"
            >
              <Quote className="w-8 h-8 text-gold mb-4 opacity-70" />
              <p className="text-primary-foreground/90 leading-relaxed text-sm mb-6">
                "{t.quote}"
              </p>
              <div className="pt-4 border-t border-gold/20">
                <div className="font-bold text-gold text-sm">{t.name}</div>
                <div className="text-xs text-primary-foreground/70 mt-0.5">
                  {t.role} — {t.location}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
