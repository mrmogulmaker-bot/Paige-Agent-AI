// Persona — who Paige is from the client's side of the table.
// Extracted verbatim from PlaybookAdmin; the preset picker moved into this
// section header (spec §1.5).
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PLAYBOOK_LIBRARY } from "@/lib/playbook/presets";
import { SectionIntro, type SectionProps } from "./shared";

interface PersonaSectionProps extends SectionProps {
  onApplyPreset?: (slug: string) => void;
}

export function PersonaSection({ pb, patch, onApplyPreset }: PersonaSectionProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionIntro>Who Paige is, from your client's side of the table.</SectionIntro>
        {onApplyPreset && (
          <Select onValueChange={onApplyPreset}>
            <SelectTrigger className="w-[190px]"><SelectValue placeholder="Start from a preset" /></SelectTrigger>
            <SelectContent>
              {PLAYBOOK_LIBRARY.map((p) => <SelectItem key={p.slug} value={p.slug}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>
      <Card>
        <CardContent className="grid sm:grid-cols-2 gap-4 pt-6">
          <div className="space-y-1.5"><Label>Name</Label>
            <Input value={pb.persona.name} onChange={(e) => patch((d) => { d.persona.name = e.target.value; })} placeholder="Paige" /></div>
          <div className="space-y-1.5"><Label>Role</Label>
            <Input value={pb.persona.role} onChange={(e) => patch((d) => { d.persona.role = e.target.value; })} placeholder="your team's assistant" /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Opening greeting</Label>
            <Textarea rows={2} value={pb.persona.greeting} onChange={(e) => patch((d) => { d.persona.greeting = e.target.value; })} /></div>
          <div className="space-y-1.5"><Label>Tone</Label>
            <Input value={pb.persona.tone} onChange={(e) => patch((d) => { d.persona.tone = e.target.value; })} placeholder="warm, direct, encouraging" /></div>
          <div className="space-y-1.5"><Label>Domain of expertise</Label>
            <Input value={pb.persona.domain} onChange={(e) => patch((d) => { d.persona.domain = e.target.value; })} placeholder="business consulting" /></div>
        </CardContent>
      </Card>
    </div>
  );
}
