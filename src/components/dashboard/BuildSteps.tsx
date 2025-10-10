import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Lock, Circle, ArrowRight, Building2, Users, IndianRupee, Landmark, Database } from "lucide-react";

const buildSteps = [
  {
    id: "business",
    letter: "B",
    title: "Business Formation",
    subtitle: "Establish Your Legal Entity",
    description: "Form your LLC or Corporation and obtain your EIN",
    icon: Building2,
    status: "complete",
    tasks: [
      { title: "Choose Business Structure", done: true },
      { title: "File Formation Documents", done: true },
      { title: "Obtain EIN from IRS", done: true },
    ],
  },
  {
    id: "utilize",
    letter: "U",
    title: "Utilize Credit",
    subtitle: "Build Business Credit Profile",
    description: "Open vendor accounts and establish payment history",
    icon: Users,
    status: "in_progress",
    tasks: [
      { title: "Open Net-30 Vendor Accounts", done: true },
      { title: "Make Timely Payments", done: false },
      { title: "Request Credit Reporting", done: false },
    ],
  },
  {
    id: "income",
    letter: "I",
    title: "Income Verification",
    subtitle: "Document Revenue Streams",
    description: "Establish business bank account and revenue documentation",
    icon: IndianRupee,
    status: "locked",
    tasks: [
      { title: "Open Business Bank Account", done: false },
      { title: "Document Monthly Revenue", done: false },
      { title: "Prepare Financial Statements", done: false },
    ],
  },
  {
    id: "leverage",
    letter: "L",
    title: "Leverage Funding",
    subtitle: "Access Business Credit Lines",
    description: "Apply for business credit cards and lines of credit",
    icon: Landmark,
    status: "locked",
    tasks: [
      { title: "Apply for Business Credit Card", done: false },
      { title: "Secure Net-60 Terms", done: false },
      { title: "Establish Trade Lines", done: false },
    ],
  },
  {
    id: "diversify",
    letter: "D",
    title: "Diversify Credit",
    subtitle: "Expand Credit Portfolio",
    description: "Mix credit types and increase available funding",
    icon: Database,
    status: "locked",
    tasks: [
      { title: "Add Equipment Financing", done: false },
      { title: "Secure Term Loan", done: false },
      { title: "Maintain Credit Mix", done: false },
    ],
  },
];

export function BuildSteps() {
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-4xl font-bold bg-gradient-gold bg-clip-text text-transparent">
          B.U.I.L.D. Framework
        </h1>
        <p className="text-muted-foreground mt-2">Your roadmap to business credit and funding</p>
      </div>

      <Card className="shadow-glow border-primary/20">
        <CardHeader>
          <CardTitle>Framework Progress</CardTitle>
          <CardDescription>Complete each step to unlock business funding opportunities</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-muted-foreground">Overall Completion</span>
            <span className="font-semibold">20%</span>
          </div>
          <div className="w-full bg-muted rounded-full h-3">
            <div className="bg-gradient-gold h-3 rounded-full" style={{ width: "20%" }} />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {buildSteps.map((step, index) => {
          const StepIcon = step.icon;
          const isLocked = step.status === "locked";
          const isComplete = step.status === "complete";
          const isInProgress = step.status === "in_progress";

          return (
            <Card 
              key={step.id} 
              className={`shadow-card transition-all ${
                isLocked ? "opacity-60" : "hover:shadow-glow"
              }`}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-xl ${
                      isComplete ? "bg-success/10" : 
                      isInProgress ? "bg-primary/10" : 
                      "bg-muted"
                    }`}>
                      {isLocked ? (
                        <Lock className="w-6 h-6 text-muted-foreground" />
                      ) : (
                        <StepIcon className={`w-6 h-6 ${
                          isComplete ? "text-success" : 
                          isInProgress ? "text-primary" : 
                          "text-muted-foreground"
                        }`} />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="font-mono">
                          {step.letter}
                        </Badge>
                        <CardTitle className="text-xl">{step.title}</CardTitle>
                      </div>
                      <CardDescription className="text-base">{step.subtitle}</CardDescription>
                      <p className="text-sm text-muted-foreground mt-2">{step.description}</p>
                    </div>
                  </div>
                  {isComplete && (
                    <CheckCircle2 className="w-6 h-6 text-success" />
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 mb-4">
                  {step.tasks.map((task, taskIndex) => (
                    <div key={taskIndex} className="flex items-center gap-3">
                      {task.done ? (
                        <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
                      ) : (
                        <Circle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      )}
                      <span className={task.done ? "text-muted-foreground line-through" : ""}>
                        {task.title}
                      </span>
                    </div>
                  ))}
                </div>
                
                {!isLocked && (
                  <Button 
                    variant={isInProgress ? "default" : "outline"} 
                    className={isInProgress ? "bg-gradient-gold hover:opacity-90" : ""}
                  >
                    {isComplete ? "Review" : "Continue"}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                )}
                
                {isLocked && (
                  <div className="text-sm text-muted-foreground">
                    <Lock className="w-4 h-4 inline mr-2" />
                    Complete previous steps to unlock
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
