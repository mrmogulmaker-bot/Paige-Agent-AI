// Shared probe: report every TS2304 ("Cannot find name") in a TypeScript source string.
// TS2304 is exactly the defect class this suite exists to prove — an identifier used at a
// site where no declaration is in scope. Under ESM implicit strict mode (index.ts uses
// `import`, so the module is always strict) such a use is a runtime ReferenceError, not a
// silent global. Module specifiers are deliberately left unresolved (noResolve) so the
// esm.sh / deno.land URL imports do not have to exist for the scope question to be answered;
// unresolved-import diagnostics are a different code (TS2307) and are not consulted here.
import ts from "typescript";

export function findCannotFindName(source, fileName = "probe.ts") {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const host = ts.createCompilerHost({});
  const originalGetSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, ...rest) => (name === fileName ? sf : originalGetSourceFile(name, ...rest));
  const originalReadFile = host.readFile.bind(host);
  const originalFileExists = host.fileExists.bind(host);
  host.readFile = (name) => (name === fileName ? source : originalReadFile(name));
  host.fileExists = (name) => (name === fileName ? true : originalFileExists(name));
  const program = ts.createProgram([fileName], {
    noEmit: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noResolve: true,
    skipLibCheck: true,
    types: [],
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
  }, host);
  return program.getSemanticDiagnostics(program.getSourceFile(fileName))
    .filter((d) => d.code === 2304)
    .map((d) => ({
      line: sf.getLineAndCharacterOfPosition(d.start).line + 1,
      message: ts.flattenDiagnosticMessageText(d.messageText, " "),
    }));
}
