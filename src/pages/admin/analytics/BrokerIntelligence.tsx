// Broker Intelligence section for the admin Analytics dashboard.
// Surfaces broker session activity from analytics_events + broker_paige_sessions.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Brain, Clock, Share2, Trophy, Users } from "lucide-react";

interface Props {
  start: string;
  end: string;
}

export function BrokerIntelligence({ start, end }: Props) {
  const [sessions, setSessions] = useState(0);
  const [avgSeconds, setAvgSeconds] = useState(0);
  const [shared, setShared] = useState(0);
  const [topBroker, setTopBroker] = useState<string>("—");
  const [teamMembers, setTeamMembers] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const startIso = new Date(start).toISOString();
      const endIso = new Date(end + "T23:59:59").toISOString();

      const [startsRes, endsRes, sharesRes, brokerSessionsRes, teamRes] = await Promise.all([
        supabase
          .from("analytics_events")
          .select("id", { count: "exact", head: true })
          .eq("event_name", "broker_session_start")
          .gte("created_at", startIso)
          .lte("created_at", endIso),
        supabase
          .from("analytics_events")
          .select("properties")
          .eq("event_name", "broker_session_end")
          .gte("created_at", startIso)
          .lte("created_at", endIso)
          .limit(2000),
        supabase
          .from("analytics_events")
          .select("id", { count: "exact", head: true })
          .eq("event_name", "broker_summary_shared")
          .gte("created_at", startIso)
          .lte("created_at", endIso),
        supabase
          .from("broker_paige_sessions")
          .select("broker_id")
          .gte("created_at", startIso)
          .lte("created_at", endIso)
          .limit(5000),
        supabase
          .from("broker_team_members")
          .select("id", { count: "exact", head: true })
          .eq("status", "active"),
      ]);

      if (cancel) return;

      setSessions(startsRes.count || 0);
      setShared(sharesRes.count || 0);
      setTeamMembers(teamRes.count || 0);

      const durations = (endsRes.data || [])
        .map((r: any) => Number(r.properties?.duration_seconds || 0))
        .filter((n: number) => n > 0);
      setAvgSeconds(
        durations.length
          ? Math.round(durations.reduce((a: number, b: number) => a + b, 0) / durations.length)
          : 0,
      );

      // Tally top broker by session count
      const counts = new Map<string, number>();
      for (const row of brokerSessionsRes.data || []) {
        const id = (row as any).broker_id;
        if (!id) continue;
        counts.set(id, (counts.get(id) || 0) + 1);
      }
      const winner = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
      if (winner) {
        const { data: brokerRow } = await supabase
          .from("broker_profiles")
          .select("business_name")
          .eq("id", winner[0])
          .maybeSingle();
        if (!cancel) {
          setTopBroker(
            brokerRow?.business_name
              ? `${brokerRow.business_name} (${winner[1]})`
              : `${winner[0].slice(0, 8)}… (${winner[1]})`,
          );
        }
      } else if (!cancel) {
        setTopBroker("—");
      }

      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, [start, end]);

  const fmtDuration = (sec: number) => {
    if (!sec) return "—";
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m ? `${m}m ${s}s` : `${s}s`;
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground">
            Broker Sessions
          </CardTitle>
          <Brain className="h-4 w-4 text-[#CFAE70]" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{loading ? "…" : sessions.toLocaleString()}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground">Avg Length</CardTitle>
          <Clock className="h-4 w-4 text-[#CFAE70]" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{loading ? "…" : fmtDuration(avgSeconds)}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground">
            Summaries Shared
          </CardTitle>
          <Share2 className="h-4 w-4 text-[#CFAE70]" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{loading ? "…" : shared.toLocaleString()}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground">
            Most Active Broker
          </CardTitle>
          <Trophy className="h-4 w-4 text-[#CFAE70]" />
        </CardHeader>
        <CardContent>
          <div className="text-base font-semibold truncate">{loading ? "…" : topBroker}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground">
            Team Members
          </CardTitle>
          <Users className="h-4 w-4 text-[#CFAE70]" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{loading ? "…" : teamMembers.toLocaleString()}</div>
          <p className="text-[10px] text-muted-foreground mt-0.5">Active across all broker accounts</p>
        </CardContent>
      </Card>
    </div>
  );
}
