import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

const repo = process.cwd();
const mount = path.join(repo, "scripts/live-drive/harness/marketplace-mount");
export default defineConfig({
  root: mount, css: { postcss: repo }, plugins: [react()],
  resolve: { alias: [
    { find: "./data/useSoloMarketplace", replacement: path.join(mount, "useSoloMarketplace-stub.ts") },
    { find: "@/components/admin/AdminBridgeBell", replacement: path.join(mount, "shell-stubs.tsx") },
    { find: "@/components/admin/voice/DialPadTrigger", replacement: path.join(mount, "shell-stubs.tsx") },
    { find: "@", replacement: path.join(repo, "src") },
  ] },
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify("http://harness.invalid"),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify("harness-not-a-real-key"),
  },
  server: { host: "127.0.0.1", port: 5202, strictPort: true },
});
