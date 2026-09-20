import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export async function load(url, context, nextLoad) {
  if (url.startsWith("file://") && url.endsWith(".ts")) {
    const filePath = fileURLToPath(url);
    const source = await readFile(filePath, "utf8");
    const result = ts.transpileModule(source, {
      fileName: filePath,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
      },
    });
    return { format: "module", source: result.outputText, shortCircuit: true };
  }
  return nextLoad(url, context);
}
