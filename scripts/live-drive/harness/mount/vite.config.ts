/**
 * Vite config for the harness mount — deliberately SEPARATE from the app's.
 *
 * Its own `root` keeps this entry out of the app's build graph entirely: `npm run build` never
 * sees it, so a dev-only unauthenticated mount of the operator console cannot reach production
 * (§9). It also sidesteps the app config's hardcoded `host: "::"`, which fails in sandboxes with
 * no IPv6 stack — the reason an earlier pass wrongly concluded local rendering was impossible.
 */
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

const repo = path.resolve(import.meta.dirname, "../../../..");

export default defineConfig({
  root: import.meta.dirname,
  // PostCSS (and therefore Tailwind) is discovered from the vite root, which is this folder —
  // so it is pointed back at the repo explicitly. Without this the shell renders unstyled and
  // every geometry measurement is of the wrong thing.
  css: { postcss: repo },
  plugins: [react()],
  resolve: { alias: { "@": path.join(repo, "src") } },
  /**
   * The shell reaches the Supabase client TRANSITIVELY — `signOut` imports it, and the client
   * throws `supabaseUrl is required` at MODULE INIT, before a single pixel is laid out. Found by
   * rendering, not by reading imports: the shell's own import list has no Supabase in it.
   *
   * These values are DELIBERATELY, VISIBLY FAKE and must never be replaced with real ones. A
   * geometry render issues no query, so the client is only ever constructed, never used — and a
   * harness that needed live credentials to measure a layout would be a credential leak wearing a
   * test's clothes (§13/§34: names in artifacts, never values).
   */
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify("http://harness.invalid"),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify("harness-not-a-real-key"),
  },
  server: { host: "127.0.0.1", port: 5199, strictPort: true },
});
