/**
 * Dev-only stub of `useSoloGamePlan` for the Business Game Plan render harness.
 *
 * MOCK THE PROVIDER, NEVER THE CONTRACT. The REAL `SoloGamePlanWorkspace`, its REAL CSS and the
 * REAL Solo shell chain render against these deterministic view-models — only the composed reads
 * are stubbed. The mode is read from `?mode=` on load, so each frame is a fixed, reproducible
 * state. This proves GEOMETRY, STATE RENDERING and both palettes; it does NOT prove the
 * authenticated production surface — §32.c stays owed to a session that can drive the deployed app.
 */

const vi = () => {}; // no-op refresh for the harness

function grounded() {
  return {
    loading: false, error: false, empty: false,
    greeting: { name: "Jordan", dateLabel: "Thursday, September 3", salutation: "Good afternoon" },
    narrative: "Foundations are set and work is moving. Here's what needs you and the best move to make now.",
    attention: [
      { label: "3 drafts waiting", tone: "live" },
      { label: "2 clients at risk", tone: "partial" },
      { label: "5 follow-ups due", tone: "live" },
    ],
    bestMove: {
      id: "attn:atrisk", title: "Re-engage 2 clients before they lapse",
      why: "Both crossed your usual quiet threshold. PAIGE can draft a note in your voice for each.",
      owner: "paige", proof: "live", evidence: "2 clients flagged at risk in your book.",
      outcome: "PAIGE drafts the outreach; you approve and she sends.", destination: "clients", ctaLabel: "See the clients",
    },
    priorities: [
      { id: "gap:offers", title: "Publish your Q4 offer page", why: "Publishing turns the draft into a real link you can send and track.", owner: "you", proof: "partial", evidence: "A draft page is ready.", outcome: "The page goes live and the intake wires to your pipeline.", destination: "catalog", ctaLabel: "Open Catalog" },
      { id: "attn:followups", title: "5 follow-ups due", why: "Contacts are due a touch. PAIGE can prepare each for your approval.", owner: "paige", proof: "live", evidence: "5 follow-ups due in your book.", outcome: "PAIGE drafts them; you approve and she sends.", destination: "clients", ctaLabel: "See what's due" },
      { id: "gap:knowledge", title: "Add a knowledge source", why: "More of your material lets PAIGE answer with depth.", owner: "you", proof: "partial", evidence: "PAIGE has little of your material.", outcome: "PAIGE reindexes and can answer with your content.", destination: "knowledge", ctaLabel: "Open Knowledge" },
    ],
    foundation: [
      { key: "identity", label: "Business identity", status: "grounded", note: "Clearpath Advisory", destination: "setup" },
      { key: "website", label: "Website", status: "grounded", note: "clearpath.example", destination: "setup" },
      { key: "offers", label: "Offers", status: "grounded", note: "3 active offers", destination: "catalog" },
      { key: "sender", label: "Sending identity", status: "grounded", note: "Email sending is set up", destination: "connections" },
      { key: "knowledge", label: "Knowledge", status: "incomplete", note: "2 sources — add more for depth", destination: "knowledge" },
    ],
    coverage: { grounded: 4, partial: 1, total: 5, caption: "4 grounded, 1 to finish. PAIGE has enough to plan and act with you." },
    motion: { status: "ready", items: [], freshness: "No recorded work yet" },
    firstRun: [],
    refresh: vi,
  };
}

function withPatch(patch: any) {
  return { ...grounded(), ...patch };
}

export function viewFor(mode: string) {
  switch (mode) {
    case "loading":
      return withPatch({ loading: true });
    case "error":
      return withPatch({ error: true });
    case "empty":
      return withPatch({
        empty: true,
        firstRun: [
          { label: "Complete your Business Context", hint: "Who you serve and what you sell", destination: "setup" },
          { label: "Add your first offer", hint: "So PAIGE knows what work to move", destination: "catalog" },
          { label: "Connect one operating system", hint: "Calendar or email, to act for real", destination: "connections" },
        ],
      });
    case "partial":
      return withPatch({
        narrative: "PAIGE has grounded 2 of 5 foundations. 3 are left — the next move builds from what you set.",
        attention: [{ label: "2 drafts waiting", tone: "live" }],
        bestMove: { id: "gap:offers", title: "Add your first offer in Catalog", why: "Everything commercial waits on one real offer.", owner: "you", proof: "input", evidence: "You have no offer yet.", outcome: "PAIGE builds pricing and follow-ups around it.", destination: "catalog", ctaLabel: "Open Catalog" },
        foundation: [
          { key: "identity", label: "Business identity", status: "grounded", note: "Clearpath Advisory", destination: "setup" },
          { key: "website", label: "Website", status: "grounded", note: "clearpath.example", destination: "setup" },
          { key: "offers", label: "Offers", status: "needs-input", note: "No offer yet — blocks revenue moves", destination: "catalog" },
          { key: "sender", label: "Sending identity", status: "incomplete", note: "Confirm your sender", destination: "connections" },
          { key: "knowledge", label: "Knowledge", status: "needs-input", note: "Add a source", destination: "knowledge" },
        ],
        coverage: { grounded: 2, partial: 1, total: 5, caption: "2 grounded, 1 to finish, 2 needed. PAIGE plans from what you've set." },
      });
    case "blocked":
      return withPatch({
        narrative: "Your plan is ready, but the top move is blocked. Clear the blocker and PAIGE can act.",
        attention: [{ label: "1 move blocked", tone: "blocked" }, { label: "3 drafts waiting", tone: "live" }],
        bestMove: {
          id: "check:sender", title: "Launch the re-engagement sequence",
          why: "8 quiet clients, drafts ready in your voice. This is the move — but email can't leave the building yet.",
          owner: "paige", proof: "blocked",
          blockedReason: "Your sending identity isn't verified, so no email can be sent. Verify it in Connections and this move unblocks — the drafts are kept.",
          evidence: "From this workspace's latest system check.", outcome: "The drafts are kept; the move runs once sending is verified.",
          destination: "connections", ctaLabel: "Verify sending identity",
        },
      });
    case "owner":
      return withPatch({
        narrative: "PAIGE has done what she can without you. One decision only you can make is holding three moves.",
        attention: [{ label: "1 decision needs you", tone: "input" }, { label: "3 moves waiting", tone: "partial" }],
        bestMove: {
          id: "gap:offers", title: "Confirm your core offer price",
          why: "PAIGE found two prices for your flagship program. She can't pick for you, and pricing pages, proposals and the funnel all wait on the answer.",
          owner: "you", proof: "input", evidence: "Two different prices are on record.", outcome: "The plan and pages update to the price you set.",
          destination: "catalog", ctaLabel: "Set the price in Catalog",
        },
      });
    case "motion":
      return withPatch({
        motion: {
          status: "ready",
          items: [
            { id: "e1", title: "Sent a follow-up to a client", summary: "Re-engagement note", byPaige: true, actorAgent: null, department: "Client Success", when: "4m ago" },
            { id: "e2", title: "Published an offer page", summary: null, byPaige: true, actorAgent: null, department: "Marketing", when: "1h ago" },
            { id: "e3", title: "Added a contact", summary: null, byPaige: false, actorAgent: null, department: "Client Success", when: "3h ago" },
          ],
          freshness: "Latest 4m ago",
        },
      });
    default:
      return grounded();
  }
}

export function useSoloGamePlan(_account: string, _workspaceId?: string | null) {
  const mode = new URLSearchParams(window.location.search).get("mode") || "grounded";
  return viewFor(mode);
}
