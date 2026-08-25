// Node ESM loader hook — lets the REAL workflow edge functions be imported under
// Node so these checks exercise the shipped handlers, not a copy of them.
// Both functions import supabase-js and the _shared helpers from esm.sh URLs.
// The supabase client is replaced by an injectable fake (see fake-supabase.mjs);
// the rail helper is stubbed to a no-op because it is best-effort by design and
// must never affect a dispatch decision.
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("https://esm.sh/@supabase/supabase-js")) {
    return { url: "stub:supabase", shortCircuit: true };
  }
  if (specifier.endsWith("railAutomation.ts")) return { url: "stub:rail", shortCircuit: true };
  if (specifier.endsWith("workflowDispatch.ts")) return { url: "stub:dispatch", shortCircuit: true };
  if (specifier.endsWith("platform-operator-tenant.ts")) return { url: "stub:operator-tenant", shortCircuit: true };
  if (specifier.startsWith("https://")) {
    throw new Error(`stub-hook: unexpected URL import ${specifier}`);
  }
  return nextResolve(specifier, context);
}
export async function load(url, context, nextLoad) {
  if (url === "stub:supabase") {
    return { format: "module", shortCircuit: true,
      source: "export function createClient(){ return globalThis.__FAKE_SUPABASE__; }\n" };
  }
  if (url === "stub:rail") {
    return { format: "module", shortCircuit: true,
      source: "export function contactHintsFromPayload(){return{contactId:null,email:null,phone:null};}\n" +
              "export async function emitAutomationRail(){ return; }\n" };
  }
  if (url === "stub:dispatch") {
    return { format: "module", shortCircuit: true,
      source: "export async function dispatchWorkflowRun(o){ (globalThis.__DISPATCH_CALLS__ ||= []).push(o); " +
              "return globalThis.__DISPATCH_RESULT__ ?? { status: 'running' }; }\n" };
  }
  if (url === "stub:operator-tenant") {
    return { format: "module", shortCircuit: true,
      source: "export async function platformOperatorTenantId(){ return null; }\n" };
  }
  return nextLoad(url, context);
}
