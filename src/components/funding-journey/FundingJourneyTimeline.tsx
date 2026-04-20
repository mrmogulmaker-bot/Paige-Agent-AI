import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Calendar, ChevronRight, FileUp, Inbox, Loader2, MessageSquare,
  Pencil, StickyNote, Upload,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  STATUS_BADGE_CLASS, STATUS_LABELS, DENIAL_REASON_LABELS,
  formatCurrency,
  type FundingJourneyApplication,
} from "@/lib/fundingJourney";
import { CATEGORIES, type ProductCategoryKey } from "@/lib/lenderCategories";
import { NextStepsDrawer } from "./NextStepsDrawer";
import { UpdateOutcomeDialog } from "./UpdateOutcomeDialog";
import { LogApplicationDialog } from "./LogApplicationDialog";

interface Props {
  applications: FundingJourneyApplication[];
  /** When set (admin/coach), enables coach controls (status updates, etc). */
  coachMode?: boolean;
  emptyState?: React.ReactNode;
}

export function FundingJourneyTimeline({ applications, coachMode = false, emptyState }: Props) {
  const qc = useQueryClient();
  const [nextStepsApp, setNextStepsApp] = useState<FundingJourneyApplication | null>(null);
  const [outcomeApp, setOutcomeApp] = useState<FundingJourneyApplication | null>(null);
  const [editApp, setEditApp] = useState<FundingJourneyApplication | null>(null);
  const [noteApp, setNoteApp] = useState<FundingJourneyApplication | null>(null);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);

  if (applications.length === 0) {
    return (
      <Card className="p-12 text-center bg-card border-dashed">
        {emptyState || (
          <>
            <Inbox className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
            <h3 className="text-lg font-semibold text-foreground mb-1">No applications yet</h3>
            <p className="text-sm text-muted-foreground">
              Log your first funding application to start building your journey.
            </p>
          </>
        )}
      </Card>
    );
  }

  const handleOpenNote = (app: FundingJourneyApplication) => {
    setNoteApp(app);
    setNoteText(app.notes || "");
  };

  const handleSaveNote = async () => {
    if (!noteApp) return;
    setSavingNote(true);
    try {
      const { error } = await supabase
        .from("funding_journey_applications")
        .update({ notes: noteText.trim() || null })
        .eq("id", noteApp.id);
      if (error) throw error;
      toast.success("Note saved");
      qc.invalidateQueries({ queryKey: ["funding-journey"] });
      setNoteApp(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to save note");
    } finally {
      setSavingNote(false);
    }
  };

  const handleUploadDenialLetter = async (app: FundingJourneyApplication, file: File) => {
    setUploadingFor(app.id);
    try {
      const ext = file.name.split(".").pop() || "pdf";
      const path = `${app.user_id}/${app.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("denial-letters")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;

      const { error: updErr } = await supabase
        .from("funding_journey_applications")
        .update({ denial_letter_url: path })
        .eq("id", app.id);
      if (updErr) throw updErr;

      toast.success("Denial letter uploaded");
      qc.invalidateQueries({ queryKey: ["funding-journey"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to upload");
    } finally {
      setUploadingFor(null);
    }
  };

  return (
    <>
      <div className="relative">
        {/* Vertical timeline line */}
        <div className="absolute left-4 top-2 bottom-2 w-px bg-border" aria-hidden="true" />

        <div className="space-y-4">
          {applications.map((app) => {
            const badge = STATUS_BADGE_CLASS[app.status];
            const categoryLabel = app.product_category
              ? CATEGORIES[app.product_category as ProductCategoryKey]?.label || app.product_category
              : null;

            return (
              <div key={app.id} className="relative pl-12">
                {/* Timeline dot */}
                <div className="absolute left-2 top-5 w-4 h-4 rounded-full bg-card border-2 border-accent" />

                <Card className="p-5 bg-card border-border">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="text-base font-semibold text-foreground">{app.lender_name}</h3>
                        {categoryLabel && (
                          <Badge variant="outline" className="text-[10px] font-medium border-border">
                            {categoryLabel}
                          </Badge>
                        )}
                        <Badge className={`text-[10px] font-medium border ${badge}`} variant="outline">
                          {STATUS_LABELS[app.status]}
                        </Badge>
                      </div>
                      {app.product_name && (
                        <p className="text-sm text-muted-foreground mb-2">{app.product_name}</p>
                      )}

                      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Applied {new Date(app.application_date).toLocaleDateString()}
                        </span>
                        {app.decision_date && (
                          <span className="flex items-center gap-1">
                            <ChevronRight className="w-3 h-3" />
                            Decision {new Date(app.decision_date).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-xs text-muted-foreground uppercase tracking-wider">
                        {app.status === "funded" || app.status === "approved" ? "Approved" : "Requested"}
                      </div>
                      <div className="text-lg font-bold text-foreground">
                        {formatCurrency(
                          app.status === "funded" || app.status === "approved"
                            ? app.amount_approved ?? app.amount_requested
                            : app.amount_requested
                        )}
                      </div>
                      {app.amount_approved != null && app.amount_requested != null && app.amount_approved !== app.amount_requested && (
                        <div className="text-[10px] text-muted-foreground">
                          of {formatCurrency(app.amount_requested)} req.
                        </div>
                      )}
                    </div>
                  </div>

                  {app.denial_reason_category && (
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground">Denial reason:</span>
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-destructive/10 text-destructive border-destructive/30"
                      >
                        {DENIAL_REASON_LABELS[app.denial_reason_category]}
                      </Badge>
                    </div>
                  )}

                  {app.notes && (
                    <p className="mt-3 text-xs text-muted-foreground italic line-clamp-2">"{app.notes}"</p>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {(app.status === "denied" || app.next_steps) && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs gap-1.5"
                        onClick={() => setNextStepsApp(app)}
                      >
                        <MessageSquare className="w-3 h-3" />
                        Next Steps
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs gap-1.5 text-muted-foreground"
                      onClick={() => handleOpenNote(app)}
                    >
                      <StickyNote className="w-3 h-3" />
                      {app.notes ? "Edit Note" : "Add Note"}
                    </Button>

                    {app.status === "denied" && (
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          accept="application/pdf,image/*"
                          className="hidden"
                          disabled={uploadingFor === app.id}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleUploadDenialLetter(app, file);
                            e.target.value = "";
                          }}
                        />
                        <Button asChild size="sm" variant="ghost" className="h-8 text-xs gap-1.5 text-muted-foreground" disabled={uploadingFor === app.id}>
                          <span>
                            {uploadingFor === app.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileUp className="w-3 h-3" />}
                            {app.denial_letter_url ? "Replace Letter" : "Upload Denial Letter"}
                          </span>
                        </Button>
                      </label>
                    )}

                    {(coachMode || ["draft", "submitted", "under_review"].includes(app.status)) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-xs gap-1.5 text-muted-foreground"
                        onClick={() => setOutcomeApp(app)}
                      >
                        <ChevronRight className="w-3 h-3" />
                        Update Outcome
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs gap-1.5 text-muted-foreground ml-auto"
                      onClick={() => setEditApp(app)}
                    >
                      <Pencil className="w-3 h-3" />
                      Edit
                    </Button>
                  </div>
                </Card>
              </div>
            );
          })}
        </div>
      </div>

      <NextStepsDrawer
        open={!!nextStepsApp}
        onOpenChange={(v) => !v && setNextStepsApp(null)}
        application={nextStepsApp}
      />

      <UpdateOutcomeDialog
        open={!!outcomeApp}
        onOpenChange={(v) => !v && setOutcomeApp(null)}
        application={outcomeApp}
      />

      <LogApplicationDialog
        open={!!editApp}
        onOpenChange={(v) => !v && setEditApp(null)}
        applicationId={editApp?.id ?? null}
      />

      <Dialog open={!!noteApp} onOpenChange={(v) => !v && setNoteApp(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Note</DialogTitle>
          </DialogHeader>
          <Textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={5}
            placeholder="Add notes about this application..."
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteApp(null)} disabled={savingNote}>Cancel</Button>
            <Button onClick={handleSaveNote} disabled={savingNote}>
              {savingNote && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
