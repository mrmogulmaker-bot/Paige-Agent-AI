// About page — coaching-generic platform positioning for PaigeAgent.ai
// (§2/§3/§7/§9): the intelligent, two-way client portal for client-based service
// businesses. Marketing-only, no backend. No finance/credit framing.

import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHead } from "@/components/seo/PageHead";

const About = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PageHead
        title="About PaigeAgent.ai — The Intelligent Client Portal"
        description="PaigeAgent.ai is the intelligent, two-way client portal for coaches, consultants, agencies, and advisors — she reasons, suggests, and acts on client work under your brand."
        path="/about"
      />
      <Header />


      <main className="flex-1">
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <Badge className="mb-4 bg-gold/10 text-gold-dark border-gold/20">
            About PaigeAgent
          </Badge>
          <h1 className="text-4xl lg:text-5xl font-bold mb-6">
            Built by operators, for the businesses that{" "}
            <span className="text-gold">run on client relationships</span>
          </h1>

          <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
            Every competitor sells a client portal — a static filing cabinet.
            PaigeAgent is the portal that <strong>reasons, suggests, and acts</strong>:
            a hyper-personalized assistant that feels like the coach's own, under
            the coach's brand, working two directions at once — for the client and
            for the practice.
          </p>

          <Card className="p-8 mb-10 bg-card border-border">
            <h2 className="text-2xl font-bold mb-4">Our Mission</h2>
            <p className="text-muted-foreground leading-relaxed">
              Coaches, consultants, agencies, and advisors got into this to do the
              work — not to chase follow-ups, rebuild onboarding, and live in ten
              tabs. Paige gives them their time back. She onboards clients, answers
              like a domain expert, flags who's at risk, drafts the next move, and
              takes it — so the practice runs whether or not anyone's at the desk.
            </p>
          </Card>

          <Card className="p-8 mb-10 bg-card border-border">
            <h2 className="text-2xl font-bold mb-4">Founder</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              <strong className="text-foreground">Antonio Cook</strong> built
              PaigeAgent after years running client-based businesses and watching
              great operators lose their nights to admin. He wanted the platform he
              wished he'd had on day one — one that doesn't just store a client's
              file, but understands it and acts on it.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              PaigeAgent is tenant-authored end to end: every coach's Paige is
              native to their own practice — their voice, their playbook, their
              journey — never a hardcoded vertical.
            </p>
          </Card>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-12">
            <Button asChild size="lg" className="bg-gradient-gold">
              <Link to="/auth">Get Started</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href="mailto:support@paigeagent.ai">Contact Us</a>
            </Button>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default About;
