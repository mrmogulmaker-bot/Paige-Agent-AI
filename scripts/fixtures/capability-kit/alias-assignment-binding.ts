import * as governance from "./alias-barrel.ts";
declare const input: unknown;
let assignmentAlias;
({ governedDecision: assignmentAlias } = governance);
assignmentAlias(input);
