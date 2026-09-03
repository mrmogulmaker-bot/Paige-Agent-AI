import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSoloBusinessContext } from "./useSoloBusinessContext";

const state = vi.hoisted(() => ({
  tenantId: "tenant-a" as string | null,
  rpc: vi.fn(),
}));
vi.mock("@/hooks/useTenantContext", () => ({
  useTenantContext: () => ({ activeTenantId: state.tenantId }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: state.rpc },
}));
vi.mock("./useSoloPeople", () => ({
  useSoloPeople: () => ({ people: [], loading: false, error: null }),
}));
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let latest: ReturnType<typeof useSoloBusinessContext>;
function Probe() {
  latest = useSoloBusinessContext();
  return (
    <div data-loading={latest.loading}>
      {latest.error || latest.brief.publicName}
    </div>
  );
}

function currentDraft() {
  return {
    brief: latest.brief,
    businessOwners: latest.businessOwners,
    primaryBusinessEmail: latest.primaryBusinessEmail,
    knowledgeSources: latest.knowledgeSources,
    paigeProfile: latest.paigeProfile,
    voiceExamples: latest.voiceExamples,
    proposalId: null,
  };
}

const loaded = (tenantId = "tenant-a", accessScope = "owner_full") => ({
  data: {
    tenantId,
    brief: { publicName: tenantId },
    accessScope,
    contextRevision: 4,
    primaryBusinessEmail: "business@example.com",
  },
  error: null,
});

