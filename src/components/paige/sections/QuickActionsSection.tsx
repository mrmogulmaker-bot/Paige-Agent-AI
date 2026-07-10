// Quick actions — one-tap prompts your clients see in chat.
// Extracted verbatim from PlaybookAdmin.
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus } from "lucide-react";
import { RowShell, SectionIntro, type SectionProps } from "./shared";

export function QuickActionsSection({ pb, patch }: SectionProps) {
  return (
    <div className="space-y-4">
      <SectionIntro>One-tap prompts your clients see in chat.</SectionIntro>
      <Card>
        <CardContent className="space-y-2 pt-6">
          {pb.quickActions.map((q, i) => (
            <RowShell key={i} onRemove={() => patch((d) => { d.quickActions.splice(i, 1); })}>
              <div className="grid sm:grid-cols-2 gap-2">
                <Input aria-label="Quick action label" value={q.label} placeholder="Button label" onChange={(e) => patch((d) => { d.quickActions[i].label = e.target.value; })} />
                <Input aria-label="Quick action prompt" value={q.prompt} placeholder="What it asks Paige" onChange={(e) => patch((d) => { d.quickActions[i].prompt = e.target.value; })} />
              </div>
            </RowShell>
          ))}
          <Button variant="outline" size="sm" onClick={() => patch((d) => { d.quickActions.push({ label: "", prompt: "" }); })}>
            <Plus className="w-4 h-4 mr-1" /> Add quick action
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
