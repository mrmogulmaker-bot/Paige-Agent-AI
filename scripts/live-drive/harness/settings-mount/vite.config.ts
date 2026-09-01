/**
 * Vite config for the whole-Settings harness mount — SEPARATE from the app's, so a
 * dev-only unauthenticated mount of a tenant surface can never reach production
 * (§9). Its own `root` keeps this entry out of the app's build graph, and it
 * sidesteps the app config's hardcoded `host: "::"`, which fails in sandboxes with
 * no IPv6 stack.
 *
 * The two stubbed modules are the SAME FILES the Calendars mount aliases, not
 * copies (§18 — one home for the fake transport). Extending them for a new
 * destination therefore extends what both mounts see, and the Calendars drives act
 * as the collision check on any such change.
 *
 * Its own port, so a Settings drive and a Calendars drive can never contend for one
 * dev server — a leaked server on a shared port is how one failed run poisons the
 * next.
 */
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

const repo = path.resolve(import.meta.dirname, "../../../..");
const shared = path.resolve(import.meta.dirname, "../connections-mount");

export default defineConfig({
  root: import.meta.dirname,
  css: { postcss: repo },
  plugins: [react()],
  // Settings derives its destination from the URL, so a deep address typed
  // straight into the browser must serve the app rather than 404.
  appType: "spa",
  resolve: {
    alias: [
      // Must precede the generic "@" alias or neither ever matches.
      { find: /^@\/integrations\/supabase\/client$/, replacement: path.join(shared, "supabase-stub.ts") },
      { find: /^@\/hooks\/useTenantContext$/, replacement: path.join(shared, "tenant-context-stub.ts") },
      { find: "@", replacement: path.join(repo, "src") },
    ],
  },
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify("http://harness.invalid"),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify("harness-not-a-real-key"),
  },
  server: { host: "127.0.0.1", port: 5202, strictPort: true },
});
