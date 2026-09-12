// Preload that registers the supabase-js stub loader hook before the smoke's imports resolve.
// See _metering-stub-hook.mjs for why (llm-trace.ts carries an esm.sh URL import Node cannot resolve).
import { register } from "node:module";
register("./_metering-stub-hook.mjs", import.meta.url);
