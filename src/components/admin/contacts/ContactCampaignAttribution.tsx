// Shows which Growth-OS forms/funnels a contact came in through.
// Lives on ContactDetail to surface campaign attribution alongside activity.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Rocket } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Row {
  id: string;
  created_at: string;
  source: string;
  utm_json: any;
  payload_json: any;
  growth_forms: { name: string | null; slug: string | null } | null;
}

export function ContactCampaignAttribution({ contactId }: { contactId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("growth_form_submissions")
        .select("id, created_at, source, utm_json, payload_json, growth_forms(name, slug)")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (!cancelled) setRows((data ?? []) as any as Row[]);
    })();
    return () => { cancelled = true; };
  }, [contactId]);

  if (rows === null || rows.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Rocket className="h-4 w-4" /> Campaign Attribution
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        {rows.map((r) => {
          const utm = (r.utm_json ?? {}) as Record<string, string>;
          const formName = r.growth_forms?.name ?? "Form";
          return (
            <div key={r.id} className="flex flex-wrap items-center gap-2 py-1 border-b last:border-0">
              <Badge variant="outline" className="text-[10px]">{r.source}</Badge>
              <span className="font-medium">{formName}</span>
              {utm.utm_source && <Badge variant="secondary" className="text-[10px]">src: {utm.utm_source}</Badge>}
              {utm.utm_campaign && <Badge variant="secondary" className="text-[10px]">campaign: {utm.utm_campaign}</Badge>}
              {utm.utm_medium && <Badge variant="secondary" className="text-[10px]">via: {utm.utm_medium}</Badge>}
              <span className="ml-auto text-muted-foreground">
                {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
