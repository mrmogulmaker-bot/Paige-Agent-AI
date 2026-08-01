/// <reference types="vite/client" />

// Build id baked in at build time (#177 — platform auto-update / soft-reload).
// Defined via `define: { __BUILD_ID__ }` in vite.config.ts. Always a non-empty
// string; in dev builds it is a `dev-<timestamp>` fallback.
declare const __BUILD_ID__: string;
