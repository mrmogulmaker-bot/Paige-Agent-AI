/**
 * Dev-only mount for the two flows repaired in the PAIGE Spine #728 hotfix, so a REAL browser can
 * drive them.
 *
 * WHY THIS EXISTS RATHER THAN A LOGIN. Both surfaces are auth-gated, this session holds no
 * credentials, and §63 puts the owner's real accounts off-limits as a fixture target. It is also
 * not the deployed bundle: the branch under test is not deployed, so driving production would
 * exercise the OLD code and prove nothing about the repair. The alternative to this entry is no
 * rendered evidence at all.
 *
 * WHAT IS REAL HERE, which is the whole point of rendering rather than unit-testing twice over:
 *   • `useRailEvents` is the shipped hook, imported from `src/`.
 *   • `ExtractionProposalCard` is the shipped component.
 *   • The Supabase client is the shipped one, issuing a genuine PostgREST request over the
 *     browser's own fetch. The DRIVER controls the responses at the network layer — it does not
 *     stub the client — so the ordering the defect depended on (a prior scope answering after the
 *     new one) is produced by real in-flight requests, not by a fake promise.
 *   • The skip callback mirrors `applyExtraction`'s contract exactly: it awaits a real `fetch` and
 *     THROWS on a non-OK response, which is what the card has to survive.
 *
 * WHAT IT DOES NOT PROVE (§13/§32). A local render is not a deployed one, and no real session,
 * RLS policy, tenant record or edge function is exercised. It does not discharge the authenticated
 * production drive, which remains owed once this is deployed.
 *
 * It is never imported by `src/`, has its own vite root, and cannot reach a production bundle (§9).
 */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { useRailEvents } from "@/hooks/useRailEvents";
import { ExtractionProposalCard } from "@/components/chat/ExtractionProposalCard";
import "@/index.css";

const TENANT_A = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";

/** Flow 1 — the rail feed, with a scope the driver can switch mid-flight. */
function RailProbe() {
  const [tenantId, setTenantId] = useState(TENANT_A);
  const { events, historyLoaded, historyError } = useRailEvents({ scope: "tenant", tenantId });

  return (
    <section data-testid="rail" style={{ padding: 16, borderBottom: "1px solid #ccc" }}>
      <h2>Rail feed</h2>
      <p>
        scope: <b data-testid="rail-scope">{tenantId === TENANT_A ? "tenant-A" : "tenant-B"}</b>
        {" · loaded: "}<span data-testid="rail-loaded">{String(historyLoaded)}</span>
        {" · error: "}<span data-testid="rail-error">{historyError ?? "none"}</span>
      </p>
      <button type="button" data-testid="to-a" onClick={() => setTenantId(TENANT_A)}>switch to A</button>
      <button type="button" data-testid="to-b" onClick={() => setTenantId(TENANT_B)}>switch to B</button>
      <ul data-testid="rail-events">
        {events.map((e) => <li key={e.id} data-testid="rail-event">{e.title}</li>)}
      </ul>
    </section>
  );
}

/** Flow 2 — the extraction card, whose Skip calls a real endpoint the driver controls. */
function SkipProbe() {
  const [attempts, setAttempts] = useState(0);

  // The same contract `applyExtraction` presents to the card: await the request, and throw the
  // server's own sentence when it refuses. The card must not settle on that.
  const apply = async () => {
    setAttempts((n) => n + 1);
    const res = await fetch("/functions/v1/paige-apply-extraction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ upload_id: "11111111-1111-4111-8111-111111111111", approved_keys: [] }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(String(body?.error ?? "apply failed"));
  };

  return (
    <section data-testid="skip" style={{ padding: 16, maxWidth: 480 }}>
      <h2>Extraction proposal</h2>
      <p>server attempts: <b data-testid="skip-attempts">{attempts}</b></p>
      <ExtractionProposalCard
        proposal={{
          id: "11111111-1111-4111-8111-111111111111",
          source: "document",
          documentType: "Credit report",
          intro: "I read this report. Nothing has been saved to the profile yet.",
          fields: [
            { key: "credit_score_equifax", label: "Equifax score", value: 712, displayValue: "712" },
            { key: "negative_items", label: "Negative items to record", value: 3, displayValue: "3 items" },
          ],
        }}
        onConfirm={apply}
        onSkip={apply}
      />
    </section>
  );
}

createRoot(document.getElementById("root")!).render(
  <>
    <RailProbe />
    <SkipProbe />
  </>,
);
