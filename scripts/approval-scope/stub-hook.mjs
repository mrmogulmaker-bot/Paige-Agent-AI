// Node ESM loader hook — lets the REAL edge functions under test be imported by Node,
// so these checks exercise the shipped handlers rather than a copy of them.
//
// Only the module BOUNDARY is stubbed: the supabase client (replaced by an injectable
// fake), `zod` (schema construction only — the refusal path under test never parses),
// and two `_shared` helpers that subagent-forge imports but that are irrelevant to
// tenant attribution. Nothing inside the handlers is replaced.
const SUPABASE_SPECIFIERS = [
  "npm:@supabase/supabase-js@2",
  "https://esm.sh/@supabase/supabase-js@2",
];

export async function resolve(specifier, context, nextResolve) {
  if (SUPABASE_SPECIFIERS.includes(specifier)) {
    return { url: "stub:supabase", shortCircuit: true };
  }
  if (specifier.endsWith("/cors")) return { url: "stub:cors", shortCircuit: true };
  if (specifier.startsWith("npm:zod")) return { url: "stub:zod", shortCircuit: true };
  if (specifier.endsWith("finance-gate.ts")) return { url: "stub:finance", shortCircuit: true };
  if (specifier.endsWith("model-router.ts")) return { url: "stub:router", shortCircuit: true };
  if (specifier.startsWith("npm:") || specifier.startsWith("https://")) {
    throw new Error(`stub-hook: unexpected remote import ${specifier}`);
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url === "stub:supabase") {
    return {
      format: "module", shortCircuit: true,
      source: "export function createClient(){ return globalThis.__FAKE_SUPABASE__; }\n",
    };
  }
  if (url === "stub:cors") {
    return {
      format: "module", shortCircuit: true,
      source: "export const corsHeaders = { 'access-control-allow-origin': '*' };\n",
    };
  }
  if (url === "stub:zod") {
    // Builder-only: enough for module-level schema construction. `.parse()` throws so a
    // test can never silently pass through a parse the refusal path was meant to skip.
    return {
      format: "module", shortCircuit: true,
      source: `
// Any builder method returns the same chainable node; only parse() is special.
const node = () => new Proxy(function(){}, {
  get(_t, prop) {
    if (prop === "parse" || prop === "safeParse") {
      return () => { throw new Error("stub-zod: parse() must not be reached in these checks"); };
    }
    if (prop === "then") return undefined;
    return () => node();
  },
  apply() { return node(); },
});
export const z = new Proxy({}, { get: () => node });
export default z;
`,
    };
  }
  if (url === "stub:finance") {
    return {
      format: "module", shortCircuit: true,
      source: "export function looksLikeFinanceAgent(){ return false; }\n",
    };
  }
  if (url === "stub:router") {
    return {
      format: "module", shortCircuit: true,
      source: "export const DEFAULT_SUBAGENT_JOB_KIND='general';\nexport function isJobKind(){ return true; }\n",
    };
  }
  return nextLoad(url, context);
}
