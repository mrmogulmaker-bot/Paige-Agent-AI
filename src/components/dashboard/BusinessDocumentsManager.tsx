import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FolderOpen, Upload, File, Building2 } from "lucide-react";
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
  document_type: string;
  folder_path: string;
  uploaded_at: string;
  file_size: number;
}

export function BusinessDocumentsManager() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selectedBusiness, setSelectedBusiness] = useState<string>("");
  const [documents, setDocuments] = useState<Document[]>([]);
  const [currentFolder, setCurrentFolder] = useState("/");
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("businesses")
      .select("id, legal_name, business_type")
      .eq("owner_user_id", user.id)
      .order("legal_name");

    if (!error && data) {
      setBusinesses(data);
      if (data.length > 0 && !selectedBusiness) {
        setSelectedBusiness(data[0].id);
      }
    }
  };

  const loadDocuments = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !selectedBusiness) return;

    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .eq("user_id", user.id)
      .eq("business_id", selectedBusiness)
      .eq("folder_path", currentFolder)
      .order("uploaded_at", { ascending: false });

    if (!error && data) {
      setDocuments(data);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedBusiness) return;

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const fileExt = file.name.split('.').pop();
      const filePath = `${selectedBusiness}${currentFolder}${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("business-documents")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase.from("documents").insert({
        user_id: user.id,
        business_id: selectedBusiness,
        file_name: file.name,
        file_path: filePath,
        document_type: "business",
        folder_path: currentFolder,
        bucket_name: "business-documents",
        mime_type: file.type,
        file_size: file.size,
      });

      if (dbError) throw dbError;

      toast({
        title: "Success",
        description: "File uploaded successfully",
      });

      loadDocuments();
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const selectedBusinessData = businesses.find(b => b.id === selectedBusiness);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="w-6 h-6 text-gold" />
              Business Documents
            </CardTitle>
            <CardDescription>
              Organize files by business entity
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Select value={selectedBusiness} onValueChange={setSelectedBusiness}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Select business" />
              </SelectTrigger>
              <SelectContent>
                {businesses.map((business) => (
                  <SelectItem key={business.id} value={business.id}>
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4" />
                      {business.legal_name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button disabled={!selectedBusiness || uploading} asChild>
              <label className="cursor-pointer">
                <Upload className="w-4 h-4 mr-2" />
                {uploading ? "Uploading..." : "Upload File"}
                <Input
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={!selectedBusiness || uploading}
                />
              </label>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!selectedBusiness ? (
          <div className="text-center py-12 text-muted-foreground">
            <Building2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Select a business to view and manage its documents</p>
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <File className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="mb-2">No documents in this folder</p>
            <p className="text-sm">Upload files to organize them for {selectedBusinessData?.legal_name}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors"
              >
                <File className="w-5 h-5 text-muted-foreground" />
                <div className="flex-1">
                  <div className="font-medium">{doc.file_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(doc.uploaded_at).toLocaleDateString()} • {(doc.file_size / 1024).toFixed(1)} KB
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
