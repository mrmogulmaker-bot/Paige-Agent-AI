import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./typescript-hook.mjs", pathToFileURL(import.meta.filename));
