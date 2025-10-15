import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Loader2, Trash2, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Document {
  id: string;
  document_type: string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  uploaded_at: string;
}

interface DocumentUploadProps {
  documentType: string;
  label: string;
  description?: string;
  bucketName: "personal-documents" | "business-documents";
  businessId?: string;
  onUploadSuccess?: () => void;
}

export const DocumentUpload = ({
  documentType,
  label,
  description,
  bucketName,
  businessId,
  onUploadSuccess,
}: DocumentUploadProps) => {
  const [uploading, setUploading] = useState(false);
  const [document, setDocument] = useState<Document | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadDocument();
  }, [documentType]);

  const loadDocument = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("user_id", user.id)
        .eq("document_type", documentType)
        .maybeSingle();

      if (error) throw error;
      if (data) setDocument(data);
    } catch (error) {
      console.error("Error loading document:", error);
    }
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Maximum file size is 10MB",
        variant: "destructive",
      });
      return;
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Only JPEG, PNG, WebP images and PDF files are allowed",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      if (document) {
        await supabase.storage.from(bucketName).remove([document.file_path]);
        await supabase.from("documents").delete().eq("id", document.id);
      }

      const fileExt = file.name.split(".").pop();
      const filePath = `${user.id}/${documentType}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: newDoc, error: dbError } = await supabase
        .from("documents")
        .insert({
          user_id: user.id,
          business_id: businessId || null,
          document_type: documentType,
          file_name: file.name,
          file_path: filePath,
          file_size: file.size,
          mime_type: file.type,
          bucket_name: bucketName,
        })
        .select()
        .single();

      if (dbError) throw dbError;

      setDocument(newDoc);
      toast({
        title: "Upload successful",
        description: `${label} has been uploaded`,
      });

      onUploadSuccess?.();
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const handleDownload = async () => {
    if (!document) return;

    try {
      const { data, error } = await supabase.storage
        .from(bucketName)
        .download(document.file_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = window.document.createElement("a");
      a.href = url;
      a.download = document.file_name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({
        title: "Download failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!document) return;

    try {
      await supabase.storage.from(bucketName).remove([document.file_path]);
      await supabase.from("documents").delete().eq("id", document.id);

      setDocument(null);
      toast({
        title: "Document deleted",
        description: `${label} has been removed`,
      });

      onUploadSuccess?.();
    } catch (error: any) {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <FileText className="h-4 w-4" />
          {label}
        </CardTitle>
        {description && (
          <CardDescription className="text-xs">{description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {document ? (
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{document.file_name}</p>
                <p className="text-xs text-muted-foreground">
                  {(document.file_size / 1024).toFixed(1)} KB
                </p>
              </div>
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDownload}
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <Label htmlFor={`upload-${documentType}`} className="sr-only">
              Upload {label}
            </Label>
            <div className="relative">
              <Input
                id={`upload-${documentType}`}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={handleUpload}
                disabled={uploading}
                className="cursor-pointer"
              />
              {uploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
