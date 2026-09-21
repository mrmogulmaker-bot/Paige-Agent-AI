import { governedDecision as decide } from "./alias-barrel.ts";
import * as governance from "./alias-barrel.ts";

declare const input: unknown;

decide(input);
governance.governedDecision(input);
function invokeThroughLocalAlias() {
  const localAlias = decide;
  localAlias(input);
}
invokeThroughLocalAlias();
