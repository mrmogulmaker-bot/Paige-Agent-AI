import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, CheckCircle2, FileText, Building2, TrendingUp, BarChart3, Shield, DollarSign } from "lucide-react";

const buildModules = [
  {
    id: 1,
    title: "BASE - Foundation of Fundability",
    letter: "B",
    description: "Create a clean, compliant, credible footprint for both personal and business credit",
    objective: "Create a clean, compliant, credible footprint for both personal and business credit",
    lessons: [
      "What Lenders Look For – The 3Cs: Character, Capacity, Capital",
      "Credit Assessment: Pull and Analyze Reports (Experian, Equifax, TransUnion, SBFE)",
      "Business Identity Setup: Address, Phone, Domain, Website, Email",
      "Business Credentials: EIN, DUNS, Secretary of State Validation",
      "Compliance Foundation: Licenses, Bank Account, Operating Agreement, Site Inspection Readiness"
    ],
    deliverables: [
      "Compliance Checklist PDF",
      "Lender Credibility Test worksheet",
      "Business Setup Tracker"
    ],
    icon: Building2,
    color: "from-blue-500 to-blue-600"
  },
  {
    id: 2,
    title: "UTILIZE - Strategic Tradeline Building",
    letter: "U",
    description: "Add starter accounts that report correctly and establish early credit activity",
    objective: "Add starter accounts that report correctly and establish early credit activity",
    lessons: [
      "Tradeline Sequencing Strategy",
      "Personal Tradelines: AU & Secured Accounts",
      "Business Tradelines: Net 30 Vendors (Experian, Equifax, SBFE)",
      "Credit Builder Accounts: Nav, CreditStrong, eCredable, etc.",
      "Monitoring & Reporting Verification"
    ],
    deliverables: [
      "Starter Vendor Directory",
      "Tradeline Tracker Template",
      "Reporting Verification Log"
    ],
    icon: TrendingUp,
    color: "from-green-500 to-green-600"
  },
  {
    id: 3,
    title: "INCREASE - Depth, Diversification & Credit Limits",
    letter: "I",
    description: "Expand from starter lines to revolving and installment credit to demonstrate capacity",
    objective: "Expand from starter lines to revolving and installment credit to demonstrate capacity",
    lessons: [
      "Graduating to Business Credit Cards",
      "Secured Lines and Term Loans",
      "Vendor Tier 2 Applications",
      "Utilization & Payment Optimization",
      "Building Long-Term Account Age and Mix"
    ],
    deliverables: [
      "Tier 2 Vendor List",
      "Credit Limit Increase Strategy Sheet",
      "Payment Reporting Calendar"
    ],
    icon: BarChart3,
    color: "from-purple-500 to-purple-600"
  },
  {
    id: 4,
    title: "LEVERAGE - Managing & Monitoring Credit",
    letter: "L",
    description: "Master ongoing credit optimization and prepare for funding stages",
    objective: "Master ongoing credit optimization and prepare for funding stages",
    lessons: [
      "Monitoring Systems (Personal + Business)",
      "Managing Utilization and Score Impact",
      "Dispute Protocols for Business Credit Reports",
      "Setting Up Alerts and Automated Tracking",
      "Preparing for Lender Review"
    ],
    deliverables: [
      "Credit Monitoring Comparison Chart",
      "Utilization Worksheet",
      "Lender-Ready Profile Audit Checklist"
    ],
    icon: Shield,
    color: "from-orange-500 to-orange-600"
  },
  {
    id: 5,
    title: "DEVELOP - Access to Capital",
    letter: "D",
    description: "Position your profiles for funding programs, credit stacking, and partnerships",
    objective: "Position your profiles for funding programs, credit stacking, and partnerships",
    lessons: [
      "The FUND-Ready Profile Explained",
      "Soft Pull vs. Hard Pull Applications",
      "Strategic Credit Stacking (0% Cards, Lines, Loans)",
      "Business Bank Relationship Management",
      "Preparing for the FUND Program or Capital Raise"
    ],
    deliverables: [
      "Funding Readiness Scorecard",
      "Lender Matching Guide",
      "Capital Stacking Planner"
    ],
    icon: DollarSign,
    color: "from-emerald-500 to-emerald-600"
  },
];

