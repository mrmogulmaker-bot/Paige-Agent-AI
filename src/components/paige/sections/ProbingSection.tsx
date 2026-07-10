// Probing questions — how Paige digs in to find what each client needs.
// Extracted verbatim from PlaybookAdmin.
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus } from "lucide-react";
import { RowShell, SectionIntro, slugify, type SectionProps } from "./shared";

export function ProbingSection({ pb, patch }: SectionProps) {
  return (
    <div className="space-y-4">
      <SectionIntro>How Paige digs in to find what each client needs.</SectionIntro>
      <Card>
        <CardContent className="space-y-2 pt-6">
          {pb.probingQuestions.map((q, i) => (
            <RowShell key={i} onRemove={() => patch((d) => { d.probingQuestions.splice(i, 1); })}>
              <Input aria-label="How Paige asks it" value={q.ask} placeholder="How she asks it" onChange={(e) => patch((d) => { d.probingQuestions[i].ask = e.target.value; })} />
              <Input aria-label="What this question captures" value={q.captures} placeholder="What it captures (e.g. primary_goal)" onChange={(e) => patch((d) => { d.probingQuestions[i].captures = e.target.value; })} />
            </RowShell>
          ))}
          <Button variant="outline" size="sm" onClick={() => patch((d) => { d.probingQuestions.push({ id: slugify(String(d.probingQuestions.length + 1)), ask: "", captures: "" }); })}>
            <Plus className="w-4 h-4 mr-1" /> Add question
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