describe("Solo business context data boundary", () => {
  beforeEach(() => {
    state.tenantId = "tenant-a";
    state.rpc.mockReset();
  });

  it("shows a safe retryable load failure instead of spinning forever or leaking database detail", async () => {
    state.rpc.mockResolvedValue({
      data: null,
      error: {
        message: "relation private_secret_table not found",
        code: "42P01",
      },
    });
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(<Probe />));
    expect(latest.loading).toBe(false);
    expect(latest.error).toBe("Couldn't load this business context.");
    expect(host.textContent).not.toContain("private_secret_table");
    await act(async () => root.unmount());
  });

  it("refuses an unresolved session without an infinite loading state", async () => {
    state.tenantId = null;
    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Probe />));
    expect(latest.loading).toBe(false);
    expect(latest.canEdit).toBe(false);
    expect(latest.error).toContain("Choose a Solo workspace");
    expect(state.rpc).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  it("keeps unresolved snapshots stable so the edit-form reset effect cannot loop", async () => {
    state.tenantId = null;
    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Probe />));
    const before = latest;
    await act(async () => root.render(<Probe />));
    expect(latest.brief).toBe(before.brief);
    expect(latest.businessOwners).toBe(before.businessOwners);
    expect(latest.knowledgeSources).toBe(before.knowledgeSources);
    expect(latest.voiceExamples).toBe(before.voiceExamples);
    await act(async () => root.unmount());
  });

  it("drops a late response after switching tenants", async () => {
    let resolveA!: (value: unknown) => void;
    state.rpc
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveA = resolve;
          }),
      )
      .mockResolvedValue({
        data: {
          tenantId: "tenant-b",
          brief: { publicName: "Business B" },
          accessScope: "owner_full",
          contextRevision: 0,
        },
        error: null,
      });
    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Probe />));
    state.tenantId = "tenant-b";
    await act(async () => root.render(<Probe />));
    await act(async () =>
      resolveA({
        data: {
          tenantId: "tenant-a",
          brief: { publicName: "Business A" },
          accessScope: "owner_full",
        },
        error: null,
      }),
    );
    expect(latest.brief.publicName).toBe("Business B");
    await act(async () => root.unmount());
  });

  it("sends expected workspace/revision/email and rejects duplicate save synchronously", async () => {
    state.rpc.mockResolvedValueOnce(loaded());
    let finish!: (value: unknown) => void;
    state.rpc.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Probe />));
    let save!: ReturnType<typeof latest.save>;
    await act(async () => {
      save = latest.save(currentDraft());
      expect((await latest.save(currentDraft())).ok).toBe(false);
    });
    expect(latest.saving).toBe(true);
    expect(state.rpc).toHaveBeenLastCalledWith(
      "save_solo_business_context",
      expect.objectContaining({
        _expected_tenant_id: "tenant-a",
        _expected_context_revision: 4,
        _expected_primary_business_email: "business@example.com",
        _primary_business_email_decision: null,
      }),
    );
    await act(async () => {
      finish(loaded());
      await save;
    });
    expect(latest.saving).toBe(false);
    expect(state.rpc).toHaveBeenCalledTimes(2);
    await act(async () => root.unmount());
  });

  it("uses null unchanged supplemental fields for an Admin operational save", async () => {
    state.rpc.mockResolvedValue(loaded("tenant-a", "admin_operational"));
    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Probe />));
    await act(async () => {
      expect((await latest.save(currentDraft())).ok).toBe(true);
    });
    expect(state.rpc).toHaveBeenLastCalledWith(
      "save_solo_business_context",
      expect.objectContaining({
        _primary_business_email: null,
        _knowledge_sources: null,
        _paige_profile: null,
        _voice_examples: null,
      }),
    );
    await act(async () => root.unmount());
  });

  it("preserves draft failure for retry without exposing provider error text", async () => {
    state.rpc
      .mockResolvedValueOnce(loaded())
      .mockResolvedValueOnce({
        data: null,
        error: { message: "private SQL endpoint details", code: "XX000" },
      })
      .mockResolvedValueOnce(loaded());
    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Probe />));
    await act(async () => {
      const result = await latest.save(currentDraft());
      expect(result).toEqual({
        ok: false,
        kind: "failed",
        error: "Couldn't save this business context.",
      });
    });
    expect(latest.saving).toBe(false);
    await act(async () => {
      expect((await latest.save(currentDraft())).ok).toBe(true);
    });
    await act(async () => root.unmount());
  });

  it("does not accept a held save or stale callback after account switch", async () => {
    let finish!: (value: unknown) => void;
    state.rpc
      .mockResolvedValueOnce(loaded())
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValueOnce(loaded("tenant-b"));
    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Probe />));
    const oldSave = latest.save;
    const oldDraft = currentDraft();
    let held!: ReturnType<typeof latest.save>;
    await act(async () => {
      held = oldSave(oldDraft);
    });
    state.tenantId = "tenant-b";
    await act(async () => root.render(<Probe />));
    await act(async () => {
      finish(loaded());
      expect(await held).toMatchObject({ ok: false, kind: "stale" });
      expect((await oldSave(oldDraft)).ok).toBe(false);
    });
    expect(latest.brief.publicName).toBe("tenant-b");
    expect(state.rpc).toHaveBeenCalledTimes(3);
    await act(async () => root.unmount());
  });

  it("guards managed registration and proposal dismissal with expected workspace", async () => {
    state.rpc
      .mockResolvedValueOnce(loaded())
      .mockResolvedValueOnce({
        data: {
          address: "business@mail.example.com",
          localPart: "business",
          domain: "mail.example.com",
        },
        error: null,
      })
      .mockResolvedValueOnce({ error: null });
    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Probe />));
    await act(async () => {
      await latest.registerManagedEmail("business");
    });
    expect(state.rpc).toHaveBeenLastCalledWith(
      "register_solo_setup_managed_email",
      { _expected_tenant_id: "tenant-a", _local_part: "business" },
    );
    await act(async () => {
      await latest.dismissProposal("proposal-id");
    });
    expect(state.rpc).toHaveBeenLastCalledWith(
      "dismiss_solo_setup_context_proposal",
      { _expected_tenant_id: "tenant-a", _proposal_id: "proposal-id" },
    );
    await act(async () => root.unmount());
  });

  it("refuses Member mutations without making a write request", async () => {
    state.rpc.mockResolvedValue(loaded("tenant-a", "read_only"));
    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Probe />));
    await act(async () => {
      expect((await latest.save(currentDraft())).ok).toBe(false);
      await expect(latest.registerManagedEmail("business")).rejects.toThrow(
        "not available",
      );
      expect((await latest.dismissProposal("proposal-id")).ok).toBe(false);
    });
    expect(state.rpc).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });
});
