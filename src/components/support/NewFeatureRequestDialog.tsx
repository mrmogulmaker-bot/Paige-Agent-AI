import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { FEATURE_CATEGORIES, type FeatureCategory } from "./supportTypes";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  onCreated: () => void;
}

export function NewFeatureRequestDialog({ open, onOpenChange, userId, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<FeatureCategory>("other");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setTitle("");
    setDescription("");
    setCategory("other");
  };

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) {
      toast.error("Please fill in both title and description");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase
        .from("feature_requests")
        .insert({
          user_id: userId,
          title: title.trim(),
          description: description.trim(),
          category,
          vote_count: 1,
        })

        .select("id")
        .single();
      if (error) throw error;

      await supabase.from("feature_request_votes").insert({
        feature_request_id: data.id,
        user_id: userId,
      });
      
      await supabase.from("feature_requests").update({ vote_count: 1 }).eq("id", data.id);

      toast.success("Feature request submitted — thanks for sharing your idea!");
      reset();
      onCreated();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || "Could not submit feature request");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Submit an Idea</DialogTitle>
          <DialogDescription>
            Your feedback directly influences what we build next. All submissions are anonymous to other users.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short description of the feature"
              maxLength={80}
            />
            <p className="text-xs text-muted-foreground">{title.length}/80</p>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What do you want and why would it help you?"
              rows={5}
              className="resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as FeatureCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FEATURE_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Submitting..." : "Submit Idea"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
