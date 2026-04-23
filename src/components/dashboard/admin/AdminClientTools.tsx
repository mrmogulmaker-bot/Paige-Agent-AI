import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Trash2, MessageSquare, Send, AlertTriangle, Edit3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

// ── Factory Reset Dialog ──

export function AdminFactoryResetDialog({ clientUserId, clientName, open, onOpenChange }: {
  clientUserId: string;
  clientName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [running, setRunning] = useState(false);
  const queryClient = useQueryClient();

  const handleReset = async () => {
    if (confirmText !== "RESET") return;
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("factory-credit-reset", {
        body: { target_user_id: clientUserId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Factory reset completed for ${clientName}`);
      queryClient.invalidateQueries();
      onOpenChange(false);
      setConfirmText("");
    } catch (err: any) {
      toast.error("Factory reset failed", { description: err.message });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" /> Factory Reset — {clientName}
          </DialogTitle>
          <DialogDescription>
            This will permanently delete all personal credit data (reports, accounts, negative items, inquiries) for this client. Business profiles and submitted applications will be preserved.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm">
            <strong>This action cannot be undone.</strong> Type <code className="font-mono bg-destructive/20 px-1 rounded">RESET</code> below to confirm.
          </div>
          <div className="space-y-2">
            <Label>Confirmation</Label>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type RESET to confirm"
              className="font-mono"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={confirmText !== "RESET" || running}
            onClick={handleReset}
          >
            {running && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Confirm Factory Reset
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Paige Chat History Viewer ──

export function AdminChatHistory({ clientUserId }: { clientUserId: string }) {
  const [replyInput, setReplyInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: messages, isLoading } = useQuery({
    queryKey: ["admin-chat-history", clientUserId],
    queryFn: async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("id, role, content, created_at, session_id")
        .eq("user_id", clientUserId)
        .order("created_at", { ascending: true })
        .limit(200);
      return (data || []) as any[];
    },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendAsAdmin = async () => {
    if (!replyInput.trim()) return;
    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get latest session or create one
      const latestSession = messages?.length ? messages[messages.length - 1].session_id : `admin-session-${Date.now()}`;

      await supabase.from("chat_messages").insert({
        user_id: clientUserId,
        role: "assistant",
        content: replyInput.trim(),
        session_id: latestSession,
        metadata: { sent_by_admin: user.id, admin_override: true },
      });

      toast.success("Message sent as Paige");
      setReplyInput("");
      queryClient.invalidateQueries({ queryKey: ["admin-chat-history", clientUserId] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="w-4 h-4" /> Paige Chat History
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div ref={scrollRef} className="h-[400px] overflow-y-auto space-y-2 border rounded-lg p-3 bg-muted/30">
          {isLoading && (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          )}
          {!isLoading && (!messages || messages.length === 0) && (
            <p className="text-center text-muted-foreground py-8 text-sm">No chat history for this client.</p>
          )}
          {messages?.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                msg.role === "user"
                  ? "bg-primary/10 text-foreground"
                  : "bg-accent/10 text-foreground"
              }`}>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] font-medium uppercase text-muted-foreground">
                    {msg.role === "user" ? "Client" : "Paige"}
                  </span>
                  {(msg as any).metadata?.admin_override && (
                    <Badge variant="outline" className="text-[8px] px-1 py-0">Admin</Badge>
                  )}
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(msg.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}
        </div>
        {/* Send as Paige */}
        <div className="flex gap-2">
          <Input
            value={replyInput}
            onChange={(e) => setReplyInput(e.target.value)}
            placeholder="Send message as Paige..."
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendAsAdmin()}
          />
          <Button size="sm" onClick={sendAsAdmin} disabled={sending || !replyInput.trim()}>
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Funding Match Override ──

export function AdminFundingOverride({ clientUserId }: { clientUserId: string }) {
  const [overrideNote, setOverrideNote] = useState("");
  const [overrideScore, setOverrideScore] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!overrideNote.trim()) { toast.error("Please add a note explaining the override"); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("audit_logs").insert({
        user_id: clientUserId,
        entity: "funding_match",
        action: "admin_score_override",
        data: {
          override_score: overrideScore ? Number(overrideScore) : null,
          note: overrideNote,
          overridden_by: user?.id,
          timestamp: new Date().toISOString(),
        },
      });
      toast.success("Funding override saved");
      setOverrideNote("");
      setOverrideScore("");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Edit3 className="w-4 h-4" /> Funding Match Override
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Override the automated funding match score with a manual assessment. This will be logged in the audit trail.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="sm:col-span-1">
            <Label className="text-xs">Override Score (0-100)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={overrideScore}
              onChange={(e) => setOverrideScore(e.target.value)}
              placeholder="Score"
            />
          </div>
          <div className="sm:col-span-3">
            <Label className="text-xs">Note (required)</Label>
            <Textarea
              value={overrideNote}
              onChange={(e) => setOverrideNote(e.target.value)}
              placeholder="Reason for override..."
              rows={2}
            />
          </div>
        </div>
        <Button size="sm" onClick={handleSave} disabled={saving || !overrideNote.trim()}>
          {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Save Override
        </Button>
      </CardContent>
    </Card>
  );
}
