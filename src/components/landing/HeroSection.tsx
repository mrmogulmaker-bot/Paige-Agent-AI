import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Play, TrendingUp, Award, DollarSign, Shield, Sparkles, Target } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function HeroSection() {
  const navigate = useNavigate();

  return (
    <section className="relative overflow-hidden py-20 lg:py-32">
      {/* Background gradient - stays behind everything */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-accent/5 to-background -z-20" />
      
      {/* Floating background elements - stays behind all text */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-20 right-1/4 w-72 h-72 bg-accent/10 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-20 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-float-slow" />
      </div>
      
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Column */}
          <div className="space-y-8 animate-fade-in">
            <Badge className="bg-accent/10 text-accent border-accent/20 hover:bg-accent/20 animate-fade-in">
              Trusted by 10,000+ Business Owners
            </Badge>

            <h1 className="text-5xl lg:text-6xl font-bold tracking-tight animate-fade-in" style={{ animationDelay: "0.1s" }}>
              Build Your Business Credit & Access{" "}
              <span className="bg-gradient-hero bg-clip-text text-transparent">
                Capital
              </span>
            </h1>

            <p className="text-xl text-muted-foreground leading-relaxed animate-fade-in" style={{ animationDelay: "0.2s" }}>
              Transform your credit profile and unlock funding opportunities with our proven 
              frameworks. Guided by AI-powered coaching every step of the way.
            </p>

            {/* Benefits */}
            <div className="space-y-3 animate-fade-in" style={{ animationDelay: "0.3s" }}>
              <div className="flex items-center gap-3 hover:translate-x-2 transition-transform duration-300">
                <CheckCircle className="w-5 h-5 text-success flex-shrink-0" />
                <span className="text-foreground">FCRA-compliant credit repair strategies</span>
              </div>
              <div className="flex items-center gap-3 hover:translate-x-2 transition-transform duration-300">
                <CheckCircle className="w-5 h-5 text-success flex-shrink-0" />
                <span className="text-foreground">Build business credit from $0 to fundable</span>
              </div>
              <div className="flex items-center gap-3 hover:translate-x-2 transition-transform duration-300">
                <CheckCircle className="w-5 h-5 text-success flex-shrink-0" />
                <span className="text-foreground">AI coach trained on proven methodologies</span>
              </div>
            </div>

            {/* Social Proof Stats */}
            <div className="grid grid-cols-2 gap-6 py-6 border-t border-border animate-fade-in" style={{ animationDelay: "0.4s" }}>
              <div className="hover-scale cursor-default">
                <div className="text-3xl font-bold text-foreground">120+</div>
                <div className="text-sm text-muted-foreground">Avg Credit Score Increase</div>
              </div>
              <div className="hover-scale cursor-default">
                <div className="text-3xl font-bold text-foreground">89%</div>
                <div className="text-sm text-muted-foreground">Funding Success Rate</div>
              </div>
            </div>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 animate-fade-in" style={{ animationDelay: "0.5s" }}>
              <Button 
                size="lg"
                className="bg-gradient-primary text-primary-foreground hover:opacity-90 hover:scale-105 shadow-glow transition-all duration-300"
                onClick={() => navigate("/dashboard")}
              >
                Start Building Now
              </Button>
              <Button 
                size="lg"
                variant="outline"
                className="group hover:scale-105 transition-all duration-300"
              >
                <Play className="w-4 h-4 mr-2 group-hover:scale-110 transition-transform" />
                Watch Demo
              </Button>
            </div>
          </div>

          {/* Right Column - Dashboard Preview with floating icons */}
          <div className="relative animate-fade-in" style={{ animationDelay: "0.3s" }}>
            {/* Floating badges removed to prevent overlap */}
            {/* Floating badges removed to prevent overlap */}
            
            <Card className="p-6 bg-card border-border shadow-lg relative overflow-hidden hover:shadow-glow-lg transition-shadow duration-500">
              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent pointer-events-none" />
              
              <div className="relative space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Credit Overview</h3>
                  <Badge className="bg-success/10 text-success border-success/20">
                    On Track
                  </Badge>
                </div>

                {/* Floating stat cards */}
                <div className="space-y-4">
                  <Card className="p-4 bg-gradient-to-r from-primary to-primary-light text-primary-foreground shadow-glow animate-fade-in hover:scale-105 transition-all duration-300 cursor-default">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm opacity-90">Personal Credit</div>
                        <div className="text-3xl font-bold mt-1">720</div>
                        <div className="text-xs opacity-75 mt-1 flex items-center gap-1">
                          <TrendingUp className="w-3 h-3" />
                          +45 this month
                        </div>
                      </div>
                      <div className="p-3 bg-primary-foreground/10 rounded-full">
                        <Award className="w-6 h-6" />
                      </div>
                    </div>
                  </Card>

                  <Card className="p-4 bg-gradient-accent text-accent-foreground shadow-glow-lg animate-fade-in hover:scale-105 transition-all duration-300 cursor-default" style={{ animationDelay: "0.1s" }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm opacity-90">Business Credit</div>
                        <div className="text-3xl font-bold mt-1">85</div>
                        <div className="text-xs opacity-75 mt-1 flex items-center gap-1">
                          <TrendingUp className="w-3 h-3" />
                          Excellent
                        </div>
                      </div>
                      <div className="p-3 bg-accent-foreground/10 rounded-full">
                        <TrendingUp className="w-6 h-6" />
                      </div>
                    </div>
                  </Card>

                  <Card className="p-4 bg-gradient-to-r from-success to-success-light text-white shadow-md animate-fade-in hover:scale-105 transition-all duration-300 cursor-default" style={{ animationDelay: "0.2s" }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm opacity-90">Funding Approved</div>
                        <div className="text-3xl font-bold mt-1">$150K</div>
                        <div className="text-xs opacity-75 mt-1">Ready to deploy</div>
                      </div>
                      <div className="p-3 bg-white/10 rounded-full">
                        <DollarSign className="w-6 h-6" />
                      </div>
                    </div>
                  </Card>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}
