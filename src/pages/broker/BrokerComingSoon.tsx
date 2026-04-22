// Shared placeholder for Phase 2b tabs (Sessions, Team, Commissions, MCC).
// We render a friendly stub so navigation never 404s before the real screens ship.

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Construction } from "lucide-react";

interface Props {
  title: string;
  description: string;
}

const BrokerComingSoon = ({ title, description }: Props) => (
  <div className="max-w-2xl mx-auto pt-8">
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Construction className="h-5 w-5 text-primary" />
          <CardTitle>{title}</CardTitle>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        This screen ships in Phase 2b. Your data is being collected in the background — nothing
        is lost while we finish the UI.
      </CardContent>
    </Card>
  </div>
);

export default BrokerComingSoon;
