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

// ---------------------------------------------------------------------------
// Build-version stamp (#177 — platform auto-update / soft-reload)
// ---------------------------------------------------------------------------
// A stable id for THIS build. On Vercel VERCEL_GIT_COMMIT_SHA is set per deploy;
// on GitHub Actions GITHUB_SHA; locally we fall back to a build timestamp so the
// value is always non-empty (an empty id must never register as an "update").
// The running app reads its own id via the injected __BUILD_ID__ constant; the
// deployed build publishes the SAME id at /version.json (emitted below), so a
// returning client can compare its baked-in id against the live one.
// A per-BUILD id (not per-commit): the commit SHA disambiguates forward deploys,
// and the base-36 timestamp nonce makes a Vercel "Redeploy"/rollback of the SAME
// commit still produce a new id — so an already-open tab detects it (#177). Both
// __BUILD_ID__ (baked into the bundle) and /version.json are stamped from this ONE
// constant, so a same-deploy client matches and only a genuinely newer build differs.
const BUILD_ID = `${
  process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || "dev"
}-${Date.now().toString(36)}`;

// Writes <outDir>/version.json = { buildId } so the DEPLOYED build id is fetchable
// from the same origin. Emits in `closeBundle` — which runs AFTER Vite copies the
// public dir into outDir — so the placeholder public/version.json can never clobber
// the real stamp, then reads it back and warns LOUDLY if it did (§32: a silently
// reverted stamp would break update detection with no error).
function versionStampPlugin() {
  let resolvedOutDir = path.resolve(__dirname, "dist");
  return {
    name: "paige-version-stamp",
    apply: "build" as const,
    configResolved(cfg: { build?: { outDir?: string }; root?: string }) {
      if (cfg.build?.outDir) {
        resolvedOutDir = path.isAbsolute(cfg.build.outDir)
          ? cfg.build.outDir
          : path.resolve(cfg.root || __dirname, cfg.build.outDir);
      }
    },
    closeBundle() {
      const target = path.join(resolvedOutDir, "version.json");
      try {
        fs.mkdirSync(resolvedOutDir, { recursive: true });
        fs.writeFileSync(target, JSON.stringify({ buildId: BUILD_ID }) + "\n");
        // Read-back assert: prove the stamp we intended is actually on disk.
        const written = JSON.parse(fs.readFileSync(target, "utf8")) as { buildId?: string };
        if (written.buildId !== BUILD_ID) {
          console.warn(
            `[version-stamp] version.json buildId mismatch — expected ${BUILD_ID}, got ${written.buildId}. Update detection may be broken.`,
          );
        }
      } catch (e) {
        // Non-fatal: a missing version.json just disables update detection.
        console.warn("[version-stamp] failed to write version.json:", e);
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), wellKnownPlugin(), versionStampPlugin()],

  // Bake the build id in so the running app knows its own version (#177).
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },

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
