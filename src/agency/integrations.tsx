// @ts-nocheck
// Agency pack — the Integrations screen. Owner-locked port of the Claude Design
// "CRM agency mode" pack (§28/§30/§31/§63 — "we do not drift off this whatsoever").
//
// HONEST SCOPE NOTE (§13/§31): Integrations is NOT a fully-built screen in this
// design round. In "Agency Shell.dc.html" the nav item exists (navItem("Integrations",
// "⚡","integrations") ~L12602) but the "integrations" view is EXCLUDED from the
// real-screen whitelist at ~L9677, so it falls through to the GENERIC `isOther`
// placeholder (render block ~L4458–L4472). This file ports that GENERIC placeholder
// FAITHFULLY — the big label, the scope line, and the muted "not designed in this
// round" card — and deliberately does NOT invent a full integrations UI the design
// does not have.
//
// Source of truth — the isOther block (~L4458):
//   otherLabel  = OTHER[view][0]                     ("Integrations")
//   otherScope  = isSub ? "Sub-account scope" : "Agency scope"   (~L12818)
//   otherNote   = OTHER[view][1]                     (~L4468 / OTHER["integrations"] ~L8600)
// The DCLogic runtime is NOT ported — its markup, measurements and copy are mirrored
// onto React + the ./_shared primitives (Wrap/PageHead). The design hardcodes hex;
// this port keeps structural chrome token-driven so it themes light↔dark, while the
// decorative accent-plate palette (#EDEAFB / #4A3FA0) stays literal hex exactly as
// the pack does, per the handoff rule.
//
// §51 TIER GATE: crossBook = isAgency && !acting. The design's `isSub` (~L9603:
// `const isSub = !!acting`) maps to "showing this account's OWN numbers" — which for
// our contract is `!crossBook` (a standalone sub, isAgency=false, OR an agency
// acting-as, acting!=null, both collapse to their own scope; §9/§51, the #86 leak
// class). This placeholder has no cross-book aggregate / scope segment / sub-picker,
// so crossBook only flips the scope-line copy: Agency scope ↔ Sub-account scope.

import React from "react";
import { Wrap, PageHead } from "./_shared";
import { OTHER } from "./fixtures";

const noop = () => {};

const IntegrationsHub = ({ isAgency = true, acting = null, openAsk = noop }) => {
  // §51 — cross-book (agency-wide) only when an agency owner is NOT acting-as a sub.
  const crossBook = isAgency && !acting;

  // OTHER["integrations"] blurb — consumed from the one home (fixtures.ts, §18).
  const [otherLabel, otherNote] = OTHER.integrations;
  // otherScope (~L12818): design's `isSub ? "Sub-account scope" : "Agency scope"`,
  // where isSub === !crossBook for our tier contract.
  const otherScope = crossBook ? "Agency scope" : "Sub-account scope";

  return (
    <Wrap max={900}>
      <PageHead eyebrow={otherScope} title={otherLabel} />

      {/* Muted "not designed in this round" card — isOther block ~L4464–L4470. */}
      <div
        className="card"
        style={{ display: "grid", placeItems: "center", padding: "54px 26px" }}
      >
        <div style={{ maxWidth: 440, textAlign: "center" }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              // Decorative accent plate — literal hex, verbatim from the pack (~L4465).
              background: "#EDEAFB",
              color: "#4A3FA0",
              display: "grid",
              placeItems: "center",
              margin: "0 auto 14px",
              fontSize: 15,
            }}
          >
            ✦
          </div>
          <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 8 }}>
            {otherLabel} · not designed in this round
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--ink-2)" }}>
            {otherNote}
          </div>
        </div>
      </div>
    </Wrap>
  );
};

export default IntegrationsHub;
