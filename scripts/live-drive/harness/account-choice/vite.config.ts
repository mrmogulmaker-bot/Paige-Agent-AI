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
      { find: /^@\/hooks\/useTenantContext$/, replacement: path.join(import.meta.dirname, "tenant-context-stub.ts") },
      { find: /^@\/integrations\/supabase\/client$/, replacement: path.join(import.meta.dirname, "supabase-stub.ts") },
      { find: /^@\/integrations\/auth\/oauth$/, replacement: path.join(import.meta.dirname, "oauth-stub.ts") },
      { find: "@", replacement: path.join(repo, "src") },
    ],
  },
  server: { host: "127.0.0.1", port: 5214, strictPort: true },
});
