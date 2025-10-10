import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, FileText, Clock, CheckCircle2, XCircle } from "lucide-react";

const mockDisputes = [
  {
    id: "1",
    creditorName: "Capital One",
    bureau: "Experian",
    reasonCode: "Not Mine",
    status: "pending",
    openDate: "2024-10-01",
    dueDate: "2024-11-01",
  },
  {
    id: "2",
    creditorName: "Discover",
    bureau: "Equifax",
    reasonCode: "Paid in Full",
    status: "resolved",
    openDate: "2024-09-15",
    dueDate: "2024-10-15",
  },
  {
    id: "3",
    creditorName: "Wells Fargo",
    bureau: "TransUnion",
    reasonCode: "Incorrect Balance",
    status: "in_progress",
    openDate: "2024-10-05",
    dueDate: "2024-11-05",
  },
];

const statusConfig = {
  draft: { label: "Draft", icon: FileText, color: "bg-muted" },
  pending: { label: "Pending", icon: Clock, color: "bg-warning" },
  in_progress: { label: "In Progress", icon: Clock, color: "bg-info" },
  resolved: { label: "Resolved", icon: CheckCircle2, color: "bg-success" },
  rejected: { label: "Rejected", icon: XCircle, color: "bg-destructive" },
};

export function DisputesManager() {
  const [disputes] = useState(mockDisputes);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-gold bg-clip-text text-transparent">
            Credit Disputes
          </h1>
          <p className="text-muted-foreground mt-2">Manage and track your credit bureau disputes</p>
        </div>
        <Button className="bg-gradient-gold hover:opacity-90">
          <Plus className="w-4 h-4 mr-2" />
          New Dispute
        </Button>
      </div>

      <div className="grid gap-4">
        {disputes.map((dispute) => {
          const status = statusConfig[dispute.status as keyof typeof statusConfig];
          const StatusIcon = status.icon;

          return (
            <Card key={dispute.id} className="shadow-card hover:shadow-glow transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-xl">{dispute.creditorName}</CardTitle>
                    <CardDescription>Bureau: {dispute.bureau}</CardDescription>
                  </div>
                  <Badge className={status.color}>
                    <StatusIcon className="w-3 h-3 mr-1" />
                    {status.label}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Reason</p>
                    <p className="font-medium">{dispute.reasonCode}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Opened</p>
                    <p className="font-medium">{new Date(dispute.openDate).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Due Date</p>
                    <p className="font-medium">{new Date(dispute.dueDate).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button variant="outline" size="sm">View Details</Button>
                  <Button variant="outline" size="sm">Download Letter</Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {disputes.length === 0 && (
        <Card className="shadow-card">
          <CardContent className="py-12 text-center">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No disputes yet</h3>
            <p className="text-muted-foreground mb-4">Start your credit repair journey by filing your first dispute</p>
            <Button className="bg-gradient-gold hover:opacity-90">
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Dispute
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
