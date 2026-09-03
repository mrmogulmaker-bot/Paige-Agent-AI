import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Solo platform notification containment", () => {
  it("keeps the canonical tenant shell disconnected from platform notifications in every workspace", () => {
    const shell = source("src/components/tenant-shell/TenantCommandCenterShell.tsx");
    expect(shell).not.toMatch(/AdminBridgeBell|paige_admin_notifications|\/admin\/notifications/);
    expect(source("src/solo/SoloApp.tsx")).not.toMatch(/AdminBridgeBell|paige_admin_notifications|\/admin\/notifications/);
  });

  it("checks platform authority before mounting the legacy notification page", () => {
    const admin = source("src/pages/Admin.tsx");
    expect(admin).toContain('import RequireOperator from "@/operator/RequireOperator"');
    const route = admin.split('<Route path="notifications" element={')[1]?.split("} />")[0];
    expect(route).toContain('<RequireOperator><Suspense fallback={<SuspenseFallback />}><AdminNotifications /></Suspense></RequireOperator>');
  });

  it("preserves the bell only behind the server-verifying operator guard", () => {
    const layout = source("src/components/admin/AdminLayout.tsx");
    expect(layout).toContain('import RequireOperator from "@/operator/RequireOperator"');
    expect(layout).toMatch(/<RequireOperator>\s*<AdminBridgeBell\s*\/>\s*<\/RequireOperator>/);
    expect(layout.indexOf("if (!godMode)")).toBeLessThan(layout.indexOf("<AdminBridgeBell"));
  });
});
