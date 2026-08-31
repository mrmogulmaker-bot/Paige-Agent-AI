/**
 * Registers the knowledge-scope loader. Imported for side effect BEFORE the module
 * under test, e.g. `node --import ./scripts/knowledge-scope/register.mjs <check>`.
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";
register("./stub-hook.mjs", pathToFileURL(import.meta.filename));
