// §58 / §37 regression guard — the agency act-as landing.
//
// `/admin` is not only a door a person opens; it is a DESTINATION that shipped
// code redirects to. Two controls drill an agency operator into an authorized
// sub-account — `AccountSwitcher`'s row and `AgencyBoard`'s card — and both do the
// same two things: call `agency_enter_subaccount(child)`, which repoints
// `active_tenant_id` server-side, then `window.location.assign("/admin")`.
//
// The entry gate added to that door asks a multi-context person which workspace
// they want. An agency owner is ALWAYS multi-context — provisioning gives them an
// active owner membership in every child they create — so unless these producers
// record that the act-as IS the choice, the door intercepts a drill-down that has
// already happened and sends them to the chooser instead of the child. That broke
// a shipped capability, and it is the third distinct way this repair has done so.
//
// This is a STRUCTURAL guard, and it is honest about that: it reads the source
// rather than driving the components, which are heavy and network-bound. It
// proves the wiring exists and fails if either producer loses it. It does not
// prove the runtime behaviour — that is the authenticated drive's job.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const PRODUCERS = [
  "src/components/admin/AccountSwitcher.tsx",
  "src/pages/admin/AgencyBoard.tsx",
] as const;

describe("agency act-as landing on /admin", () => {
  it.each(PRODUCERS)("%s records the entry before handing off to the /admin door", (file) => {
    const src = readFileSync(file, "utf8");

    // It really is a producer of this destination.
    expect(src).toContain('agency_enter_subaccount');
    expect(src).toContain('window.location.assign("/admin")');

    // And it settles the door before leaving.
    const remembers = src.indexOf("rememberWorkspaceEntered(");
    const assigns = src.indexOf('window.location.assign("/admin")');
    expect(remembers).toBeGreaterThan(-1);
    expect(remembers).toBeLessThan(assigns);
  });
});