export const BuildProgramOutline = () => {
  const [expandedModule, setExpandedModule] = useState<number | null>(1);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold bg-gradient-gold bg-clip-text text-transparent">
          BUILD Buying Power Program
        </h2>
        <p className="text-muted-foreground mt-2">
          Complete 5-Module Framework for Personal and Business Credit Mastery
        </p>
      </div>

      <Card className="p-6 border-primary/20 shadow-glow">
        <CardHeader className="px-0 pt-0">
          <CardTitle>Program Overview</CardTitle>
          <CardDescription>
            Help establish personal and business credit that earns lender trust and funding approvals
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-0">
          {buildModules.map((module) => {
            const Icon = module.icon;
            const isExpanded = expandedModule === module.id;
            
            return (
              <div key={module.id} className="border border-border rounded-lg overflow-hidden transition-all hover:shadow-md">
                <button
                  onClick={() => setExpandedModule(isExpanded ? null : module.id)}
                  className="w-full p-4 flex items-center gap-4 hover:bg-muted/50 transition-colors text-left"
                >
                  <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${module.color} flex items-center justify-center text-white font-bold text-2xl flex-shrink-0 shadow-lg`}>
                    {module.letter}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="font-mono text-xs">
                        Module {module.id}
                      </Badge>
                    </div>
                    <h3 className="font-bold text-lg truncate">{module.title}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-2">{module.description}</p>
                  </div>
                  <ChevronDown 
                    className={`w-5 h-5 flex-shrink-0 transition-transform duration-200 ${
                      isExpanded ? 'rotate-180' : ''
                    }`} 
                  />
                </button>
                
                {isExpanded && (
                  <div className="p-6 bg-muted/20 border-t border-border space-y-6 animate-fade-in">
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Icon className={`w-5 h-5 text-${module.color.split('-')[1]}-500`} />
                        <h4 className="font-semibold text-base">Objective</h4>
                      </div>
                      <p className="text-sm text-muted-foreground ml-7">{module.objective}</p>
                    </div>
                    
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <CheckCircle2 className="w-5 h-5 text-success" />
                        <h4 className="font-semibold text-base">Lessons Covered</h4>
                      </div>
                      <ul className="space-y-2 ml-7">
                        {module.lessons.map((lesson, idx) => (
                          <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                            <span className="text-primary mt-1">•</span>
                            <span>{lesson}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <FileText className="w-5 h-5 text-accent" />
                        <h4 className="font-semibold text-base">Deliverables</h4>
                      </div>
                      <ul className="space-y-2 ml-7">
                        {module.deliverables.map((deliverable, idx) => (
                          <li key={idx} className="text-sm font-medium text-foreground flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
                            <span>{deliverable}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          
          <div className="mt-8 p-6 bg-gradient-to-br from-accent/10 to-primary/10 border-2 border-accent/30 rounded-lg">
            <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-accent" />
              Bonus Module: Systems for Scale
            </h3>
            <ul className="space-y-2 ml-7">
              <li className="text-sm flex items-start gap-2">
                <span className="text-accent mt-1">✓</span>
                <span>Automate credit reporting reminders via GHL workflows</span>
              </li>
              <li className="text-sm flex items-start gap-2">
                <span className="text-accent mt-1">✓</span>
                <span>Dashboard setup for monthly credit tracking</span>
              </li>
              <li className="text-sm flex items-start gap-2">
                <span className="text-accent mt-1">✓</span>
                <span>AI assistant for credit monitoring alerts and compliance reminders</span>
              </li>
            </ul>
          </div>

          <div className="mt-6 p-4 bg-success/10 border border-success/30 rounded-lg">
            <h4 className="font-semibold mb-2 text-success">Program Includes</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-success" />
                <span>5 Core Video Modules</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-success" />
                <span>Downloadable Assets</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-success" />
                <span>Interactive Checklists</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-success" />
                <span>AI-guided Support Bot</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-success" />
                <span>Weekly Zoom Q&A</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-success" />
                <span>Certified Credit Builder Certificate</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
