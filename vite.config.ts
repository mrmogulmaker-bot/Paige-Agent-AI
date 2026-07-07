import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";

// Serve /.well-known/* JSON files (oauth-protected-resource,
// oauth-authorization-server) in dev. Static dotfile dirs are otherwise
// filtered by sirv/Vite's default config, but MCP clients require them at the
// host root. Production CDN serves them straight from /public/.well-known/.
function wellKnownPlugin() {
  return {
    name: "well-known-static",
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        if (req.url && req.url.startsWith("/.well-known/")) {
          const rel = req.url.split("?")[0];
          const fp = path.resolve(__dirname, "public" + rel);
          if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Cache-Control", "no-store");
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.end(fs.readFileSync(fp));
            return;
          }
        }
        next();
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), wellKnownPlugin()],

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
