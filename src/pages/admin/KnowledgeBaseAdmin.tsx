import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Brain, Plus, MoreVertical, Search, AlertTriangle, TrendingUp, Sparkles, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { AddDocumentDialog } from "@/components/admin/knowledge/AddDocumentDialog";
import { EditDocumentDialog } from "@/components/admin/knowledge/EditDocumentDialog";
import { KnowledgeInsightsTab } from "@/components/admin/knowledge/KnowledgeInsightsTab";

const DOC_TYPES = [
  "outcome_case",
  "coaching_insight",
  "credit_strategy",
  "funding_success",
  "denial_pattern",
  "market_intelligence",
  "pme_framework",
] as const;

const TYPE_COLORS: Record<string, string> = {
  outcome_case: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  coaching_insight: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30",
  credit_strategy: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  funding_success: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  denial_pattern: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
  market_intelligence: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30",
  pme_framework: "bg-accent/15 text-gold-dark border-accent/30",
};

interface RagDoc {
  id: string;
  document_type: string;
  title: string;
  summary: string | null;
  content: string;
  metadata: Record<string, any> | null;
  source: string | null;
  is_published: boolean;
  quality_score: number;
  usage_count: number;
  helpful_count: number;
  created_at: string;
}

export default function KnowledgeBaseAdmin() {
  const [docs, setDocs] = useState<RagDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<RagDoc | null>(null);

  const fetchDocs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("rag_documents" as any)
      .select("id, document_type, title, summary, content, metadata, source, is_published, quality_score, usage_count, helpful_count, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      toast.error("Failed to load documents");
      setDocs([]);
    } else {
      setDocs((data as any) || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchDocs(); }, []);

  const filtered = useMemo(() => {
    return docs.filter((d) => {
      if (typeFilter !== "all" && d.document_type !== typeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!d.title.toLowerCase().includes(q) && !(d.content || "").toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [docs, typeFilter, search]);

  const handleSuppress = async (doc: RagDoc) => {
    const { error } = await supabase
      .from("rag_documents" as any)
      .update({ is_published: !doc.is_published } as any)
      .eq("id", doc.id);
    if (error) { toast.error(error.message); return; }
    toast.success(doc.is_published ? "Document suppressed" : "Document published");
    fetchDocs();
  };

  const handleBoost = async (doc: RagDoc) => {
    const { error } = await supabase
      .from("rag_documents" as any)
      .update({ quality_score: 0.9 } as any)
      .eq("id", doc.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Quality boosted to 0.90");
    fetchDocs();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Brain className="w-7 h-7 text-accent" />
          <div>
            <h1 className="text-3xl font-bold text-foreground">Knowledge Base</h1>
            <p className="text-muted-foreground mt-1">
              Paige's proprietary RAG corpus — auto-generated outcomes, coaching insights, and curated frameworks.
            </p>
          </div>
        </div>
        <Button onClick={() => setShowAdd(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Add Document
        </Button>
      </div>

      <Tabs defaultValue="library">
        <TabsList>
          <TabsTrigger value="library" className="gap-2">
            <BookOpen className="w-4 h-4" /> Library
          </TabsTrigger>
          <TabsTrigger value="insights" className="gap-2">
            <TrendingUp className="w-4 h-4" /> Insights
          </TabsTrigger>
        </TabsList>

        <TabsContent value="library" className="space-y-4 mt-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search title or content..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-full md:w-[220px]">
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    {DOC_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {loading ? "Loading…" : `${filtered.length} document${filtered.length === 1 ? "" : "s"}`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="w-[140px]">Quality</TableHead>
                      <TableHead className="text-right">Usage</TableHead>
                      <TableHead className="text-right">Helpful</TableHead>
                      <TableHead className="text-right">Helpful %</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 && !loading && (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-muted-foreground py-12">
                          No documents yet — use "Add Document" or wait for automated ingestion.
                        </TableCell>
                      </TableRow>
                    )}
                    {filtered.map((doc) => {
                      const helpfulRate = doc.usage_count > 0
                        ? (doc.helpful_count / doc.usage_count) * 100
                        : 0;
                      const flagged = doc.usage_count >= 10 && helpfulRate < 30;
                      return (
                        <TableRow key={doc.id}>
                          <TableCell className="font-medium max-w-[300px] truncate" title={doc.title}>
                            {doc.title}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={TYPE_COLORS[doc.document_type] || ""}>
                              {doc.document_type.replace(/_/g, " ")}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress value={doc.quality_score * 100} className="h-2" />
                              <span className="text-xs text-muted-foreground tabular-nums w-10">
                                {doc.quality_score.toFixed(2)}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{doc.usage_count}</TableCell>
                          <TableCell className="text-right tabular-nums">{doc.helpful_count}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {doc.usage_count > 0 ? `${helpfulRate.toFixed(0)}%` : "—"}
                          </TableCell>
                          <TableCell>
                            {!doc.is_published ? (
                              <Badge variant="secondary">Suppressed</Badge>
                            ) : flagged ? (
                              <Badge variant="outline" className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 gap-1">
                                <AlertTriangle className="w-3 h-3" /> Flagged
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                                Published
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(doc.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreVertical className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setEditing(doc)}>Edit</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleBoost(doc)}>
                                  <Sparkles className="w-3.5 h-3.5 mr-2" /> Boost quality (0.90)
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleSuppress(doc)}>
                                  {doc.is_published ? "Suppress" : "Publish"}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="insights" className="mt-4">
          <KnowledgeInsightsTab docs={docs} typeColors={TYPE_COLORS} />
        </TabsContent>
      </Tabs>

      <AddDocumentDialog
        open={showAdd}
        onOpenChange={setShowAdd}
        docTypes={DOC_TYPES as any}
        onSaved={fetchDocs}
      />
      <EditDocumentDialog
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        doc={editing}
        docTypes={DOC_TYPES as any}
        onSaved={fetchDocs}
      />
    </div>
  );
}
