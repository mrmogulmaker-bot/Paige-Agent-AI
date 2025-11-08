import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, Folder, File, Trash2, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Business {
  id: string;
  legal_name: string;
  business_type: string;
}

interface Document {
  id: string;
  file_name: string;
  file_path: string;
  folder_path: string;
  file_size: number;
  uploaded_at: string;
  business_id: string | null;
}

export function BusinessDocumentsManager() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selectedBusiness, setSelectedBusiness] = useState<string>("");
  const [currentFolder, setCurrentFolder] = useState("/");
  const [documents, setDocuments] = useState<Document[]>([]);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadBusinesses();
  }, []);

  useEffect(() => {
    if (selectedBusiness) {
      loadDocuments();
    }
  }, [selectedBusiness, currentFolder]);

  const loadBusinesses = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("businesses")
        .select("id, legal_name, business_type")
        .eq("owner_user_id", user.id)
        .order("legal_name");

      if (error) throw error;
      setBusinesses(data || []);
    } catch (error) {
      console.error("Error loading businesses:", error);
    }
  };

  const loadDocuments = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("user_id", user.id)
        .eq("business_id", selectedBusiness)
        .eq("folder_path", currentFolder)
        .order("uploaded_at", { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error("Error loading documents:", error);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !selectedBusiness) return;

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      for (const file of Array.from(files)) {
        const fileExt = file.name.split(".").pop();
        const fileName = `${Date.now()}_${file.name}`;
        const filePath = `${user.id}/${selectedBusiness}${currentFolder}${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("business-documents")
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { error: dbError } = await supabase.from("documents").insert({
          user_id: user.id,
          business_id: selectedBusiness,
          file_name: file.name,
          file_path: filePath,
          folder_path: currentFolder,
          mime_type: file.type,
          file_size: file.size,
          bucket_name: "business-documents",
          document_type: "business",
        });

        if (dbError) throw dbError;
      }

      toast({
        title: "Success",
        description: "Files uploaded successfully",
      });

      loadDocuments();
    } catch (error) {
      console.error("Error uploading files:", error);
      toast({
        title: "Error",
        description: "Failed to upload files",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (doc: Document) => {
    try {
      const { error: storageError } = await supabase.storage
        .from("business-documents")
        .remove([doc.file_path]);

      if (storageError) throw storageError;

      const { error: dbError } = await supabase
        .from("documents")
        .delete()
        .eq("id", doc.id);

      if (dbError) throw dbError;

      toast({
        title: "Success",
        description: "File deleted",
      });

      loadDocuments();
    } catch (error) {
      console.error("Error deleting file:", error);
      toast({
        title: "Error",
        description: "Failed to delete file",
        variant: "destructive",
      });
    }
  };

  const handleDownload = async (doc: Document) => {
    try {
      const { data, error } = await supabase.storage
        .from("business-documents")
        .download(doc.file_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.file_name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error downloading file:", error);
      toast({
        title: "Error",
        description: "Failed to download file",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">
          Business Documents
        </h2>
        <p className="text-muted-foreground">
          Organize files by business entity
        </p>
      </div>

      <Card className="p-4">
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="text-sm font-medium mb-2 block">
              Select Business
            </label>
            <Select value={selectedBusiness} onValueChange={setSelectedBusiness}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a business entity" />
              </SelectTrigger>
              <SelectContent>
                {businesses.map((biz) => (
                  <SelectItem key={biz.id} value={biz.id}>
                    {biz.legal_name} ({biz.business_type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Input
              type="file"
              multiple
              onChange={handleFileUpload}
              disabled={!selectedBusiness || uploading}
              className="hidden"
              id="file-upload"
            />
            <label htmlFor="file-upload">
              <Button
                asChild
                disabled={!selectedBusiness || uploading}
              >
                <span>
                  <Upload className="w-4 h-4 mr-2" />
                  {uploading ? "Uploading..." : "Upload Files"}
                </span>
              </Button>
            </label>
          </div>
        </div>
      </Card>

      {selectedBusiness && (
        <Card className="p-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
              <Folder className="w-4 h-4" />
              <span>{currentFolder}</span>
            </div>

            {documents.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No documents in this folder
              </div>
            ) : (
              <div className="space-y-2">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent"
                  >
                    <div className="flex items-center gap-3">
                      <File className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{doc.file_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(doc.uploaded_at).toLocaleDateString()} •{" "}
                          {(doc.file_size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDownload(doc)}
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(doc)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
