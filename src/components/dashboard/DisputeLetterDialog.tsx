import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Download, Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { writeDisputeMemory } from "@/lib/clientMemory";

interface DisputeLetterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bureauData: {
    name: string;
    totalAccounts: number;
    derogatoryItems: number;
    delinquentItems: number;
  };
}

export function DisputeLetterDialog({ open, onOpenChange, bureauData }: DisputeLetterDialogProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [letter, setLetter] = useState("");
  const { toast } = useToast();

  const generateLetter = async (issueType: string) => {
    setIsGenerating(true);
    setLetter("");

    try {
      const { data, error } = await supabase.functions.invoke('generate-dispute-letter', {
        body: { 
          bureauData,
          issueType 
        }
      });

      if (error) {
        if (error.message.includes("Rate limits exceeded")) {
          toast({
            title: "Rate Limit Reached",
            description: "Please wait a moment before generating another letter.",
            variant: "destructive",
          });
        } else if (error.message.includes("Payment required")) {
          toast({
            title: "Credits Required",
            description: "Please add credits to your workspace to continue using AI features.",
            variant: "destructive",
          });
        } else {
          throw error;
        }
        return;
      }

      if (data?.letter) {
        setLetter(data.letter);

        // Write memory record for this dispute generation
        supabase.auth.getUser().then(({ data: userData }) => {
          if (userData?.user) {
            writeDisputeMemory(userData.user.id, bureauData.name, bureauData.name, issueType);
          }
        });

        toast({
          title: "Letter Generated",
          description: "Your dispute letter has been created successfully.",
        });
      }
    } catch (error) {
      console.error('Error generating letter:', error);
      toast({
        title: "Error",
        description: "Failed to generate dispute letter. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(letter);
    toast({
      title: "Copied",
      description: "Letter copied to clipboard",
    });
  };

  const downloadLetter = () => {
    const blob = new Blob([letter], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dispute-letter-${bureauData.name.toLowerCase()}.txt`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    toast({
      title: "Downloaded",
      description: "Letter saved to your device",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">AI Dispute Letter Generator</DialogTitle>
          <DialogDescription>
            Generate a professional FCRA-compliant dispute letter for {bureauData.name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Bureau Info */}
          <div className="p-4 bg-muted rounded-lg">
            <h3 className="font-semibold mb-2">{bureauData.name} - Report Summary</h3>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Total Accounts:</span>
                <span className="ml-2 font-medium">{bureauData.totalAccounts}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Derogatory:</span>
                <span className="ml-2 font-medium text-warning">{bureauData.derogatoryItems}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Delinquent:</span>
                <span className="ml-2 font-medium text-warning">{bureauData.delinquentItems}</span>
              </div>
            </div>
          </div>

          {/* Generate Options */}
          {!letter && (
            <div className="space-y-3">
              <h4 className="font-semibold">Select Dispute Type:</h4>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  onClick={() => generateLetter("Derogatory Items")}
                  disabled={isGenerating || bureauData.derogatoryItems === 0}
                  className="h-auto py-4 flex flex-col items-start"
                  variant="outline"
                >
                  <span className="font-semibold">Derogatory Items</span>
                  <span className="text-xs text-muted-foreground">
                    {bureauData.derogatoryItems} item(s) found
                  </span>
                </Button>
                
                <Button
                  onClick={() => generateLetter("Delinquent Accounts")}
                  disabled={isGenerating || bureauData.delinquentItems === 0}
                  className="h-auto py-4 flex flex-col items-start"
                  variant="outline"
                >
                  <span className="font-semibold">Delinquent Accounts</span>
                  <span className="text-xs text-muted-foreground">
                    {bureauData.delinquentItems} item(s) found
                  </span>
                </Button>

                <Button
                  onClick={() => generateLetter("Inaccurate Information")}
                  disabled={isGenerating}
                  className="h-auto py-4 flex flex-col items-start"
                  variant="outline"
                >
                  <span className="font-semibold">Inaccurate Information</span>
                  <span className="text-xs text-muted-foreground">
                    General inaccuracies
                  </span>
                </Button>

                <Button
                  onClick={() => generateLetter("Identity Verification")}
                  disabled={isGenerating}
                  className="h-auto py-4 flex flex-col items-start"
                  variant="outline"
                >
                  <span className="font-semibold">Identity Verification</span>
                  <span className="text-xs text-muted-foreground">
                    Request verification
                  </span>
                </Button>
              </div>
            </div>
          )}

          {/* Loading State */}
          {isGenerating && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Generating your dispute letter...</p>
              <Badge variant="outline">AI-Powered by Lovable</Badge>
            </div>
          )}

          {/* Generated Letter */}
          {letter && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">Generated Letter:</h4>
                <div className="flex gap-2">
                  <Button onClick={copyToClipboard} variant="outline" size="sm">
                    <Copy className="w-4 h-4 mr-2" />
                    Copy
                  </Button>
                  <Button onClick={downloadLetter} variant="outline" size="sm">
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </Button>
                </div>
              </div>
              
              <Textarea 
                value={letter}
                onChange={(e) => setLetter(e.target.value)}
                className="min-h-[400px] font-mono text-sm"
                placeholder="Your dispute letter will appear here..."
              />

              <div className="flex justify-between items-center">
                <Button
                  onClick={() => setLetter("")}
                  variant="outline"
                >
                  Generate New Letter
                </Button>
                <Badge variant="outline" className="text-xs">
                  You can edit the letter above before downloading
                </Badge>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
