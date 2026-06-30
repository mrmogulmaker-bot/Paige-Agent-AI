import { useState } from "react";
import { ChevronDown, ChevronUp, Sparkles, AlertCircle, CheckCircle2 } from "lucide-react";

export interface RootCauseAnalysis {
  framework_used: "5-whys" | "fishbone" | "mece" | string;
  framework_reason?: string;
  problem_restated?: string;
  root_causes: Array<{
    cause: string;
    evidence?: string;
    confidence?: number;
    category?: string;
  }>;
  recommended_actions?: Array<{
    action: string;
    paige_skill_or_workflow?: string | null;
    owner?: "client" | "coach" | "paige" | string;
    priority?: "now" | "soon" | "later" | string;
  }>;
  open_questions?: string[];
  escalate_to_human?: boolean;
}

interface RootCauseCardProps {
  data: RootCauseAnalysis;
}

const frameworkLabel: Record<string, string> = {
  "5-whys": "5 Whys",
  fishbone: "Fishbone",
  mece: "MECE Tree",
};

const ownerColor: Record<string, string> = {
  client: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  coach: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  paige: "bg-accent/10 text-accent border-accent/30",
};

const priorityColor: Record<string, string> = {
  now: "bg-red-500/10 text-red-400 border-red-500/30",
  soon: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  later: "bg-muted text-muted-foreground border-border",
};

export function RootCauseCard({ data }: RootCauseCardProps) {
  const [expanded, setExpanded] = useState(false);
  const causeCount = data.root_causes?.length ?? 0;
  const actionCount = data.recommended_actions?.length ?? 0;

  return (
    <div className="mt-2 rounded-lg border border-accent/30 bg-gradient-to-br from-accent/5 to-transparent overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent/5 transition-colors text-left"
      >
        <Sparkles className="w-4 h-4 text-accent flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] sm:text-xs font-semibold text-accent uppercase tracking-wide">
            Root-Cause Analysis · {frameworkLabel[data.framework_used] ?? data.framework_used}
          </div>
          <div className="text-[11px] sm:text-xs text-muted-foreground truncate">
            {causeCount} cause{causeCount === 1 ? "" : "s"} · {actionCount} action{actionCount === 1 ? "" : "s"}
            {data.escalate_to_human ? " · escalation suggested" : ""}
          </div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-3 border-t border-accent/20">
          {data.problem_restated && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Problem</div>
              <p className="text-xs sm:text-sm">{data.problem_restated}</p>
            </div>
          )}

          {data.framework_reason && (
            <p className="text-[11px] text-muted-foreground italic">Why this framework: {data.framework_reason}</p>
          )}

          {causeCount > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Root causes</div>
              <ul className="space-y-1.5">
                {data.root_causes.map((c, i) => (
                  <li key={i} className="text-xs sm:text-sm flex gap-2">
                    <AlertCircle className="w-3.5 h-3.5 text-accent mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="font-medium">{c.cause}</div>
                      {c.evidence && <div className="text-[11px] text-muted-foreground mt-0.5">{c.evidence}</div>}
                      <div className="flex gap-1.5 mt-1 text-[10px]">
                        {c.category && <span className="px-1.5 py-0.5 rounded border border-border text-muted-foreground">{c.category}</span>}
                        {typeof c.confidence === "number" && (
                          <span className="px-1.5 py-0.5 rounded border border-border text-muted-foreground">
                            confidence {Math.round(c.confidence * 100)}%
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {actionCount > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Recommended actions</div>
              <ul className="space-y-1.5">
                {data.recommended_actions!.map((a, i) => (
                  <li key={i} className="text-xs sm:text-sm flex gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-accent mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <div>{a.action}</div>
                      <div className="flex gap-1.5 mt-1 text-[10px] flex-wrap">
                        {a.owner && (
                          <span className={`px-1.5 py-0.5 rounded border ${ownerColor[a.owner] ?? "border-border text-muted-foreground"}`}>
                            {a.owner}
                          </span>
                        )}
                        {a.priority && (
                          <span className={`px-1.5 py-0.5 rounded border ${priorityColor[a.priority] ?? "border-border text-muted-foreground"}`}>
                            {a.priority}
                          </span>
                        )}
                        {a.paige_skill_or_workflow && (
                          <span className="px-1.5 py-0.5 rounded border border-accent/30 bg-accent/5 text-accent font-mono">
                            {a.paige_skill_or_workflow}
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.open_questions && data.open_questions.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Open questions</div>
              <ul className="space-y-0.5 list-disc list-inside text-xs text-muted-foreground">
                {data.open_questions.map((q, i) => <li key={i}>{q}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Extract a fenced ```root-cause-analysis JSON``` block from an assistant message.
 * Returns { before, analysis, after } so the chat surface can render markdown
 * + the structured card + trailing markdown.
 */
export function extractRootCauseAnalysis(content: string): {
  before: string;
  analysis: RootCauseAnalysis | null;
  after: string;
} {
  const re = /```root-cause-analysis\s*\n([\s\S]*?)\n```/i;
  const m = content.match(re);
  if (!m) return { before: content, analysis: null, after: "" };
  try {
    const parsed = JSON.parse(m[1]);
    if (!parsed?.framework_used || !Array.isArray(parsed?.root_causes)) {
      return { before: content, analysis: null, after: "" };
    }
    return {
      before: content.slice(0, m.index!).trim(),
      analysis: parsed as RootCauseAnalysis,
      after: content.slice(m.index! + m[0].length).trim(),
    };
  } catch {
    return { before: content, analysis: null, after: "" };
  }
}
