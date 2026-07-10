// Intake — what a new client tells you when they come aboard.
// Extracted verbatim from PlaybookAdmin.
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import type { IntakeField } from "@/lib/playbook/types";
import { RowShell, SectionIntro, slugify, INTAKE_TYPES, type SectionProps } from "./shared";

export function IntakeSection({ pb, patch }: SectionProps) {
  return (
    <div className="space-y-4">
      <SectionIntro>What a new client tells you when they come aboard.</SectionIntro>
      <Card>
        <CardContent className="space-y-2 pt-6">
          {pb.intake.map((f, i) => (
            <RowShell key={i} onRemove={() => patch((d) => { d.intake.splice(i, 1); })}>
              <div className="grid sm:grid-cols-[1fr_140px] gap-2">
                <Input aria-label="Intake field label" value={f.label} placeholder="Question label" onChange={(e) => patch((d) => { d.intake[i].label = e.target.value; if (!d.intake[i].key) d.intake[i].key = slugify(e.target.value); })} />
                <Select value={f.type} onValueChange={(v) => patch((d) => { d.intake[i].type = v as IntakeField["type"]; })}>
                  <SelectTrigger aria-label="Intake field type"><SelectValue /></SelectTrigger>
                  <SelectContent>{INTAKE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {f.type === "select" && (
                <Input aria-label="Select options, comma-separated" value={(f.options ?? []).join(", ")} placeholder="Options, comma-separated"
                  onChange={(e) => patch((d) => { d.intake[i].options = e.target.value.split(",").map((o) => o.trim()).filter(Boolean); })} />
              )}
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch checked={!!f.required} onCheckedChange={(v) => patch((d) => { d.intake[i].required = v; })} /> Required
              </label>
            </RowShell>
          ))}
          <Button variant="outline" size="sm" onClick={() => patch((d) => { d.intake.push({ key: "", label: "", type: "text" }); })}>
            <Plus className="w-4 h-4 mr-1" /> Add field
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
