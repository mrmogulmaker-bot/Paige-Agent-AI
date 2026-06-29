import { useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Phone, Mail, MessageSquare, Calendar, StickyNote, Plus, ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { logQuickActivity } from "@/lib/contacts";
import { supabase } from "@/integrations/supabase/client";

type Channel = "call" | "email" | "sms" | "meeting" | "note";

type Props = {
  contactId: string;
  contactUserId: string | null;
  contactDisplay: string;
  onLogged: () => void;
};

const CHANNELS: { value: Channel; label: string; icon: any }[] = [
  { value: "call", label: "Call", icon: Phone },
  { value: "email", label: "Email", icon: Mail },
  { value: "sms", label: "SMS", icon: MessageSquare },
  { value: "meeting", label: "Meeting", icon: Calendar },
  { value: "note", label: "Note", icon: StickyNote },
];

export function QuickLogMenu({ contactId, contactUserId, contactDisplay, onLogged }: Props) {
  const [open, setOpen] = useState<Channel | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  const close = () => { setOpen(null); setSubject(""); setBody(""); };

  const submit = async () => {
    if (!open) return;
    if (!body.trim() && !subject.trim()) {
      toast.error("Add a subject or a note");
      return;
    }
    setSaving(true);
    try {
      if (contactUserId) {
        await logQuickActivity({
          user_id: contactUserId,
          channel: open,
          subject: subject.trim() || null,
          preview: body.trim() || null,
        });
      } else {
        // No portal account — write to client_memory as an internal coach note.
        const { error } = await supabase.from("client_memory").insert({
          client_id: contactId,
          memory_type: `quick_${open}`,
          content: subject.trim() ? `${subject.trim()}\n${body.trim()}` : body.trim(),
          is_active: true,
        });
        if (error) throw error;
        await supabase.from("clients").update({
          last_contacted_at: new Date().toISOString(),
        }).eq("id", contactId);
      }
      toast.success(`${open.toUpperCase()} logged for ${contactDisplay}`);
      close();
      onLogged();
    } catch (e: any) {
      toast.error(e.message || "Could not log activity");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-1" /> Log <ChevronDown className="h-3 w-3 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {CHANNELS.map((c) => (
            <DropdownMenuItem key={c.value} onClick={() => setOpen(c.value)}>
              <c.icon className="h-4 w-4 mr-2" /> {c.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open !== null} onOpenChange={(v) => !v && close()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="capitalize">Log {open || ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Subject</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Quick summary" />
            </div>
            <div>
              <Label>Details</Label>
              <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What was discussed?" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>Cancel</Button>
            <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Log activity"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
