import { governedDecision as fallback } from "./alias-barrel.ts";
import * as governance from "./alias-barrel.ts";
declare const input: unknown;
const { governedDecision: defaultedAlias = fallback } = governance;
defaultedAlias(input);
