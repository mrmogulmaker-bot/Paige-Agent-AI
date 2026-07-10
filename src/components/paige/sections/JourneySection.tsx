// Client journey — the stages a client moves through with you.
// Extracted verbatim from PlaybookAdmin.
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus } from "lucide-react";
import { RowShell, SectionIntro, slugify, type SectionProps } from "./shared";

export function JourneySection({ pb, patch }: SectionProps) {
  return (
    <div className="space-y-4">
      <SectionIntro>The stages a client moves through with you.</SectionIntro>
      <Card>
        <CardContent className="space-y-2 pt-6">
          {pb.journey.map((s, i) => (
            <RowShell key={i} onRemove={() => patch((d) => { d.journey.splice(i, 1); })}>
              <div className="grid sm:grid-cols-2 gap-2">
                <Input aria-label="Journey stage name" value={s.label} placeholder="Stage name" onChange={(e) => patch((d) => { d.journey[i].label = e.target.value; d.journey[i].key = slugify(e.target.value); })} />
                <Input aria-label="Journey stage description" value={s.description} placeholder="What happens here" onChange={(e) => patch((d) => { d.journey[i].description = e.target.value; })} />
              </div>
            </RowShell>
          ))}
          <Button variant="outline" size="sm" onClick={() => patch((d) => { d.journey.push({ key: "", label: "", description: "" }); })}>
            <Plus className="w-4 h-4 mr-1" /> Add stage
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
