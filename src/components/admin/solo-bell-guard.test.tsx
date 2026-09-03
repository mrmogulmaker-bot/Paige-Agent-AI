import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import RequireOperator from "@/operator/RequireOperator";

const access = vi.hoisted(() => ({
  uid: "workspace-member",
  listener: null as null | ((event: string, session: unknown) => void),
  answers: [] as Array<(answer: { data: unknown; error: unknown }) => void>,
  mounted: vi.fn(),
  unmounted: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: {
    getSession: async () => ({ data: { session: { user: { id: access.uid } } } }),
    onAuthStateChange: (callback: typeof access.listener) => {
      access.listener = callback;
      return { data: { subscription: { unsubscribe: () => { access.listener = null; } } } };
    },
  },
  rpc: () => new Promise(resolve => access.answers.push(resolve)),
} }));
// Even stale platform flags cannot grant access before the real guard's server check.
vi.mock("@/hooks/useTenantContext", () => ({ useTenantContext: () => ({
  loading: false, isPlatformStaff: true, isPlatformOwner: true,
}) }));
vi.mock("@/components/ui/page", () => ({
  PageSkeleton: () => <div>Checking access</div>,
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}));
vi.mock("@/components/ui/button", () => ({ Button: () => <button>Try again</button> }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function ProtectedSource() {
  useEffect(() => { access.mounted(); return () => { access.unmounted(); }; }, []);
  return <div>Authorized source</div>;
}

describe("legacy notification route uses real operator authorization", () => {
  it.each([false, true])("server verdict %s controls source mounting and subject-change cleanup", async (answer) => {
    access.answers = [];
    access.mounted.mockClear();
    access.unmounted.mockClear();
    access.uid = answer ? "platform-member" : "workspace-member";
    const host = document.createElement("div");
    const root = createRoot(host);
    try {
      await act(async () => root.render(
        <MemoryRouter initialEntries={["/admin/notifications"]}>
          <Routes>
            <Route path="/admin" element={<div>Workspace entry</div>} />
            <Route path="/admin/notifications" element={<RequireOperator><ProtectedSource /></RequireOperator>} />
          </Routes>
        </MemoryRouter>,
      ));
      expect(access.mounted).not.toHaveBeenCalled();
      await act(async () => access.answers.shift()!({ data: answer, error: null }));
      if (answer) {
        expect(access.mounted).toHaveBeenCalledTimes(1);
        await act(async () => access.listener!("SIGNED_IN", { user: { id: "different-workspace-member" } }));
        expect(access.unmounted).toHaveBeenCalledTimes(1);
        expect(host.textContent).not.toContain("Authorized source");
        await act(async () => access.answers.shift()!({ data: false, error: null }));
      } else {
        expect(access.mounted).not.toHaveBeenCalled();
      }
      expect(host.textContent).toBe("Workspace entry");
    } finally {
      act(() => root.unmount());
    }
  });
});
