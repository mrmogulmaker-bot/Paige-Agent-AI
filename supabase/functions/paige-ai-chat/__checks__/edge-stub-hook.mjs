// Node ESM loader hook — lets the REAL paige-ai-chat/index.ts be imported under Node so the
// behavioural checks exercise the genuine shipped code rather than a copy of it.
//
// index.ts is a Deno edge function and carries exactly three URL imports. Two of them resolve
// to packages this repo already installs, so they are redirected to the REAL library (the zod
// schemas and createClient shape stay honest). The third is Deno's std HTTP server, whose only
// export index.ts uses is `serve` — stubbed to a no-op so importing the module does not bind a
// port. Nothing else is intercepted: every `_shared/*` module loads for real.
const REDIRECTS = [
  ["https://esm.sh/@supabase/supabase-js", "@supabase/supabase-js"],
  ["https://esm.sh/zod", "zod"],
];

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("https://deno.land/std") && specifier.includes("/http/server.ts")) {
    return { url: "stub:deno-http-server", shortCircuit: true };
  }
  for (const [prefix, replacement] of REDIRECTS) {
    if (specifier.startsWith(prefix)) return nextResolve(replacement, context);
  }
  if (specifier.startsWith("https://")) {
    throw new Error(`edge-stub-hook: unexpected URL import ${specifier} — add a redirect or a stub deliberately`);
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url === "stub:deno-http-server") {
    return {
      format: "module",
      shortCircuit: true,
      // The handler is registered, never started — importing the module must not bind a port.
      source: "export let registeredHandler = null;\nexport function serve(handler){ registeredHandler = handler; }\n",
    };
  }
  return nextLoad(url, context);
}
