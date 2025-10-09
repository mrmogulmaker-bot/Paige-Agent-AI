import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookOpen, Video, FileText, Award } from "lucide-react";

export const LearningVault = () => {
  const resources = [
    {
      title: "Understanding Your Credit Report",
      type: "Article",
      icon: FileText,
      duration: "5 min read",
      badge: "Essential",
    },
    {
      title: "How to Write Effective Dispute Letters",
      type: "Video",
      icon: Video,
      duration: "12 min",
      badge: "Popular",
    },
    {
      title: "FCRA & FDCPA: Know Your Rights",
      type: "Course",
      icon: BookOpen,
      duration: "45 min",
      badge: "Legal",
    },
    {
      title: "Building Business Credit",
      type: "Article",
      icon: FileText,
      duration: "8 min read",
      badge: "Advanced",
    },
    {
      title: "Tradelines Explained",
      type: "Video",
      icon: Video,
      duration: "15 min",
      badge: "Essential",
    },
    {
      title: "Credit Mastery Certification",
      type: "Course",
      icon: Award,
      duration: "2 hours",
      badge: "Certification",
    },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-bold mb-2">Learning Vault</h2>
        <p className="text-muted-foreground">
          Educational resources to accelerate your credit mastery
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {resources.map((resource, index) => (
          <Card
            key={index}
            className="p-6 bg-card border-border shadow-card hover:shadow-glow transition-all duration-300 cursor-pointer group"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors">
                <resource.icon className="w-6 h-6 text-primary" />
              </div>
              <Badge variant="secondary" className="text-xs">
                {resource.badge}
              </Badge>
            </div>

            <h3 className="font-semibold mb-2 group-hover:text-primary transition-colors">
              {resource.title}
            </h3>
            
            <div className="flex items-center justify-between text-sm text-muted-foreground mb-4">
              <span>{resource.type}</span>
              <span>{resource.duration}</span>
            </div>

            <Button variant="outline" className="w-full group-hover:border-primary">
              Access Now
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
};
