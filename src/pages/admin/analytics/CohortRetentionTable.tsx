import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface CohortRow {
  cohortStart: string;
  size: number;
  d1: number | null;
  d7: number | null;
  d30: number | null;
}

function startOfWeekUTC(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = x.getUTCDay(); // 0=Sun
  x.setUTCDate(x.getUTCDate() - dow);
  return x;
}

function pctClass(v: number | null): string {
  if (v == null) return "text-muted-foreground";
  if (v >= 0.4) return "text-fundability-excellent font-semibold";
  if (v >= 0.2) return "text-fundability-fair font-semibold";
  return "text-destructive font-semibold";
}

const fmtPct = (v: number | null) =>
  v == null ? "—" : `${(v * 100).toFixed(0)}%`;

export function CohortRetentionTable() {
  const [rows, setRows] = useState<CohortRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasEnoughData, setHasEnoughData] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sinceWeeks = 8;
        const earliest = startOfWeekUTC(new Date());
        earliest.setUTCDate(earliest.getUTCDate() - sinceWeeks * 7);

        // Pull profiles created in window
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, created_at")
          .gte("created_at", earliest.toISOString())
          .limit(5000);

        // Pull page_view events for those users
        const { data: pageViews } = await supabase
          .from("analytics_events")
          .select("user_id, created_at")
          .eq("event_name", "page_view")
          .gte("created_at", earliest.toISOString())
          .not("user_id", "is", null)
          .limit(50000);

        const visitsByUser = new Map<string, Date[]>();
        for (const ev of pageViews || []) {
          if (!ev.user_id) continue;
          if (!visitsByUser.has(ev.user_id)) visitsByUser.set(ev.user_id, []);
          visitsByUser.get(ev.user_id)!.push(new Date(ev.created_at));
        }

        // Bucket signups by cohort week
        const cohorts = new Map<string, { signupAt: Date; userId: string }[]>();
        for (const p of profiles || []) {
          if (!p.user_id || !p.created_at) continue;
          const signup = new Date(p.created_at);
          const cohortKey = startOfWeekUTC(signup).toISOString().slice(0, 10);
          if (!cohorts.has(cohortKey)) cohorts.set(cohortKey, []);
          cohorts.get(cohortKey)!.push({ signupAt: signup, userId: p.user_id });
        }

        const result: CohortRow[] = [];
        const sortedKeys = Array.from(cohorts.keys()).sort().reverse().slice(0, sinceWeeks);

        for (const key of sortedKeys) {
          const members = cohorts.get(key)!;
          const size = members.length;
          if (size === 0) continue;

          const now = Date.now();
          let d1Hits = 0;
          let d7Hits = 0;
          let d30Hits = 0;
          let d1Eligible = 0;
          let d7Eligible = 0;
          let d30Eligible = 0;

          for (const m of members) {
            const visits = (visitsByUser.get(m.userId) || []).filter(
              (v) => v.getTime() > m.signupAt.getTime(),
            );
            const oldestNeeded = (offset: number) => m.signupAt.getTime() + offset * 86400000;

            if (now >= oldestNeeded(1)) {
              d1Eligible++;
              if (visits.some((v) => v.getTime() >= oldestNeeded(1) && v.getTime() < oldestNeeded(2)))
                d1Hits++;
            }
            if (now >= oldestNeeded(7)) {
              d7Eligible++;
              if (visits.some((v) => v.getTime() >= oldestNeeded(6) && v.getTime() < oldestNeeded(8)))
                d7Hits++;
            }
            if (now >= oldestNeeded(30)) {
              d30Eligible++;
              if (visits.some((v) => v.getTime() >= oldestNeeded(28) && v.getTime() < oldestNeeded(32)))
                d30Hits++;
            }
          }

          result.push({
            cohortStart: key,
            size,
            d1: d1Eligible > 0 ? d1Hits / d1Eligible : null,
            d7: d7Eligible > 0 ? d7Hits / d7Eligible : null,
            d30: d30Eligible > 0 ? d30Hits / d30Eligible : null,
          });
        }

        if (cancelled) return;
        setRows(result);
        setHasEnoughData(
          result.length > 0 && result.some((r) => r.d30 != null || r.d7 != null),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cohort Retention (last 8 weekly signup cohorts)</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading cohorts…</p>
        ) : !hasEnoughData ? (
          <p className="text-sm text-muted-foreground">
            Retention data populates after 30 days of user activity.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="text-left py-2">Cohort week</th>
                  <th className="text-right py-2">Signups</th>
                  <th className="text-right py-2">Day 1</th>
                  <th className="text-right py-2">Day 7</th>
                  <th className="text-right py-2">Day 30</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.cohortStart} className="border-t border-border">
                    <td className="py-2">{r.cohortStart}</td>
                    <td className="py-2 text-right font-mono">{r.size}</td>
                    <td className={`py-2 text-right font-mono ${pctClass(r.d1)}`}>{fmtPct(r.d1)}</td>
                    <td className={`py-2 text-right font-mono ${pctClass(r.d7)}`}>{fmtPct(r.d7)}</td>
                    <td className={`py-2 text-right font-mono ${pctClass(r.d30)}`}>{fmtPct(r.d30)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
