// Comms C-1.5 — the merge-token default editor shared by Signatures + Snippets.
// Auto-detects {{tokens}} in the source text and renders ONE labelled Input per
// unique token (§36 domain-expert framing — never a raw JSON textarea, §11).
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { detectTokens } from "./mergeVars";

export function MergeVarEditor({
  source,
  values,
  onChange,
}: {
  /** the HTML / body text the tokens are detected from */
  source: string;
  values: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  const tokens = detectTokens(source);

  if (tokens.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Wrap a word in double braces — like{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">{"{{title}}"}</code>{" "}
        — and Paige fills it in for each person. Add one above and it shows up here.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Fill in what these should say by default.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {tokens.map((token) => {
          const pretty = token.replace(/[{}]/g, "");
          return (
            <div key={token} className="space-y-1.5">
              <Label htmlFor={`mv-${token}`} className="font-mono text-xs text-muted-foreground">
                {token}
              </Label>
              <Input
                id={`mv-${token}`}
                value={values[token] ?? ""}
                placeholder={`Default for ${pretty}`}
                onChange={(e) => onChange({ ...values, [token]: e.target.value })}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
