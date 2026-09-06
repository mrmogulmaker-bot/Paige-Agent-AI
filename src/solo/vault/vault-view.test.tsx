// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
  },
}));

afterEach(() => {
  vi.doUnmock("./useBusinessVault");
  vi.doUnmock("@/hooks/useTenantContext");
  vi.resetModules();
});

describe("Business Vault access presentation", () => {
  it("renders a metadata-free denial", async () => {
    vi.doMock("@/hooks/useTenantContext", () => ({
      useTenantContext: () => ({ activeTenantId: "tenant-a" }),
    }));
    vi.doMock("./useBusinessVault", () => ({
      useBusinessVault: () => ({
        state: "denied",
        snapshot: null,
        error: null,
      }),
    }));
    const { VaultView } = await import("../vault");
    const html = renderToStaticMarkup(<VaultView />);
    expect(html).toContain("Business Vault access unavailable");
    expect(html).toContain("No Vault metadata was returned");
    expect(html).not.toContain("Upcoming obligations");
    expect(html).not.toContain("Evidence desk");
  });

  it("renders an honest empty continuity state for an authorized admin", async () => {
    vi.doMock("@/hooks/useTenantContext", () => ({
      useTenantContext: () => ({ activeTenantId: "tenant-a" }),
    }));
    vi.doMock("./useBusinessVault", () => ({
      useBusinessVault: () => ({
        state: "allowed",
        snapshot: {
          records: [],
          obligations: [],
          contracts: [],
          facts: [],
          contractsNeedingAttention: 0,
          awaitingReview: 0,
          recentlyReviewed: 0,
        },
        error: null,
        canArchive: false,
        reload: vi.fn(),
        upload: vi.fn(),
        saveContract: vi.fn(),
        saveObligation: vi.fn(),
        archiveRecord: vi.fn(),
        proposeFact: vi.fn(),
        reviewFact: vi.fn(),
      }),
    }));
    const { VaultView } = await import("../vault");
    const html = renderToStaticMarkup(<VaultView />);
    expect(html).toContain("Your business core needs its first source");
    expect(html).toContain("No readiness claim is available yet");
    expect(html).toContain("Provider references unavailable");
    expect(html).not.toContain("Your business core is grounded");
  });
});
