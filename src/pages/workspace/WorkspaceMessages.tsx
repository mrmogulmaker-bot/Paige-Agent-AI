/** BTF Workspace · Messages — Section E.
 *  Real-time coach <-> client thread on btf_messages. Text only for v1;
 *  attachments shipped in the next slice. */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspaceClient } from "./useWorkspaceClient";

interface Msg {
  id: string;
  client_id: string;
  sender_type: string;
  sender_id: string | null;
  body: string;
  created_at: string;
  read_at: string | null;
}

export default function WorkspaceMessages() {
  const { client, loading: clientLoading, error: clientError } = useWorkspaceClient();
  const { toast } = useToast();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUid(data.user?.id ?? null));
  }, []);

  const refresh = useCallback(async () => {
    if (!client) return;
    const { data } = await supabase
      .from("btf_messages")
      .select("*")
      .eq("client_id", client.id)
      .order("created_at", { ascending: true });
    setMsgs((data ?? []) as Msg[]);
    setLoading(false);
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, [client]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!client) return;
    const ch = supabase
      .channel(`btf-msgs-${client.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "btf_messages", filter: `client_id=eq.${client.id}` },
        (p) => {
          setMsgs((m) => [...m, p.new as Msg]);
          setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [client]);

  const send = async () => {
    if (!client || !body.trim() || !uid) return;
    setSending(true);
    const { error } = await supabase.from("btf_messages").insert({
      client_id: client.id,
      sender_type: "client",
      sender_id: uid,
      body: body.trim(),
    });
    setSending(false);
    if (error) {
      toast({ title: "Couldn't send", description: error.message, variant: "destructive" });
      return;
    }
    setBody("");
  };

  if (clientLoading || loading) return <div className="text-sm">Loading…</div>;
  if (clientError || !client) return <div className="workspace-card p-6 text-sm">{clientError}</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl mb-1">Messages</h1>
        <p className="text-sm" style={{ color: "rgba(8,20,40,0.7)" }}>
          Direct line to your coach. Replies typically arrive within one business day.
        </p>
      </div>

      <div className="workspace-card flex flex-col" style={{ height: "60vh" }}>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {msgs.length === 0 ? (
            <div className="text-sm opacity-60 text-center py-8">
              No messages yet. Send your coach a hello to get started.
            </div>
          ) : (
            msgs.map((m) => {
              const mine = m.sender_type === "client";
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className="max-w-[75%] rounded-2xl px-4 py-2.5 text-sm"
                    style={{
                      background: mine ? "var(--mma-navy)" : "rgba(8,20,40,0.06)",
                      color: mine ? "#fff" : "inherit",
                    }}
                  >
                    <div className="whitespace-pre-wrap break-words">{m.body}</div>
                    <div className="text-[10px] mt-1 opacity-70">
                      {new Date(m.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={endRef} />
        </div>

        <div className="border-t p-3 flex gap-2" style={{ borderColor: "var(--mma-line)" }}>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a message to your coach…"
            rows={2}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send();
              }
            }}
          />
          <Button onClick={send} disabled={sending || !body.trim()}>
            {sending ? "Sending…" : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}
