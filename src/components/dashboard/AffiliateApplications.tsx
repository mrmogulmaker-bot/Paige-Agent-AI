import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Check, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface AffiliateApplication {
  id: string;
  user_id: string;
  status: string;
  company_name: string;
  website: string | null;
  social_media_links: any;
  application_note: string;
  applied_at: string;
  user_profile?: {
    full_name: string;
  } | null;
}

export function AffiliateApplications() {
  const [applications, setApplications] = useState<AffiliateApplication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedApp, setSelectedApp] = useState<AffiliateApplication | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchApplications();
  }, []);

  const fetchApplications = async () => {
    try {
      const { data, error } = await supabase
        .from("affiliate_profiles")
        .select("*")
        .order("applied_at", { ascending: false });

      if (error) throw error;

      // Fetch user profiles separately
      const dataWithProfiles = await Promise.all(
        (data || []).map(async (app) => {
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("user_id", app.user_id)
            .single();
          
          return {
            ...app,
            user_profile: profile,
          };
        })
      );

      setApplications(dataWithProfiles);
    } catch (error: any) {
      console.error("Error fetching applications:", error);
      toast({
        title: "Error",
        description: "Failed to load applications",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async (application: AffiliateApplication) => {
    setIsProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Update affiliate profile
      const { error: updateError } = await supabase
        .from("affiliate_profiles")
        .update({
          status: "approved",
          approved_at: new Date().toISOString(),
          approved_by: user.id,
        })
        .eq("id", application.id);

      if (updateError) throw updateError;

      // Add affiliate role
      const { error: roleError } = await supabase
        .from("user_roles")
        .insert({
          user_id: application.user_id,
          role: "affiliate",
        });

      if (roleError) throw roleError;

      toast({
        title: "Application approved",
        description: "The affiliate has been notified and can now access their dashboard.",
      });

      fetchApplications();
    } catch (error: any) {
      console.error("Error approving application:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to approve application",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedApp) return;
    setIsProcessing(true);
    try {
      const { error } = await supabase
        .from("affiliate_profiles")
        .update({
          status: "rejected",
          rejection_reason: rejectionReason,
        })
        .eq("id", selectedApp.id);

      if (error) throw error;

      toast({
        title: "Application rejected",
        description: "The applicant has been notified.",
      });

      setShowRejectDialog(false);
      setRejectionReason("");
      setSelectedApp(null);
      fetchApplications();
    } catch (error: any) {
      console.error("Error rejecting application:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to reject application",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const openRejectDialog = (app: AffiliateApplication) => {
    setSelectedApp(app);
    setShowRejectDialog(true);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Affiliate Applications</CardTitle>
          <CardDescription>Review and manage affiliate program applications</CardDescription>
        </CardHeader>
        <CardContent>
          {applications.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No applications yet</p>
          ) : (
            <div className="space-y-4">
              {applications.map((app) => (
                <Card key={app.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-semibold">{app.company_name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {app.user_profile?.full_name || "Unknown User"}
                        </p>
                      </div>
                      <Badge
                        variant={
                          app.status === "approved"
                            ? "default"
                            : app.status === "rejected"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {app.status}
                      </Badge>
                    </div>

                    <div className="space-y-2 text-sm mb-4">
                      {app.website && (
                        <p>
                          <span className="font-medium">Website:</span>{" "}
                          <a href={app.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                            {app.website}
                          </a>
                        </p>
                      )}
                      <p>
                        <span className="font-medium">Application Note:</span>
                      </p>
                      <p className="text-muted-foreground whitespace-pre-wrap">{app.application_note}</p>
                    </div>

                    {app.status === "pending" && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleApprove(app)}
                          disabled={isProcessing}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => openRejectDialog(app)}
                          disabled={isProcessing}
                        >
                          <X className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Application</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this application
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Explain why this application is being rejected..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            className="min-h-32"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={!rejectionReason || isProcessing}
            >
              {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reject Application
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
