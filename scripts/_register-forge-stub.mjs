// Preload that registers the prompt-forge stub loader hook before the smoke's imports resolve.
// See _forge-stub-hook.mjs for why (avoids prompt-forge's esm.sh URL import under Node).
import { register } from "node:module";
register("./_forge-stub-hook.mjs", import.meta.url);
