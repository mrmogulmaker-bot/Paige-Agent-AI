import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, MessageSquareWarning, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const REASON_LABELS: Record<string, string> = {
  factually_incorrect: "Factually Incorrect",
  missing_important_context: "Missing Important Context",
  recommended_wrong_strategy: "Recommended Wrong Strategy",
  outdated_information: "Outdated Information",
  other: "Other",
};

export function KnowledgeBaseReviewQueue() {
  const queryClient = useQueryClient();

  const { data: feedback, isLoading } = useQuery({
    queryKey: ["response-quality-feedback"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("response_quality_feedback" as any)
        .select("*")
        .eq("rating", "negative")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const handleMarkReviewed = async (id: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("response_quality_feedback" as any)
        .update({ reviewed_at: new Date().toISOString(), reviewed_by: user?.id } as any)
        .eq("id", id);
      if (error) throw error;
      toast.success("Marked as reviewed");
      queryClient.invalidateQueries({ queryKey: ["response-quality-feedback"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to update");
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  const items = feedback || [];
  const unreviewed = items.filter((f: any) => !f.reviewed_at);
  const reviewed = items.filter((f: any) => f.reviewed_at);

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <MessageSquareWarning className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground">No negative feedback recorded yet. Feedback will appear here when admins or coaches flag Paige responses.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Knowledge Base Review Queue</h3>
          <p className="text-sm text-muted-foreground">{unreviewed.length} unreviewed item{unreviewed.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {unreviewed.length > 0 && (
        <div className="space-y-4">
          {unreviewed.map((item: any) => (
            <Card key={item.id} className="border-amber-200 dark:border-amber-800">
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="destructive" className="text-xs">
                        {REASON_LABELS[item.reason_category] || item.reason_category || "Negative"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(item.created_at), "MMM d, yyyy h:mm a")}
                      </span>
                    </div>
                    {item.message_content && (
                      <div className="p-3 bg-muted rounded-lg mb-2">
                        <p className="text-xs text-muted-foreground mb-1">Paige's Response:</p>
                        <p className="text-sm line-clamp-4">{item.message_content}</p>
                      </div>
                    )}
                    {item.reason_other && (
                      <p className="text-sm"><strong>Detail:</strong> {item.reason_other}</p>
                    )}
                    {item.correction_note && (
                      <div className="p-3 bg-primary/5 rounded-lg mt-2">
                        <p className="text-xs text-muted-foreground mb-1">Correct Answer Should Be:</p>
                        <p className="text-sm">{item.correction_note}</p>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => handleMarkReviewed(item.id)}>
                      <CheckCircle2 className="w-3 h-3 mr-1" /> Mark Reviewed
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {reviewed.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Previously Reviewed ({reviewed.length})</h4>
          {reviewed.slice(0, 10).map((item: any) => (
            <Card key={item.id} className="opacity-60">
              <CardContent className="py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <Badge variant="secondary" className="text-xs">{REASON_LABELS[item.reason_category] || "Flagged"}</Badge>
                    <span className="text-xs text-muted-foreground line-clamp-1 max-w-[300px]">
                      {item.message_content?.substring(0, 80)}...
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Reviewed {item.reviewed_at ? format(new Date(item.reviewed_at), "MMM d") : ""}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
