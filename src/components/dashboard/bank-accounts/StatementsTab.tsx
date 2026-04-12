import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText, Upload, Eye, Download, Scan, Calendar, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Statement {
  id: string;
  accountId: string;
  accountName: string;
  month: Date;
  fileName: string;
  fileSize: number;
  uploadedAt: Date;
  parsed: boolean;
  transactionCount?: number;
}

export function StatementsTab() {
  const [statements, setStatements] = useState<Statement[]>([
    {
      id: "1",
      accountId: "acc_1",
      accountName: "Business Checking",
      month: new Date(2025, 5, 1),
      fileName: "statement_june_2025.pdf",
      fileSize: 245000,
      uploadedAt: new Date(),
      parsed: true,
      transactionCount: 127,
    },
    {
      id: "2",
      accountId: "acc_1",
      accountName: "Business Checking",
      month: new Date(2025, 4, 1),
      fileName: "statement_may_2025.pdf",
      fileSize: 238000,
      uploadedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      parsed: true,
      transactionCount: 115,
    },
  ]);

  const [uploading, setUploading] = useState(false);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (file.size > 20 * 1024 * 1024) {
      toast.error("File too large. Maximum size is 20MB");
      return;
    }

    if (!file.type.includes("pdf")) {
      toast.error("Only PDF files are supported");
      return;
    }

    setUploading(true);
    
    // Simulate upload and OCR processing
    setTimeout(() => {
      const newStatement: Statement = {
        id: Date.now().toString(),
        accountId: "acc_1",
        accountName: "Business Checking",
        month: new Date(),
        fileName: file.name,
        fileSize: file.size,
        uploadedAt: new Date(),
        parsed: false,
      };

      setStatements([newStatement, ...statements]);
      setUploading(false);
      toast.success("Statement uploaded successfully");
    }, 2000);
  };

  const handleParseStatement = (statementId: string) => {
    toast.info("Parsing statement with OCR...");
    
    // Simulate OCR processing
    setTimeout(() => {
      setStatements(statements.map(stmt => 
        stmt.id === statementId 
          ? { ...stmt, parsed: true, transactionCount: Math.floor(Math.random() * 100) + 50 }
          : stmt
      ));
      toast.success("Statement parsed successfully");
    }, 3000);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  return (
    <div className="space-y-6">
      {/* Upload Section */}
      <Card className="border-border/50 shadow-card">
        <CardHeader>
          <CardTitle className="text-xl font-semibold flex items-center gap-2">
            <Upload className="h-5 w-5 text-accent" />
            Upload Statement
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border-2 border-dashed border-border rounded-lg p-8 text-center space-y-4">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-gradient-gold flex items-center justify-center">
                <FileText className="h-8 w-8 text-primary" />
              </div>
            </div>
            <div>
              <p className="font-medium mb-1">Upload PDF Statement</p>
              <p className="text-sm text-muted-foreground">Maximum file size: 20MB</p>
            </div>
            <Label htmlFor="statement-upload" className="cursor-pointer">
              <Button disabled={uploading} className="bg-gradient-gold hover:shadow-glow">
                {uploading ? (
                  <>Processing...</>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Select PDF File
                  </>
                )}
              </Button>
              <Input
                id="statement-upload"
                type="file"
                accept=".pdf"
                onChange={handleFileUpload}
                className="hidden"
              />
            </Label>
          </div>

          <div className="p-4 rounded-lg bg-accent/5 border border-accent/20">
            <p className="text-sm font-medium text-accent flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Statements are parsed with OCR to extract transactions automatically
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Statements Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Statement History</h3>
          <Badge variant="outline">{statements.length} total</Badge>
        </div>

        <div className="grid gap-4">
          {statements.map((statement) => (
            <Card key={statement.id} className="border-border/50 shadow-card hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex gap-4 flex-1">
                    <div className="w-12 h-12 rounded-lg bg-gradient-primary flex items-center justify-center flex-shrink-0">
                      <FileText className="h-6 w-6 text-primary-foreground" />
                    </div>
                    
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-3">
                        <h4 className="font-semibold">{statement.accountName}</h4>
                        <Badge variant="outline" className="gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(statement.month, "MMMM yyyy")}
                        </Badge>
                        {statement.parsed ? (
                          <Badge className="bg-success/10 text-success gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            Parsed
                          </Badge>
                        ) : (
                          <Badge className="bg-warning/10 text-warning gap-1">
                            <AlertCircle className="h-3 w-3" />
                            Not Parsed
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>{statement.fileName}</span>
                        <span>•</span>
                        <span>{formatFileSize(statement.fileSize)}</span>
                        {statement.transactionCount && (
                          <>
                            <span>•</span>
                            <span>{statement.transactionCount} transactions</span>
                          </>
                        )}
                      </div>

                      <p className="text-xs text-muted-foreground">
                        Uploaded {format(statement.uploadedAt, "MMM dd, yyyy 'at' h:mm a")}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!statement.parsed && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleParseStatement(statement.id)}
                      >
                        <Scan className="mr-2 h-4 w-4" />
                        Parse with OCR
                      </Button>
                    )}
                    <Button variant="outline" size="sm">
                      <Eye className="mr-2 h-4 w-4" />
                      View
                    </Button>
                    <Button variant="outline" size="sm">
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Info Card */}
      <Card className="border-border/50 shadow-card bg-gradient-to-br from-primary/5 to-accent/5">
        <CardContent className="pt-6 space-y-2 text-sm">
          <p className="font-medium">Statement Processing Features:</p>
          <ul className="space-y-1 text-muted-foreground ml-4">
            <li>• <strong>OCR Technology:</strong> Automatically extracts transactions from PDF statements</li>
            <li>• <strong>Data Augmentation:</strong> Supplements manual entries with uploaded documents</li>
            <li>• <strong>Reconciliation:</strong> Compare extracted data with manual banking entries</li>
            <li>• <strong>Historical Analysis:</strong> Access statements for any period you upload</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
