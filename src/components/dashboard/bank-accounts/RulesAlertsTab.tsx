import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, AlertCircle, Bell, Mail, MessageSquare } from "lucide-react";
import { toast } from "sonner";

interface Rule {
  id: string;
  name: string;
  field: string;
  operator: string;
  value: string;
  action: string;
  actionDetail: string;
  enabled: boolean;
  channels: string[];
}

interface RulesAlertsTabProps {
  businessMode?: boolean;
}

export function RulesAlertsTab({ businessMode = false }: RulesAlertsTabProps) {
  const [rules, setRules] = useState<Rule[]>([
    {
      id: "1",
      name: "Low Balance Warning",
      field: "avg_balance_90d",
      operator: "<",
      value: "5000",
      action: "create_task",
      actionDetail: "Raise average balance $3k for 30 days",
      enabled: true,
      channels: ["in-app", "email"],
    },
    {
      id: "2",
      name: "DSCR Below Threshold",
      field: "dscr",
      operator: "<",
      value: "1.25",
      action: "create_task",
      actionDetail: "Reduce obligations or increase NOI before applying",
      enabled: true,
      channels: ["in-app", "sms"],
    },
  ]);

  const [newRule, setNewRule] = useState({
    field: "",
    operator: "",
    value: "",
    action: "",
    actionDetail: "",
  });

  const fieldOptions = businessMode ? [
    { value: "avg_balance_90d", label: "Avg Balance (90d)" },
    { value: "dscr", label: "DSCR" },
    { value: "nsf_90d", label: "NSF Count (90d)" },
    { value: "inflows_30d", label: "Monthly Inflows" },
    { value: "outflows_30d", label: "Monthly Outflows" },
  ] : [
    { value: "avg_balance_90d", label: "Avg Balance (90d)" },
    { value: "nsf_90d", label: "NSF Count (90d)" },
    { value: "inflows_30d", label: "Income (30d)" },
    { value: "outflows_30d", label: "Expenses (30d)" },
    { value: "savings_rate_pct", label: "Savings Rate %" },
    { value: "utilization_pct", label: "Credit Utilization %" },
  ];

  const operatorOptions = [
    { value: "<", label: "Less than" },
    { value: "<=", label: "Less than or equal" },
    { value: ">", label: "Greater than" },
    { value: ">=", label: "Greater than or equal" },
    { value: "==", label: "Equals" },
  ];

  const actionOptions = [
    { value: "create_task", label: "Create Task" },
    { value: "send_sms", label: "Send SMS" },
    { value: "send_email", label: "Send Email" },
    { value: "show_toast", label: "Show In-App Alert" },
  ];

  const handleCreateRule = () => {
    if (!newRule.field || !newRule.operator || !newRule.value || !newRule.action || !newRule.actionDetail) {
      toast.error("Please fill in all fields");
      return;
    }

    const rule: Rule = {
      id: Date.now().toString(),
      name: `Rule ${rules.length + 1}`,
      ...newRule,
      enabled: true,
      channels: ["in-app"],
    };

    setRules([...rules, rule]);
    setNewRule({ field: "", operator: "", value: "", action: "", actionDetail: "" });
    toast.success("Rule created successfully");
  };

  const handleToggleRule = (id: string) => {
    setRules(rules.map(rule => 
      rule.id === id ? { ...rule, enabled: !rule.enabled } : rule
    ));
  };

  const handleDeleteRule = (id: string) => {
    setRules(rules.filter(rule => rule.id !== id));
    toast.success("Rule deleted");
  };

  return (
    <div className="space-y-6">
      {/* Rule Builder */}
      <Card className="border-border/50 shadow-card">
        <CardHeader>
          <CardTitle className="text-xl font-semibold flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-accent" />
            Create New Rule
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>IF this condition</Label>
              <Select value={newRule.field} onValueChange={(value) => setNewRule({ ...newRule, field: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select field" />
                </SelectTrigger>
                <SelectContent>
                  {fieldOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label>Operator</Label>
                <Select value={newRule.operator} onValueChange={(value) => setNewRule({ ...newRule, operator: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {operatorOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Value</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={newRule.value}
                  onChange={(e) => setNewRule({ ...newRule, value: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>THEN take this action</Label>
              <Select value={newRule.action} onValueChange={(value) => setNewRule({ ...newRule, action: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select action" />
                </SelectTrigger>
                <SelectContent>
                  {actionOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Action Detail</Label>
              <Input
                placeholder="Task description, message, etc."
                value={newRule.actionDetail}
                onChange={(e) => setNewRule({ ...newRule, actionDetail: e.target.value })}
              />
            </div>
          </div>

          <Button onClick={handleCreateRule} className="bg-gradient-gold hover:shadow-glow">
            <Plus className="mr-2 h-4 w-4" />
            Create Rule
          </Button>
        </CardContent>
      </Card>

      {/* Example Rules */}
      <Card className="border-border/50 shadow-card bg-gradient-to-br from-accent/5 to-gold/5">
        <CardHeader>
          <CardTitle className="text-base">Example Rules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {businessMode ? (
            <>
              <div className="p-3 rounded-lg bg-card border border-accent/20">
                <p className="font-mono text-xs">
                  <span className="text-accent">IF</span> avg_balance_90d &lt; $5,000 
                  <span className="text-gold mx-2">THEN</span> create_task: "Raise average balance $3k for 30 days"
                </p>
              </div>
              <div className="p-3 rounded-lg bg-card border border-gold/20">
                <p className="font-mono text-xs">
                  <span className="text-accent">IF</span> dscr &lt; 1.25 
                  <span className="text-gold mx-2">THEN</span> create_task: "Reduce obligations or increase NOI"
                </p>
              </div>
              <div className="p-3 rounded-lg bg-card border border-primary/20">
                <p className="font-mono text-xs">
                  <span className="text-accent">IF</span> nsf_90d &gt; 0 
                  <span className="text-gold mx-2">THEN</span> send_sms: "NSF detected. Bank hygiene alert."
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="p-3 rounded-lg bg-card border border-accent/20">
                <p className="font-mono text-xs">
                  <span className="text-accent">IF</span> avg_balance_90d &lt; $1,500 
                  <span className="text-gold mx-2">THEN</span> create_task: "Build a $1,000 emergency buffer"
                </p>
              </div>
              <div className="p-3 rounded-lg bg-card border border-gold/20">
                <p className="font-mono text-xs">
                  <span className="text-accent">IF</span> utilization_pct &gt; 30 
                  <span className="text-gold mx-2">THEN</span> create_task: "Pay down revolving balances before statement cut"
                </p>
              </div>
              <div className="p-3 rounded-lg bg-card border border-primary/20">
                <p className="font-mono text-xs">
                  <span className="text-accent">IF</span> savings_rate_pct &lt; 10 
                  <span className="text-gold mx-2">THEN</span> send_sms: "Low savings rate - review budget"
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Active Rules */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Active Rules ({rules.filter(r => r.enabled).length})</h3>
        {rules.map((rule) => (
          <Card key={rule.id} className={`border-2 transition-all ${rule.enabled ? 'border-accent/30' : 'border-border/50'}`}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={rule.enabled}
                      onCheckedChange={() => handleToggleRule(rule.id)}
                    />
                    <h4 className="font-semibold">{rule.name}</h4>
                    <Badge variant={rule.enabled ? "default" : "secondary"} className={rule.enabled ? "bg-success" : ""}>
                      {rule.enabled ? "Active" : "Disabled"}
                    </Badge>
                  </div>
                  
                  <div className="p-3 rounded-lg bg-muted/50 font-mono text-sm">
                    <span className="text-accent font-semibold">IF</span>{" "}
                    {fieldOptions.find(f => f.value === rule.field)?.label}{" "}
                    {rule.operator} {rule.value}{" "}
                    <span className="text-gold font-semibold">THEN</span>{" "}
                    {actionOptions.find(a => a.value === rule.action)?.label}: "{rule.actionDetail}"
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Alert channels:</span>
                    <div className="flex gap-2">
                      {rule.channels.includes("in-app") && (
                        <Badge variant="outline" className="gap-1">
                          <Bell className="h-3 w-3" /> In-App
                        </Badge>
                      )}
                      {rule.channels.includes("email") && (
                        <Badge variant="outline" className="gap-1">
                          <Mail className="h-3 w-3" /> Email
                        </Badge>
                      )}
                      {rule.channels.includes("sms") && (
                        <Badge variant="outline" className="gap-1">
                          <MessageSquare className="h-3 w-3" /> SMS
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteRule(rule.id)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
