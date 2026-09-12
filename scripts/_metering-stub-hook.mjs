// Node ESM loader hook — stubs the `https://esm.sh/@supabase/supabase-js` URL import that
// `_shared/llm-trace.ts` carries, so the REAL llm-trace.ts and the REAL claude.ts can be imported
// under Node (which cannot resolve URL specifiers). Nothing else is stubbed: the code under test —
// the trace-record construction, the metadata/scope stamping, the usage normalisation and the
// buffered gateway path — is the genuine shipped code, not a re-embed.
//
// The stub's createClient returns a client whose .from(t).insert(rec) records the row into
// globalThis.__TRACE_INSERTS__, which is how the smoke observes what the writer actually produced.
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("https://esm.sh/@supabase/supabase-js")) {
    return { url: "stub:supabase-js", shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url === "stub:supabase-js") {
    return {
      format: "module",
      shortCircuit: true,
      source: `
export function createClient() {
  return {
    from(table) {
      return {
        insert(record) {
          const sink = (globalThis.__TRACE_INSERTS__ ||= []);
          sink.push({ table, record });
          // Mirror the PostgREST builder shape llm-trace.ts uses: .insert(...).abortSignal(...)
          const thenable = {
            abortSignal() { return thenable; },
            then(res) { return Promise.resolve({ data: null, error: null }).then(res); },
            catch(rej) { return Promise.resolve({ data: null, error: null }).catch(rej); },
          };
          return thenable;
        },
      };
    },
  };
}
`,
    };
  }
  return nextLoad(url, context);
}
