import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, EyeOff, Brain, FileText, Target, DollarSign, Search, MessageSquare, StickyNote } from "lucide-react";

interface ClientMemoryTabProps {
  clientUserId: string;
}

interface MemoryRecord {
  id: string;
  memory_type: string;
  content: string;
  is_active: boolean;
  created_at: string;
  source_session_id: string | null;
}

const typeIcons: Record<string, React.ReactNode> = {
  report_upload: <FileText className="w-3.5 h-3.5" />,
  milestone_completed: <Target className="w-3.5 h-3.5" />,
  dispute_generated: <Brain className="w-3.5 h-3.5" />,
  funding_secured: <DollarSign className="w-3.5 h-3.5" />,
  lender_researched: <Search className="w-3.5 h-3.5" />,
  session_summary: <MessageSquare className="w-3.5 h-3.5" />,
  coach_note: <StickyNote className="w-3.5 h-3.5" />,
};

const typeLabels: Record<string, string> = {
  report_upload: "Report Upload",
  milestone_completed: "Milestone",
  dispute_generated: "Dispute Generated",
  funding_secured: "Funding Secured",
  lender_researched: "Lender Research",
  session_summary: "Session Summary",
  coach_note: "Coach Note",
};

const typeBadgeVariants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  report_upload: "default",
  milestone_completed: "secondary",
  dispute_generated: "outline",
  funding_secured: "default",
  lender_researched: "secondary",
  session_summary: "outline",
  coach_note: "secondary",
};

export function ClientMemoryTab({ clientUserId }: ClientMemoryTabProps) {
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [noteContent, setNoteContent] = useState("");
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchMemories();
  }, [clientUserId]);

  const fetchMemories = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("client_memory")
      .select("*")
      .eq("client_user_id", clientUserId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching memories:", error);
    } else {
      setMemories((data as unknown as MemoryRecord[]) || []);
    }
    setLoading(false);
  };

  const handleAddNote = async () => {
    if (!noteContent.trim()) return;

    const { error } = await supabase.from("client_memory").insert({
      client_user_id: clientUserId,
      memory_type: "coach_note",
      content: noteContent.trim(),
    } as any);

    if (error) {
      toast({ title: "Error", description: "Failed to add note.", variant: "destructive" });
    } else {
      toast({ title: "Note added", description: "This note will be included in Paige's context for the next session." });
      setNoteContent("");
      setIsAddingNote(false);
      fetchMemories();
    }
  };

  const handleDeactivate = async (memoryId: string) => {
    const { error } = await supabase
      .from("client_memory")
      .update({ is_active: false } as any)
      .eq("id", memoryId);

    if (error) {
      toast({ title: "Error", description: "Failed to deactivate memory.", variant: "destructive" });
    } else {
      toast({ title: "Memory deactivated", description: "This record will no longer be included in Paige's context." });
      fetchMemories();
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Loading memory records...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Paige Memory</h3>
          <p className="text-sm text-muted-foreground">
            {memories.filter(m => m.is_active).length} active records · Paige uses these to personalize conversations
          </p>
        </div>
        <Button size="sm" onClick={() => setIsAddingNote(true)} disabled={isAddingNote}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Add Note
        </Button>
      </div>

      {isAddingNote && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <Textarea
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder="Add a note that Paige will remember for future sessions with this client..."
              rows={3}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => { setIsAddingNote(false); setNoteContent(""); }}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleAddNote} disabled={!noteContent.trim()}>
                Save Note
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {memories.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Brain className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground">No memory records yet</p>
            <p className="text-sm text-muted-foreground mt-1">Memory records are created automatically as the client uses the platform.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {memories.map((memory) => (
            <Card key={memory.id} className={memory.is_active ? "" : "opacity-50"}>
              <CardContent className="py-3 px-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 text-muted-foreground">
                    {typeIcons[memory.memory_type] || <Brain className="w-3.5 h-3.5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={typeBadgeVariants[memory.memory_type] || "outline"} className="text-[10px]">
                        {typeLabels[memory.memory_type] || memory.memory_type}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(memory.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </span>
                      {!memory.is_active && (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">Inactive</Badge>
                      )}
                    </div>
                    <p className="text-sm text-foreground leading-relaxed">{memory.content}</p>
                  </div>
                  {memory.is_active && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDeactivate(memory.id)}
                      title="Remove from Paige's active context"
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
