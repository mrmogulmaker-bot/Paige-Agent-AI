/**
 * Vite config for the Solo Calendar harness mount — SEPARATE from the app's.
 *
 * Its own `root` keeps this entry out of the app's build graph, so a dev-only
 * unauthenticated mount of a tenant surface can never reach production (§9). It
 * also sidesteps the app config's hardcoded `host: "::"`, which fails in sandboxes
 * with no IPv6 stack.
 *
 * The Supabase client is ALIASED to the harness stub. The Calendar issues real
 * queries (unlike the operator shell, which only constructs the client), so define
 * placeholders alone would leave every frame showing an error state. Aliasing the
 * transport keeps the shipped component, hook and CSS under measurement while the
 * data boundary answers deterministically.
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
      // Must precede the generic "@" alias or it never matches.
      { find: /^@\/integrations\/supabase\/client$/, replacement: path.join(import.meta.dirname, "supabase-stub.ts") },
      { find: "@", replacement: path.join(repo, "src") },
    ],
  },
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify("http://harness.invalid"),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify("harness-not-a-real-key"),
  },
  server: { host: "127.0.0.1", port: 5200, strictPort: true },
});
