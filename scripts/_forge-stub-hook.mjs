// Node ESM loader hook — stubs `_shared/prompt-forge.ts` so the REAL skill-interpreter.ts can be
// imported under Node without pulling prompt-forge's `https://esm.sh/@supabase/supabase-js` URL
// import (which Node cannot resolve). The interpreter never calls the statically-imported forge —
// it uses the INJECTED deps.forge — so a throwing stub is correct: if it were ever called, that is
// itself a bug. This lets the §32 smoke exercise the genuine interpretSkill orchestration code.
export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith("prompt-forge.ts")) {
    return { url: "stub:prompt-forge", shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
export async function load(url, context, nextLoad) {
  if (url === "stub:prompt-forge") {
    return {
      format: "module",
      shortCircuit: true,
      source:
        'export function forge(){throw new Error("stub forge must not be called — deps.forge is injected");}\n' +
        'export class DoctrineViolation extends Error{}\n',
    };
  }
  return nextLoad(url, context);
}
