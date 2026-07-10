// Client portal — the sections your clients see in their portal, in order.
// Extracted verbatim from PlaybookAdmin.
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus } from "lucide-react";
import { RowShell, SectionIntro, slugify, type SectionProps } from "./shared";

export function PortalSection({ pb, patch }: SectionProps) {
  return (
    <div className="space-y-4">
      <SectionIntro>The sections your clients see in their portal, in order.</SectionIntro>
      <Card>
        <CardContent className="space-y-2 pt-6">
          {pb.portal.modules.map((m, i) => (
            <RowShell key={i} onRemove={() => patch((d) => { d.portal.modules.splice(i, 1); })}>
              <Input aria-label="Portal module name" value={m.label} placeholder="Module name" onChange={(e) => patch((d) => { d.portal.modules[i].label = e.target.value; d.portal.modules[i].key = slugify(e.target.value); })} />
            </RowShell>
          ))}
          <Button variant="outline" size="sm" onClick={() => patch((d) => { d.portal.modules.push({ key: "", label: "" }); })}>
            <Plus className="w-4 h-4 mr-1" /> Add module
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
