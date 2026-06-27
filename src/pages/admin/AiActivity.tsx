import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

export default function AiActivity() {
  const project = "paige-agent-mma";
  return (
    <div className="container mx-auto px-4 py-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">AI Activity</h1>
        <p className="text-sm text-muted-foreground">Tracing for every Paige AI call (Anthropic + OpenAI) via LangSmith.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">LangSmith project <Badge variant="outline">{project}</Badge></CardTitle>
          <CardDescription>
            Traces are written from edge functions when <code>LANGSMITH_API_KEY</code> is configured. The full timeline (cost, latency, prompt/completion) lives in the LangSmith dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button asChild variant="outline" size="sm">
            <a href={`https://smith.langchain.com/o/-/projects/p/${project}`} target="_blank" rel="noreferrer" className="gap-1">
              Open LangSmith <ExternalLink className="size-3" />
            </a>
          </Button>
          <p className="text-xs text-muted-foreground">
            In-app trace browsing will appear here once Antonio approves the LangSmith API export (Phase 2.1).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
