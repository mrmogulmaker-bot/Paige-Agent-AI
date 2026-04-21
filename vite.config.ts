import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
// NOTE: VitePWA / workbox precaching has been intentionally REMOVED.
// It was generating a service worker that cached index.html + JS/CSS bundles,
// causing users to see stale builds after we published updates (they had to
// refresh twice — or hard-refresh — to get the new version).
//
// Push-notification support still works via the hand-written /public/sw.js,
// which is registered on demand by usePushNotifications and does NOT cache
// any app assets. "Add to Home Screen" still works via /public/manifest
// links in index.html / icons.
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "@tanstack/react-query",
      "@radix-ui/react-tooltip",
    ],
    force: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          "query-vendor": ["@tanstack/react-query"],
          "ui-vendor": ["@radix-ui/react-dialog", "@radix-ui/react-dropdown-menu", "@radix-ui/react-tabs"],
          "chart-vendor": ["recharts"],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
}));
