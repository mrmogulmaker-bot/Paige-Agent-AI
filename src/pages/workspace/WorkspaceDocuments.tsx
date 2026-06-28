/** BTF Workspace · Documents — Section C.
 *  Shows coach-created document requests and accepts client uploads
 *  into the private `btf-client-docs` storage bucket. */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useWorkspaceClient } from "./useWorkspaceClient";
import { Upload, FileText, CheckCircle2, AlertCircle, Clock } from "lucide-react";

interface DocRequest {
  id: string;
  client_id: string;
  title: string;
  description: string | null;
  status: string;
  file_name: string | null;
  file_size: number | null;
  storage_path: string | null;
  uploaded_at: string | null;
  rejection_reason: string | null;
  requested_at: string;
}

const MAX = 25 * 1024 * 1024;

export default function WorkspaceDocuments() {
  const { client, loading: clientLoading, error: clientError } = useWorkspaceClient();
  const { toast } = useToast();
  const [requests, setRequests] = useState<DocRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!client) return;
    const { data } = await supabase
      .from("btf_document_requests")
      .select("*")
      .eq("client_id", client.id)
      .order("requested_at", { ascending: false });
    setRequests((data ?? []) as DocRequest[]);
    setLoading(false);
  }, [client]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!client) return;
    const ch = supabase
      .channel(`btf-docs-${client.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "btf_document_requests", filter: `client_id=eq.${client.id}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [client, refresh]);

  const upload = async (req: DocRequest, file: File) => {
    if (!client) return;
    if (file.size > MAX) {
      toast({ title: "File too large", description: "Maximum size is 25MB.", variant: "destructive" });
      return;
    }
    setUploadingId(req.id);
    const { data: auth } = await supabase.auth.getUser();
    const path = `${client.id}/${req.id}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("btf-client-docs").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "application/octet-stream",
    });
    if (upErr) {
      setUploadingId(null);
      toast({ title: "Upload failed", description: upErr.message, variant: "destructive" });
      return;
    }
    const { error: updErr } = await supabase
      .from("btf_document_requests")
      .update({
        storage_path: path,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type || null,
        uploaded_at: new Date().toISOString(),
        uploaded_by: auth.user?.id ?? null,
        status: "uploaded",
        rejection_reason: null,
      })
      .eq("id", req.id);
    setUploadingId(null);
    if (updErr) {
      toast({ title: "Saved file but couldn't update request", description: updErr.message, variant: "destructive" });
      return;
    }
    toast({ title: "Uploaded", description: `${file.name} sent to your coach.` });
    refresh();
  };

  const statusBadge = (s: string) => {
    const map: Record<string, { v: "default" | "secondary" | "destructive" | "outline"; icon: typeof Clock; label: string }> = {
      pending: { v: "outline", icon: Clock, label: "Requested" },
      requested: { v: "outline", icon: Clock, label: "Requested" },
      uploaded: { v: "secondary", icon: Upload, label: "Submitted" },
      approved: { v: "default", icon: CheckCircle2, label: "Approved" },
      rejected: { v: "destructive", icon: AlertCircle, label: "Needs redo" },
    };
    const m = map[s] ?? map.pending;
    const Icon = m.icon;
    return <Badge variant={m.v} className="gap-1"><Icon className="h-3 w-3" />{m.label}</Badge>;
  };

  if (clientLoading || loading) return <div className="text-sm">Loading…</div>;
  if (clientError || !client) return <div className="workspace-card p-6 text-sm">{clientError}</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl mb-1">Documents</h1>
        <p className="text-sm" style={{ color: "rgba(8,20,40,0.7)" }}>
          Upload anything your coach requests. Files are encrypted at rest and visible only to you and your assigned coach.
        </p>
      </div>

      {requests.length === 0 ? (
        <div className="workspace-card p-6 text-sm">
          No document requests yet. Your coach will post requests here as they come up.
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((req) => {
            const canUpload = req.status === "pending" || req.status === "requested" || req.status === "rejected";
            const isDragging = dragId === req.id;
            return (
              <div
                key={req.id}
                className={`workspace-card p-5 ${isDragging ? "ring-2" : ""}`}
                style={isDragging ? { boxShadow: "0 0 0 2px var(--mma-gold)" } : undefined}
                onDragOver={(e) => { if (canUpload) { e.preventDefault(); setDragId(req.id); } }}
                onDragLeave={() => setDragId(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragId(null);
                  if (!canUpload) return;
                  const f = e.dataTransfer.files?.[0];
                  if (f) upload(req, f);
                }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold">{req.title}</h3>
                      {statusBadge(req.status)}
                    </div>
                    {req.description && (
                      <p className="text-sm mb-2" style={{ color: "rgba(8,20,40,0.7)" }}>{req.description}</p>
                    )}
                    {req.file_name && (
                      <p className="text-xs flex items-center gap-1.5" style={{ color: "rgba(8,20,40,0.6)" }}>
                        <FileText className="h-3 w-3" />
                        {req.file_name} · {req.file_size ? `${Math.round(req.file_size / 1024)} KB` : ""}
                      </p>
                    )}
                    {req.status === "rejected" && req.rejection_reason && (
                      <p className="text-xs mt-2 p-2 rounded" style={{ background: "rgba(220,38,38,0.08)", color: "rgb(153,27,27)" }}>
                        Coach note: {req.rejection_reason}
                      </p>
                    )}
                  </div>

                  {canUpload && (
                    <div>
                      <label>
                        <input
                          type="file"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) upload(req, f);
                            e.currentTarget.value = "";
                          }}
                        />
                        <Button asChild disabled={uploadingId === req.id}>
                          <span>
                            <Upload className="h-4 w-4 mr-2" />
                            {uploadingId === req.id ? "Uploading…" : (req.status === "rejected" ? "Re-upload" : "Upload")}
                          </span>
                        </Button>
                      </label>
                    </div>
                  )}
                </div>
                {canUpload && (
                  <p className="text-xs mt-3 opacity-60">Drop a file here or click upload. Max 25MB.</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
