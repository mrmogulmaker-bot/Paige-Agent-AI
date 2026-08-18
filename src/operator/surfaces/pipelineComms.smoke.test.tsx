/**
 * Render smoke for the compose / support / pipeline surfaces.
 *
 * A green `tsc` proves these files type-check; it proves nothing about whether they RUN
 * (§32). These cases drive the null-heavy paths — the ones a not-yet-connected console
 * actually hits — and lock the invariant the whole port rests on: an em dash is a statement
 * that a NUMBER is unknown, so it must never be spent on prose.
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ComposeSurface } from "./ComposeSurface";
import { SupportThread } from "./SupportThread";
import { PipelineHead, PipelineBoard, StageBoard } from "./PipelineSurfaces";

const lane = {
  id: "l",
  label: "L",
  count: null,
  value: null,
  cards: [{ id: "x", name: "X", age: null, mrr: null, tier: null, next: null, source: null }],
};

describe("operator comms + pipeline surfaces", () => {
  it("renders with nothing supplied", () => {
    expect(renderToStaticMarkup(<ComposeSurface subject={null} body={null} />)).toBeTruthy();
    expect(renderToStaticMarkup(<SupportThread clock={null} draft={null} />)).toBeTruthy();
    expect(renderToStaticMarkup(<PipelineHead weighted={null} rawTotal={null} />)).toBeTruthy();
    expect(renderToStaticMarkup(<PipelineBoard columns={[]} />)).toBeTruthy();
    expect(renderToStaticMarkup(<StageBoard lanes={[]} />)).toBeTruthy();
  });

  it("renders a null-heavy board without throwing", () => {
    const html = renderToStaticMarkup(
      <PipelineBoard
        columns={[
          { id: "c1", label: "C1", count: null, value: null, prob: null, cards: [] },
          {
            id: "c2",
            label: "C2",
            count: null,
            value: null,
            prob: null,
            cards: [
              {
                id: "d1",
                name: "D",
                mrr: null,
                tier: null,
                next: null,
                close: null,
                owner: null,
                score: null,
                stale: true,
                touch: null,
              },
            ],
            more: { label: "+1 more" },
          },
        ]}
        onMoveDeal={() => {}}
      />,
    );
    expect(html).toContain("C1");
    expect(html).toContain("No deals in this stage.");
  });

  it("withholds the category bar when any share is missing or not finite", () => {
    const partial = renderToStaticMarkup(
      <PipelineHead
        weighted={null}
        rawTotal={null}
        categories={[
          { id: "a", label: "A", value: null, share: 60 },
          { id: "b", label: "B", value: null, share: null },
        ]}
      />,
    );
    const nonFinite = renderToStaticMarkup(
      <PipelineHead
        weighted={null}
        rawTotal={null}
        categories={[{ id: "a", label: "A", value: null, share: Number.NaN }]}
      />,
    );
    expect(partial).not.toContain("width:");
    expect(nonFinite).not.toContain("width:");
  });

  it("never spends an em dash on prose", () => {
    /*
     * The defect shape is an em dash standing alone as an element's ENTIRE content where
     * prose was expected. A lone em dash is still correct for a missing FIGURE, and prose
     * may of course contain one as punctuation — so the probe is deliberately narrow, and
     * each case supplies every figure so any remaining lone dash is the prose bug.
     */
    const LONE_DASH = />\s*—\s*<\//;

    // A missing foot note draws nothing rather than "—".
    const compose = renderToStaticMarkup(
      <ComposeSurface
        subject="S"
        body="B"
        foot={null}
        audiences={[{ id: "a", label: "A", count: "1" }]}
        channels={[{ id: "ch", label: "Ch" }]}
        onApproveAndSend={() => {}}
      />,
    );
    expect(compose).not.toMatch(LONE_DASH);

    // A missing forecast NOTE draws nothing; an absent FIGURE would still say "—".
    const head = renderToStaticMarkup(
      <PipelineHead weighted="W" weightedNote={null} rawTotal="R" rawNote={null} />,
    );
    expect(head).not.toMatch(LONE_DASH);

    // "via —" is a broken sentence, not a missing number.
    expect(renderToStaticMarkup(<StageBoard lanes={[lane]} />)).not.toContain("via —");
  });

  it("does not paint SLA urgency when no clock was reported", () => {
    const noClock = renderToStaticMarkup(<SupportThread clock={null} draft={null} />);
    const withClock = renderToStaticMarkup(<SupportThread clock="12m left" draft={null} />);
    expect(noClock).not.toContain("--warning");
    expect(withClock).toContain("--warning");
  });
});
