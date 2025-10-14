import { Card } from "@/components/ui/card";
import { 
  Shield, 
  TrendingUp, 
  Award, 
  Sparkles, 
  FileText, 
  BarChart3,
  Lock,
  Zap
} from "lucide-react";

const features = [
  {
    icon: Shield,
    title: "FCRA Compliant",
    description: "Automated dispute generation following all federal credit reporting regulations for maximum effectiveness.",
  },
  {
    icon: TrendingUp,
    title: "Real-Time Monitoring",
    description: "Track your progress across all three credit bureaus with instant updates and actionable insights.",
  },
  {
    icon: Award,
    title: "Fundability Score",
    description: "Know exactly when you're ready for business funding with our proprietary assessment system.",
  },
  {
    icon: Sparkles,
    title: "PaigeAgent.ai Coach",
    description: "Get personalized guidance powered by AI trained on proven credit repair and business building frameworks.",
  },
  {
    icon: FileText,
    title: "Dispute Automation",
    description: "Generate compliant dispute letters automatically with our proven templates and strategies.",
  },
  {
    icon: BarChart3,
    title: "Progress Analytics",
    description: "Visualize your journey with detailed reports and projections for both personal and business credit.",
  },
  {
    icon: Lock,
    title: "Secure Platform",
    description: "Bank-level encryption protects your sensitive financial and personal information at all times.",
  },
  {
    icon: Zap,
    title: "Fast Results",
    description: "See improvements in as little as 30 days with our accelerated credit optimization strategies.",
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="py-20 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16 animate-fade-in">
          <Badge className="mb-4 bg-accent/10 text-accent border-accent/20">
            Everything You Need
          </Badge>
          <h2 className="text-4xl lg:text-5xl font-bold mb-4 animate-fade-in" style={{ animationDelay: "0.1s" }}>
            Comprehensive Credit{" "}
            <span className="bg-gradient-hero bg-clip-text text-transparent">
              Transformation Tools
            </span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto animate-fade-in" style={{ animationDelay: "0.2s" }}>
            All the features you need to repair credit, build business credit, and access funding
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => (
            <Card 
              key={index}
              className="p-6 bg-card border-border hover:border-accent/50 hover:shadow-glow hover:-translate-y-2 transition-all duration-300 group animate-fade-in cursor-default"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="p-3 bg-gradient-primary rounded-lg w-fit mb-4 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300">
                <feature.icon className="w-6 h-6 text-primary-foreground" />
              </div>
              <h3 className="font-semibold text-lg mb-2 group-hover:text-accent transition-colors duration-300">{feature.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

// Badge component helper (add to exports if needed)
import { Badge } from "@/components/ui/badge";
