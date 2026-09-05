// Preload that registers the loader hook before the checks import the real edge module.
import { register } from "node:module";
register("./edge-stub-hook.mjs", import.meta.url);
