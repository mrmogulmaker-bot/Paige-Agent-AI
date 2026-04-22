// About page — describes Project Mogul Enterprise (PME) + PaigeAgent's mission
// and Antonio Cook as founder. Lightweight, marketing-only, no backend.

import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const About = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1">
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <Badge className="mb-4 bg-gold/10 text-gold-dark border-gold/20">
            About PaigeAgent
          </Badge>
          <h1 className="text-4xl lg:text-5xl font-bold mb-6">
            Built by operators, for the next generation of{" "}
            <span className="text-gold">fundable businesses</span>
          </h1>

          <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
            PaigeAgent is a product of <strong>Project Mogul Enterprise Inc.</strong>{" "}
            (PME), an Atlanta-based credit and funding intelligence company on a
            mission to make business funding accessible, transparent, and
            achievable for entrepreneurs the system has historically left
            behind.
          </p>

          <Card className="p-8 mb-10 bg-card border-border">
            <h2 className="text-2xl font-bold mb-4">Our Mission</h2>
            <p className="text-muted-foreground leading-relaxed">
              We believe access to capital shouldn't depend on knowing the
              right person, hiring the right consultant, or guessing the
              right move. Paige is your AI funding advisor — built to give
              every founder the same playbook the well-connected have always
              had.
            </p>
          </Card>

          <Card className="p-8 mb-10 bg-card border-border">
            <h2 className="text-2xl font-bold mb-4">Founder</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              <strong className="text-foreground">Antonio Cook</strong> founded
              Project Mogul Enterprise Inc. after years of helping founders
              and credit-rebuilders navigate a fragmented, advisor-gated
              funding system. PaigeAgent is the AI-first platform he wished
              every entrepreneur had on day one — a strategist, credit coach,
              and funding analyst rolled into one.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Headquartered in Atlanta, Georgia, PME builds tools that turn
              compliance and credit data into confident funding decisions.
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
