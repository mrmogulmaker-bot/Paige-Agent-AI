/**
 * OperatorApp — the Platform Operator (God-tier) console, mounted by `OperatorEntry` behind the
 * one `RequireOperator` guard.
 *
 * It is the ADDRESS the rest of the app knows ("the console"), and the shell behind that address
 * is now the six-slot geometry in `shell/OperatorShell.tsx`. Keeping the name here means the
 * mount point, the guard and the routing contract test all stay pointed at one stable module
 * while the shell behind it is rebuilt (§18 — one home; §30 — the rebuild replaces the old shell
 * rather than layering on it).
 *
 * The seventeen-branch shell this replaces is PRESERVED, not deleted, at
 * `src/operator/legacy/OperatorLegacyApp.tsx`. It is no longer mounted: its addresses
 * (`/operator/{branch}/{subtab}`) do not exist in the six-slot IA, so leaving it routed would put
 * two rival consoles on one prefix. It stays on disk because the surfaces it dispatches are real,
 * shipped work that the next round wires into the slots (§58 — nothing is dropped silently).
 */
export { default } from "@/operator/shell/OperatorShell";
