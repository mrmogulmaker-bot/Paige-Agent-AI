import * as governance from "./alias-barrel.ts";
declare const input: unknown;
const wrapper = { nested: governance };
const { nested: { governedDecision: nestedAlias } } = wrapper;
nestedAlias(input);
