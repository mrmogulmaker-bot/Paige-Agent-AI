import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * The fleet read for the operator console — REAL tenants, no fixtures.
 *
 * Same tables the shipped operator tenant list already reads, so this is one more caller of a
 * proven query rather than a new data path (§18). The owner's standing rule is that a figure the
 * platform cannot substantiate must render as "—", never as a plausible number: the §57 anchor
 * case was a Fleet surface showing $397/$149 MRR on tenants that have no paid subscription at
 * all. So `mrr` here is DELIBERATELY absent — `revenue_class` is what the platform actually
 * knows, and the surface prints that instead of inventing a dollar figure (§13).
 */
export type FleetTenant = {
  id: string;
  slug: string | null;
  name: string;
  status: string | null;
  /** agency | enterprise | sub_account | standalone — the §51 tier, read from the record. */
  accountType: string | null;
  /** Non-null on a sub-account: the agency it belongs to (§51 invariant). */
  parentTenantId: string | null;
  planOffer: string | null;
  /** paid | promotional | internal_test — operator-internal axis, owner-only via RLS. */
  revenueClass: string | null;
  seats: number;
  customers: number;
  trialEndsAt: string | null;
};

/**
 * A tenant the platform runs for ITSELF — a fixture, a test account, a retired shell — rather
 * than a customer. It is a real row and the operator can still ask to see it, but counting it
 * as fleet would overstate the platform's own size on the operator's own console, which is the
 * §57 divergence (a surface asserting something the God-level record contradicts) in miniature.
 */
export function isInternal(t: FleetTenant): boolean {
  return t.revenueClass === "internal_test";
}

export type FleetData = {
  tenants: FleetTenant[];
  /**
   * Whether the operator-internal classification is READABLE by this session at all.
   *
   * `tenant_revenue_classification` is owner-only by RLS, so a scoped `platform_admin` reads
   * ZERO rows — and zero rows is indistinguishable from "no tenant is internal". Without this
   * flag the console would quietly show every fixture as fleet, with no chip to reveal them and
   * no hint that anything was missing: a wrong count that looks right (§13/§57). The surface
   * uses it to say what it cannot see instead of filtering on an answer it never got.
   */
  classificationVisible: boolean;
  loading: boolean;
  /** True when the read failed — the surface says so rather than rendering an empty fleet. */
  error: string | null;
};

export function useFleet(enabled: boolean): FleetData {
  const [tenants, setTenants] = useState<FleetTenant[]>([]);
  const [classificationVisible, setClassificationVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [{ data: rows, error: tErr }, { data: members }, { data: clients }, { data: revenue }] =
          await Promise.all([
            supabase
              .from("tenants")
              .select("id, slug, name, status, account_type, parent_tenant_id, plan_offer, trial_ends_at")
              .order("created_at", { ascending: true }),
            supabase.from("tenant_members").select("tenant_id").eq("status", "active"),
            supabase.from("clients").select("tenant_id"),
            // Operator-internal revenue axis. RLS is owner-only, so a scoped platform_admin
            // reads 0 rows and every tenant simply shows no class — a narrower view, never a
            // leak and never a wrong number (§9).
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            supabase.from("tenant_revenue_classification" as any).select("tenant_id, revenue_class"),
          ]);

        if (!alive) return;
        if (tErr) {
          setError(tErr.message);
          setTenants([]);
          setLoading(false);
          return;
        }

        const seatBy = new Map<string, number>();
        (members ?? []).forEach((m) =>
          seatBy.set(m.tenant_id, (seatBy.get(m.tenant_id) ?? 0) + 1),
        );
        const custBy = new Map<string, number>();
        (clients ?? []).forEach((c) => {
          if (!c.tenant_id) return;
          custBy.set(c.tenant_id, (custBy.get(c.tenant_id) ?? 0) + 1);
        });
        // Any row at all proves the read is permitted for this session. None proves nothing
        // either way, so we report it as not-visible rather than as an empty classification.
        setClassificationVisible((revenue ?? []).length > 0);
        const classBy = new Map<string, string>(
          ((revenue ?? []) as unknown as Array<{ tenant_id: string; revenue_class: string }>).map(
            (r) => [r.tenant_id, r.revenue_class],
          ),
        );

        setTenants(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ((rows ?? []) as any[]).map((t) => ({
            id: t.id,
            slug: t.slug ?? null,
            name: t.name,
            status: t.status ?? null,
            accountType: t.account_type ?? null,
            parentTenantId: t.parent_tenant_id ?? null,
            planOffer: t.plan_offer ?? null,
            revenueClass: classBy.get(t.id) ?? null,
            seats: seatBy.get(t.id) ?? 0,
            customers: custBy.get(t.id) ?? 0,
            trialEndsAt: t.trial_ends_at ?? null,
          })),
        );
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Could not load the fleet.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [enabled]);

  return { tenants, classificationVisible, loading, error };
}
