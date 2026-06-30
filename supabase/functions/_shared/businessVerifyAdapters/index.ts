import type { VerifyAdapter } from "./types.ts";
import { sosAdapter } from "./sos.ts";
import { openCorporatesAdapter } from "./opencorporates.ts";
import { secEdgarAdapter } from "./secEdgar.ts";
import { dnbAdapter } from "./dnb.ts";
import { lexisNexisAdapter } from "./lexisnexis.ts";
import { transUnionBizAdapter } from "./transunion.ts";
import { arrayAdapter } from "./array.ts";

export const ALL_ADAPTERS: VerifyAdapter[] = [
  sosAdapter,
  openCorporatesAdapter,
  secEdgarAdapter,
  dnbAdapter,
  lexisNexisAdapter,
  transUnionBizAdapter,
  arrayAdapter,
];

export * from "./types.ts";
