import * as governance from "./alias-barrel.ts";
declare const input: unknown;
function invokeThroughParameter({ governedDecision: parameterAlias }) {
  parameterAlias(input);
}
invokeThroughParameter(governance);
