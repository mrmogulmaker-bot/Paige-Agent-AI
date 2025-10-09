import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Shield, TrendingUp, Award, CheckCircle, Sparkles } from "lucide-react";
import heroImage from "@/assets/hero-bg.jpg";

const Index = () => {
  const navigate = useNavigate();

  const accelSteps = [
    { letter: "A", title: "Audit", description: "Review credit reports from all three bureaus" },
    { letter: "C", title: "Correct", description: "Dispute inaccuracies with FCRA-compliant letters" },
    { letter: "C", title: "Consolidate", description: "Optimize accounts and utilization ratios" },
    { letter: "E", title: "Expand", description: "Add positive credit history strategically" },
    { letter: "L", title: "Leverage", description: "Unlock funding readiness and approvals" },
  ];

  const buildSteps = [
    { letter: "B", title: "Base Setup", description: "Establish business identity and compliance" },
    { letter: "U", title: "Utilize", description: "Access Net-30 vendor tradelines" },
    { letter: "I", title: "Increase", description: "Diversify credit mix and depth" },
    { letter: "L", title: "Leverage", description: "Monitor and optimize business reports" },
    { letter: "D", title: "Deploy", description: "Access funding and scale operations" },
  ];

  const features = [
    {
      icon: Shield,
      title: "FCRA Compliant",
      description: "Automated dispute generation following federal regulations",
    },
    {
      icon: TrendingUp,
      title: "Real-Time Monitoring",
      description: "Track progress across all three credit bureaus",
    },
    {
      icon: Award,
      title: "Fundability Score",
      description: "Know exactly when you're ready for business funding",
    },
    {
      icon: Sparkles,
      title: "Paige AI Coach",
      description: "Personalized guidance every step of your journey",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div 
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `url(${heroImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/50 to-background" />
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 sm:py-32">
          <div className="text-center space-y-8">
            <div className="inline-block">
              <p className="text-primary font-semibold tracking-wide uppercase text-sm mb-4">
                Mogul Maker Academy
              </p>
            </div>
            
            <h1 className="text-5xl sm:text-7xl font-bold tracking-tight">
              Master Your{" "}
              <span className="bg-gradient-gold bg-clip-text text-transparent">
                Credit Journey
              </span>
            </h1>
            
            <p className="max-w-2xl mx-auto text-xl text-muted-foreground">
              Transform damaged credit into fundable status with our proven A.C.C.E.L. and B.U.I.L.D. 
              frameworks, guided by AI-powered coaching.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
              <Button 
                variant="gold" 
                size="lg"
                onClick={() => navigate("/dashboard")}
                className="group"
              >
                Launch Dashboard
                <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button variant="outline" size="lg">
                Learn More
              </Button>
            </div>

            <div className="flex items-center justify-center gap-8 pt-8 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-success" />
                <span className="text-muted-foreground">FCRA Compliant</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-success" />
                <span className="text-muted-foreground">AI-Powered</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-success" />
                <span className="text-muted-foreground">Proven Results</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-gradient-subtle">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">
              Everything You Need to{" "}
              <span className="bg-gradient-gold bg-clip-text text-transparent">
                Succeed
              </span>
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Comprehensive tools and guidance for complete credit transformation
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <Card 
                key={index} 
                className="p-6 bg-card border-border shadow-card hover:shadow-glow transition-all duration-300"
              >
                <div className="p-3 bg-primary/10 rounded-lg w-fit mb-4">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                <p className="text-muted-foreground text-sm">{feature.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* A.C.C.E.L. Framework */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">
              The <span className="bg-gradient-gold bg-clip-text text-transparent">A.C.C.E.L.</span> Framework
            </h2>
            <p className="text-muted-foreground text-lg">
              Your systematic path to credit repair and restoration
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            {accelSteps.map((step, index) => (
              <Card 
                key={index}
                className="p-6 bg-card border-border shadow-card text-center hover:border-primary transition-all duration-300"
              >
                <div className="w-16 h-16 bg-gradient-gold rounded-full flex items-center justify-center mx-auto mb-4 font-bold text-2xl text-primary-foreground">
                  {step.letter}
                </div>
                <h3 className="font-bold text-lg mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* B.U.I.L.D. Framework */}
      <section className="py-20 bg-gradient-subtle">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">
              The <span className="bg-gradient-gold bg-clip-text text-transparent">B.U.I.L.D.</span> Framework
            </h2>
            <p className="text-muted-foreground text-lg">
              Build business credit and unlock funding opportunities
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            {buildSteps.map((step, index) => (
              <Card 
                key={index}
                className="p-6 bg-card border-border shadow-card text-center hover:border-primary transition-all duration-300"
              >
                <div className="w-16 h-16 bg-gradient-gold rounded-full flex items-center justify-center mx-auto mb-4 font-bold text-2xl text-primary-foreground">
                  {step.letter}
                </div>
                <h3 className="font-bold text-lg mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Card className="p-12 bg-gradient-subtle border-primary/20 shadow-glow">
            <h2 className="text-4xl font-bold mb-4">
              Ready to Transform Your{" "}
              <span className="bg-gradient-gold bg-clip-text text-transparent">
                Financial Future?
              </span>
            </h2>
            <p className="text-muted-foreground text-lg mb-8 max-w-2xl mx-auto">
              Join Mogul Maker Academy mentees who are mastering their credit and unlocking 
              funding opportunities with Paige AI.
            </p>
            <Button 
              variant="gold" 
              size="lg"
              onClick={() => navigate("/dashboard")}
              className="text-lg px-10"
            >
              Get Started Now
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </Card>
        </div>
      </section>
    </div>
  );
};

export default Index;
