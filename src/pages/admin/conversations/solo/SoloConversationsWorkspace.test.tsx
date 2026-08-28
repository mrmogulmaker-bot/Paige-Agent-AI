import { renderToStaticMarkup } from "react-dom/server";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { SoloClientContextPane, SoloConversationOperatingBar, SoloConversationsWorkspace } from "./SoloConversationsWorkspace";
import { ThreadFilters } from "../ThreadFilters";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Solo Conversations workspace", () => {
  it("uses one bounded queue/thread/context area with a permanently mounted sibling context", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <SoloConversationsWorkspace
          threadList={<div>Queue</div>}
          activeThread={<div>Thread</div>}
          clientContext={<div>Client context</div>}
          hasSelection
          showFirstRun={false}
          firstRun={<div>First run</div>}
        />
      </MemoryRouter>,
    );
    expect(html).toContain("data-solo-conversations-workspace");
    expect(html).toContain('data-pane="queue"');
    expect(html).toContain('data-pane="thread"');
    expect(html).toContain('data-pane="client-context"');
    expect(html).toContain("Client context");
    expect(html).not.toMatch(/Your client book|Client conversations|role="dialog"|aria-label="Close/i);
  });

  it("preserves all three sibling panes in first-run instead of swapping out the workspace", () => {
    const html = renderToStaticMarkup(
      <SoloConversationsWorkspace
        threadList={<div>Empty queue</div>}
        activeThread={<div>Unused thread</div>}
        clientContext={<div>No client selected</div>}
        hasSelection={false}
        showFirstRun
        firstRun={<div>Guided first run</div>}
      />,
    );
    expect(html).toContain("Guided first run");
    expect(html).toContain("Empty queue");
    expect(html).toContain("No client selected");
    expect(html.match(/data-pane=/g)).toHaveLength(3);
  });

  it("keeps Needs attention Solo-only", () => {
    const props = { view: "active" as const, onView: () => undefined, activeUnread: 0, foldedPending: 2, catalog: [], labelFilter: null, onLabelFilter: () => undefined };
    const generic = renderToStaticMarkup(<ThreadFilters {...props} />);
    const solo = renderToStaticMarkup(<ThreadFilters {...props} soloAttention />);
    expect(generic).not.toContain("Needs attention");
    expect(solo).toContain("Needs attention");
  });

  it("enables PAIGE drafts only when the email composer has a usable identity and recipient", () => {
    const renderBar = (canDraftWithPaige: boolean) => renderToStaticMarkup(
      <MemoryRouter>
        <SoloConversationOperatingBar
          mode="human"
          onModeChange={() => undefined}
          channels={[]}
          activeChannel="email"
          canDraftWithPaige={canDraftWithPaige}
          connectionsHref="/connections"
        />
      </MemoryRouter>,
    );
    expect(renderBar(false)).toMatch(/disabled=""[^>]*title="PAIGE drafting needs a ready email identity and recipient"/);
    expect(renderBar(true)).not.toContain("PAIGE drafting needs a ready email identity and recipient");
  });

  it("keeps relationship truth read-only and routes edits to canonical owners", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <SoloClientContextPane
          contact={{
            id: "person-1", first_name: "Avery", last_name: "Stone", entity_name: "Northstar",
            email: "avery@example.test", phone: "+12025550142", status: "active", timezone: null,
            created_at: null, created_by: null, created_by_channel_type: null, lifecycle_stage: "lead",
            entity_type: "person", title: "Founder", source: "referral", tags: ["Priority"],
            last_contacted_at: "2026-08-27T12:00:00.000Z", assigned_coach_user_id: "owner-1",
            linked_user_id: null, dnd_active: false, dnd_reason: null, dnd_until: null,
          }}
          labels={[]}
          recentMessages={[]}
          links={{ people: "/people", portal: "/portal", campaigns: "/campaigns", connections: "/connections" }}
        />
      </MemoryRouter>,
    );
    expect(html).toContain("Avery Stone");
    expect(html).toContain("People owns this record");
    expect(html).toContain("Pipeline / deal");
    expect(html).toContain("Not reported");
    expect(html).toContain("Portal access");
    expect(html).toContain("Invitation");
    expect(html).toContain("Access / account link");
    expect(html).toContain("Open People record");
    expect(html).not.toMatch(/Save|Edit owner|Invite now|Assign pipeline/);
  });

  it("retains focus when the bounded context rail is collapsed", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(
      <SoloConversationsWorkspace
        threadList={<div>Queue</div>}
        activeThread={<div>Thread</div>}
        clientContext={<div>Context</div>}
        hasSelection
        showFirstRun={false}
        firstRun={null}
      />,
    ));
    const collapse = host.querySelector<HTMLButtonElement>(".solo-context-collapse");
    collapse?.focus();
    await act(async () => collapse?.click());
    expect(document.activeElement).toBe(collapse);
    expect(collapse?.getAttribute("aria-expanded")).toBe("false");
    act(() => root.unmount());
    host.remove();
  });
});
