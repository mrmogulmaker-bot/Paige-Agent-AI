/**
 * Vite config for the Settings › Integrations harness mount — SEPARATE from the
 * app's, so a dev-only unauthenticated mount of a tenant surface can never reach
 * production (§9). Its own `root` keeps this entry out of the app's build graph,
 * and it sidesteps the app config's hardcoded `host: "::"`, which fails in
 * sandboxes with no IPv6 stack.
 *
 * Two modules are aliased and no others: the Supabase transport and the tenant
 * context. Everything measured — the view, the data hook's own logic, the CSS —
 * is the shipped code.
 */
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

const repo = path.resolve(import.meta.dirname, "../../../..");

export default defineConfig({
  root: import.meta.dirname,
  css: { postcss: repo },
  plugins: [react()],
  resolve: {
    alias: [
      // Must precede the generic "@" alias or neither ever matches.
      { find: /^@\/integrations\/supabase\/client$/, replacement: path.join(import.meta.dirname, "supabase-stub.ts") },
      { find: /^@\/hooks\/useTenantContext$/, replacement: path.join(import.meta.dirname, "tenant-context-stub.ts") },
      { find: "@", replacement: path.join(repo, "src") },
    ],
  },
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify("http://harness.invalid"),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify("harness-not-a-real-key"),
  },
  server: { host: "127.0.0.1", port: 5203, strictPort: true },
});
