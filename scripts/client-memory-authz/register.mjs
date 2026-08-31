/**
 * Registers the loader. Imported for side effect BEFORE the module under test, e.g.
 * `node --import ./scripts/client-memory-authz/register.mjs <check>`.
 *
 * RUNTIME REQUIREMENTS — this is a CI gate (ci.yml `verify`), so its dependencies are
 * load-bearing rather than incidental:
 *   • `module.register()` needs Node >= 20.6 and `import.meta.filename` needs >= 20.11.
 *     CI pins via `actions/setup-node`; a downgrade below either fails LOUDLY (non-zero
 *     exit), never silently, so it cannot become a false green.
 *   • `stub-hook.mjs` transpiles the handler's TypeScript with `esbuild`, which is not a
 *     top-level dependency but IS pinned repo-wide in package.json `overrides`
 *     ("esbuild": "^0.25.10"), so `npm ci` reproduces it deterministically. Do NOT "fix"
 *     this by adding esbuild to devDependencies — npm rejects a direct dependency that
 *     collides with an override (EOVERRIDE) and the install fails.
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";
register("./stub-hook.mjs", pathToFileURL(import.meta.filename));
