// Doctrine §200 — Platform Independence Weekly Sweep
//
// Scans platform source paths for tenant-leak signatures and files
// high-severity paige_admin_notifications for each violation. Excludes
// legitimate tenant-config paths where MMA references are expected.
//
// Trigger: pg_cron weekly (`doctrine_200_weekly_sweep`) OR manual POST.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GITHUB_REPO = Deno.env.get("GITHUB_REPO") ?? "";
const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Signatures that indicate MMA/tenant leakage in platform code.
const SIGNATURES: { name: string; pattern: RegExp; severity: "high" | "medium" }[] = [
  { name: "mma_identifier", pattern: /\bmma[_-]/i, severity: "high" },
  { name: "mogul_maker_literal", pattern: /mogul[_\- ]?maker/i, severity: "high" },
  { name: "btf_platform_primitive", pattern: /\bBTF\b/, severity: "high" },
  { name: "skool_platform_reference", pattern: /\bskool\b/i, severity: "medium" },
  {
    name: "hardcoded_mma_uuid",
    // Any explicit UUID literal in platform code is suspect; reviewer justifies.
    pattern: /['"][0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}['"]/i,
    severity: "medium",
  },
];

// Paths where MMA/tenant references are legitimate and MUST be excluded.
const ALLOWLIST_PATH_FRAGMENTS = [
  "tenant_configuration",
  "master_tenant_capabilities",
  "docs/",
  "supabase/migrations/",
  ".workspace/",
  "src/integrations/supabase/types.ts",
  "platform-independence-sweep",
  "DOCTRINE_",
];

interface Violation {
  path: string;
  line: number;
  signature: string;
  severity: "high" | "medium";
  snippet: string;
}

function isAllowlisted(path: string): boolean {
  return ALLOWLIST_PATH_FRAGMENTS.some((f) => path.includes(f));
}

function scanText(path: string, text: string): Violation[] {
  const violations: Violation[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const sig of SIGNATURES) {
      if (sig.pattern.test(line)) {
        violations.push({
          path,
          line: i + 1,
          signature: sig.name,
          severity: sig.severity,
          snippet: line.trim().slice(0, 200),
        });
      }
    }
  }
  return violations;
}

async function fetchRepoTree(): Promise<{ path: string; url: string }[]> {
  if (!GITHUB_REPO || !GITHUB_TOKEN) return [];
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/git/trees/HEAD?recursive=1`,
    { headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, "User-Agent": "paige-sweep" } },
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.tree ?? [])
    .filter((n: any) => n.type === "blob")
    .filter((n: any) =>
      /\.(ts|tsx|js|jsx|sql|md|json)$/.test(n.path) &&
      (n.path.startsWith("src/") || n.path.startsWith("supabase/functions/"))
    )
    .map((n: any) => ({
      path: n.path,
      url: `https://raw.githubusercontent.com/${GITHUB_REPO}/HEAD/${n.path}`,
    }));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const files = await fetchRepoTree();
    const violations: Violation[] = [];

    for (const f of files) {
      if (isAllowlisted(f.path)) continue;
      const res = await fetch(f.url, {
        headers: GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {},
      });
      if (!res.ok) continue;
      const text = await res.text();
      violations.push(...scanText(f.path, text));
    }

    const high = violations.filter((v) => v.severity === "high");

    if (violations.length > 0) {
      await admin.from("paige_admin_notifications").insert({
        severity: high.length > 0 ? "high" : "medium",
        category: "doctrine_200_platform_independence",
        title: `§200 sweep: ${violations.length} violation(s) — ${high.length} high`,
        body:
          `Platform-independence weekly sweep found ${violations.length} matches ` +
          `(${high.length} high). Each requires justification: (a) tenant_config path, ` +
          `(b) explicit master-tenant capability grant, or (c) violation to fix.\n\n` +
          violations.slice(0, 50).map((v) =>
            `[${v.severity}] ${v.signature} — ${v.path}:${v.line}\n  ${v.snippet}`
          ).join("\n\n"),
        payload: { violations },
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        scanned_files: files.length,
        violations: violations.length,
        high_severity: high.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
