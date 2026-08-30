import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { A2PTab } from "./A2PTab";

/**
 * The prepared registration a tenant comes BACK to.
 *
 * #665 made the prepared draft durable, and an independent review then found the
 * flow still broken at three points on the return trip. These cover the two that
 * are visible on this surface; the third (which fields actually reach the row) is
 * proven in scripts/proofs/a2p-draft-durability-cases.sql, because it is a
 * database contract rather than a rendering one.
 *
 * Both assertions below FAIL against the shipped e7521605 build. That is the point:
 * a test that passes before the fix is measuring something other than the defect.
 */

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A row in exactly the shape a successful draft save leaves behind: prepared, never filed. */
const PREPARED_ROW = {
  brand_status: "pending",
  campaign_status: "pending",
  status: "pending",
  brand_sid: null,
  campaign_sid: null,
  use_case: "customer care",
  campaign_description: "Appointment reminders and replies for booked clients.",
  sample_messages: [
    "Reminder: your session is tomorrow at 2pm. Reply STOP to opt out.",
    "Thanks for booking. Reply STOP to opt out.",
  ],
  optin_flow: "Clients tick an SMS consent box on the booking form.",
  optin_message: "You are subscribed to appointment reminders. Reply STOP to opt out.",
  optout_message: "You are unsubscribed and will get no further texts.",
  help_message: "Reply with your question or call the number on your invoice.",
  submitted_at: null,
};

const selectState = vi.hoisted(() => ({ row: null as unknown }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ limit: () => ({ maybeSingle: async () => ({ data: selectState.row, error: null }) }) }),
    }),
    functions: { invoke: vi.fn(async () => ({ data: {}, error: null })) },
  },
}));
vi.mock("@/hooks/useUserRoles", () => ({ useUserRoles: () => ({ isAdmin: true, roles: ["admin"], loading: false }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

async function mountTab() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<MemoryRouter><A2PTab /></MemoryRouter>);
  });
  return { host, cleanup: async () => { await act(async () => root.unmount()); host.remove(); } };
}

describe("A2P — coming back to a prepared registration", () => {
  beforeEach(() => { selectState.row = PREPARED_ROW; });

  it("re-opens the saved copy for editing instead of stranding it", async () => {
    // The banner tells the owner they "can keep editing it". The editor is mounted
    // only from in-memory `draft` state, and loadReg calls setReg alone — so after a
    // refresh the saved copy never returns and the one way forward is another PAID
    // model generation that overwrites it. A promise the surface cannot keep is the
    // same class of defect as a fabricated status.
    const { host, cleanup } = await mountTab();
    const values = Array.from(host.querySelectorAll("textarea, input")).map(
      (el) => (el as HTMLInputElement | HTMLTextAreaElement).value,
    );
    const joined = values.join("\n");

    expect(joined).toContain("customer care");
    expect(joined).toContain("Appointment reminders and replies for booked clients.");
    expect(joined).toContain("Clients tick an SMS consent box on the booking form.");
    // The three compliance replies are the ones the draft path was dropping entirely.
    expect(joined).toContain("You are subscribed to appointment reminders.");
    expect(joined).toContain("You are unsubscribed and will get no further texts.");
    expect(joined).toContain("Reply with your question or call the number on your invoice.");
    await cleanup();
  });

  it("never says 'Being set up' about a registration it also says was never sent", async () => {
    // The banner and the two status cards describe the SAME row. One says nothing has
    // been sent and nothing is queued; the other said work was underway. Both cannot
    // be true, and "being set up" is the one that implies an external party is acting.
    const { host, cleanup } = await mountTab();
    const text = host.textContent ?? "";

    expect(text).toContain("nothing has been sent and nothing is queued");
    expect(text).not.toContain("Being set up");
    await cleanup();
  });
});
