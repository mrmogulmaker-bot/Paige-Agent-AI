/**
 * Vite config for the hotfix render harness — deliberately SEPARATE from the app's, exactly like
 * the operator-shell mount beside it. Its own `root` keeps this entry out of the app's build graph
 * entirely, so `npm run build` never sees it and a dev-only unauthenticated mount cannot reach
 * production (§9). It also sidesteps the app config's hardcoded `host: "::"`, which fails in
 * sandboxes with no IPv6 stack.
 */
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

const repo = path.resolve(import.meta.dirname, "../../../..");

export default defineConfig({
  root: import.meta.dirname,
  css: { postcss: repo },
  plugins: [react()],
  resolve: { alias: { "@": path.join(repo, "src") } },
  /**
   * DELIBERATELY, VISIBLY FAKE and never to be replaced with real ones. The Supabase client is
   * constructed for real and issues a real PostgREST request; the DRIVER intercepts it at the
   * network layer and answers it. Nothing here needs — or may have — a live credential
   * (§13/§34: names in artifacts, never values).
   */
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify("http://harness.invalid"),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify("harness-not-a-real-key"),
  },
  server: { host: "127.0.0.1", port: 5198, strictPort: true },
});
