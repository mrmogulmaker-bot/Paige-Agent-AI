import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Result = { title: string; url: string; content: string };

export default function TavilyIntegrationConfig() {
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);

  async function search() {
    if (!q.trim()) return;
    setBusy(true);
    setAnswer(null);
    setResults([]);
    const { data, error } = await supabase.functions.invoke("web-search", { body: { query: q } });
    setBusy(false);
    if (error) return toast.error(error.message);
    setAnswer(data?.answer ?? null);
    setResults((data?.results ?? []) as Result[]);
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Tavily Web Search</h1>
        <p className="text-sm text-muted-foreground">Configure <code>TAVILY_API_KEY</code> in Edge Function secrets. Test the connection below.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Test search</CardTitle><CardDescription>Verifies the <code>web-search</code> edge function and Tavily credentials.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5"><Label>Query</Label><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Latest n8n release notes" /></div>
          <Button onClick={search} disabled={busy}>Search</Button>
          {answer && <div className="rounded-md border p-3 text-sm whitespace-pre-wrap"><b>Answer:</b> {answer}</div>}
          {results.length > 0 && (
            <ul className="space-y-2">
              {results.map((r) => (
                <li key={r.url} className="text-sm">
                  <a href={r.url} target="_blank" rel="noreferrer" className="font-medium text-primary underline">{r.title}</a>
                  <p className="text-muted-foreground line-clamp-2">{r.content}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
