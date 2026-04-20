import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getUnlockedPrograms, type DemographicProfile } from "@/lib/unlockedPrograms";

interface Props {
  clientUserId: string;
}

interface RawDemo {
  gender_identity: string | null;
  ethnicity: string[] | null;
  is_veteran: boolean | null;
  is_service_disabled_veteran: boolean | null;
  is_us_citizen: boolean | null;
  is_minority_owned: boolean | null;
  is_women_owned: boolean | null;
  is_veteran_owned: boolean | null;
  is_service_disabled_veteran_owned: boolean | null;
  is_hubzone_located: boolean | null;
  has_8a_certification: boolean | null;
  has_wosb_certification: boolean | null;
  has_vetcert_certification: boolean | null;
}

const GENDER_LABELS: Record<string, string> = {
  male: "Man",
  female: "Woman",
  non_binary: "Non-binary",
  prefer_not_to_say: "Prefer not to say",
};

function fmtBool(v: boolean | null): string {
  if (v === true) return "Yes";
  if (v === false) return "No";
  return "—";
}

function fmtList(arr: string[] | null): string {
  if (!arr || arr.length === 0) return "—";
  return arr.map((e) => e.replace(/_/g, " ")).join(", ");
}

export function ClientDemographicsCard({ clientUserId }: Props) {
  const [data, setData] = useState<RawDemo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: prof }, { data: biz }] = await Promise.all([
        supabase
          .from("profiles")
          .select("gender_identity, ethnicity, is_veteran, is_service_disabled_veteran, is_us_citizen")
          .eq("user_id", clientUserId)
          .maybeSingle(),
        supabase
          .from("businesses")
          .select(
            "is_minority_owned, is_women_owned, is_veteran_owned, is_service_disabled_veteran_owned, is_hubzone_located, has_8a_certification, has_wosb_certification, has_vetcert_certification",
          )
          .eq("owner_user_id", clientUserId)
          .limit(1)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      setData({
        gender_identity: (prof as any)?.gender_identity ?? null,
        ethnicity: (prof as any)?.ethnicity ?? null,
        is_veteran: (prof as any)?.is_veteran ?? null,
        is_service_disabled_veteran: (prof as any)?.is_service_disabled_veteran ?? null,
        is_us_citizen: (prof as any)?.is_us_citizen ?? null,
        is_minority_owned: (biz as any)?.is_minority_owned ?? null,
        is_women_owned: (biz as any)?.is_women_owned ?? null,
        is_veteran_owned: (biz as any)?.is_veteran_owned ?? null,
        is_service_disabled_veteran_owned: (biz as any)?.is_service_disabled_veteran_owned ?? null,
        is_hubzone_located: (biz as any)?.is_hubzone_located ?? null,
        has_8a_certification: (biz as any)?.has_8a_certification ?? null,
        has_wosb_certification: (biz as any)?.has_wosb_certification ?? null,
        has_vetcert_certification: (biz as any)?.has_vetcert_certification ?? null,
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [clientUserId]);

  const merged: DemographicProfile = {
    gender_identity: data?.gender_identity ?? null,
    ethnicity: data?.ethnicity ?? null,
    is_veteran: data?.is_veteran ?? null,
    is_service_disabled_veteran: data?.is_service_disabled_veteran ?? null,
    is_us_citizen: data?.is_us_citizen ?? null,
    is_minority_owned: data?.is_minority_owned ?? null,
    is_women_owned: data?.is_women_owned ?? null,
    is_veteran_owned: data?.is_veteran_owned ?? null,
    is_service_disabled_veteran_owned: data?.is_service_disabled_veteran_owned ?? null,
    is_hubzone_located: data?.is_hubzone_located ?? null,
    has_8a_certification: data?.has_8a_certification ?? null,
    has_wosb_certification: data?.has_wosb_certification ?? null,
    has_vetcert_certification: data?.has_vetcert_certification ?? null,
  };

  const programs = getUnlockedPrograms(merged);

  const certs: string[] = [];
  if (data?.has_8a_certification) certs.push("8(a)");
  if (data?.has_wosb_certification) certs.push("WOSB");
  if (data?.has_vetcert_certification) certs.push("VetCert");
  if (data?.is_hubzone_located) certs.push("HUBZone-located");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-accent" /> Demographics & Funding Profile
        </CardTitle>
        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
          <Lock className="w-3 h-3" />
          Read-only — only the client can update their own demographic answers from the Funding Profile tab.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <div>
              <span className="text-muted-foreground">Gender Identity:</span>{" "}
              <span className="font-medium text-foreground">
                {data?.gender_identity ? GENDER_LABELS[data.gender_identity] || data.gender_identity : "—"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Ethnicity:</span>{" "}
              <span className="font-medium text-foreground">{fmtList(data?.ethnicity || null)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Veteran:</span>{" "}
              <span className="font-medium text-foreground">
                {data?.is_service_disabled_veteran === true
                  ? "Yes — service-disabled"
                  : fmtBool(data?.is_veteran ?? null)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">U.S. Citizen:</span>{" "}
              <span className="font-medium text-foreground">{fmtBool(data?.is_us_citizen ?? null)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Minority-Owned:</span>{" "}
              <span className="font-medium text-foreground">{fmtBool(data?.is_minority_owned ?? null)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Women-Owned:</span>{" "}
              <span className="font-medium text-foreground">{fmtBool(data?.is_women_owned ?? null)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Veteran-Owned:</span>{" "}
              <span className="font-medium text-foreground">{fmtBool(data?.is_veteran_owned ?? null)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">HUBZone-Located:</span>{" "}
              <span className="font-medium text-foreground">{fmtBool(data?.is_hubzone_located ?? null)}</span>
            </div>
            <div className="md:col-span-2">
              <span className="text-muted-foreground">Active Certifications:</span>{" "}
              {certs.length > 0 ? (
                <span className="inline-flex flex-wrap gap-1 ml-1">
                  {certs.map((c) => (
                    <Badge key={c} variant="outline" className="text-xs">
                      {c}
                    </Badge>
                  ))}
                </span>
              ) : (
                <span className="font-medium text-foreground">None</span>
              )}
            </div>
            <div className="md:col-span-2 mt-2 pt-3 border-t border-border">
              <p className="text-xs font-semibold text-accent uppercase tracking-wider mb-2">
                Programs This Client May Qualify For
              </p>
              {programs.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No targeted programs identified yet.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {programs.map((p) => (
                    <Badge key={p.key} className="bg-gradient-gold text-white text-[11px] border-0">
                      {p.name}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
