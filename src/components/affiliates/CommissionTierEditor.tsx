// src/components/affiliates/CommissionTierEditor.tsx
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { CommissionTier } from "@/lib/affiliates/types";
import { updateCommissionTier } from "@/lib/affiliates/queries";
import { formatPercent } from "@/lib/affiliates/format";

interface Props {
  tiers: CommissionTier[] | null;
  onSaved: () => void;
}

export default function CommissionTierEditor({ tiers, onSaved }: Props) {
  return (
    <Card className="border-[#1a2840]/15">
      <CardHeader>
        <CardTitle className="text-[#1a2840]">Commission tiers</CardTitle>
        <p className="text-sm text-[#1a2840]/60">
          Rates apply to new conversions immediately. Existing conversions keep
          the rate they were attributed at.
        </p>
      </CardHeader>
      <CardContent>
        {!tiers ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (
          <div className="grid gap-3">
            {tiers.map((t) => (
              <TierRow key={t.id} tier={t} onSaved={onSaved} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TierRow({
  tier,
  onSaved,
}: {
  tier: CommissionTier;
  onSaved: () => void;
}) {
  const [ratePct, setRatePct] = useState<string>(
    (tier.commission_rate * 100).toString(),
  );
  const [isRecurring, setIsRecurring] = useState<boolean>(tier.is_recurring);
  const [durationMonths, setDurationMonths] = useState<string>(
    tier.duration_months?.toString() ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const dirty =
    Number(ratePct) !== tier.commission_rate * 100 ||
    isRecurring !== tier.is_recurring ||
    durationMonths !== (tier.duration_months?.toString() ?? "");

  async function save() {
    setErr(null);
    setOk(false);
    const rate = Number(ratePct) / 100;
    if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
      setErr("Rate must be 0–100%");
      return;
    }
    const months = durationMonths.trim() === "" ? null : Number(durationMonths);
    if (months !== null && (!Number.isFinite(months) || months < 1)) {
      setErr("Duration must be blank (lifetime) or a positive integer");
      return;
    }
    setSaving(true);
    try {
      await updateCommissionTier(tier.id, {
        commission_rate: rate,
        is_recurring: isRecurring,
        duration_months: months,
      });
      setOk(true);
      onSaved();
      setTimeout(() => setOk(false), 2000);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid items-end gap-3 rounded-md border border-[#1a2840]/10 p-3 md:grid-cols-[1.3fr_repeat(3,1fr)_auto]">
      <div>
        <p className="text-sm font-semibold text-[#1a2840]">
          {tier.display_name}
        </p>
        <div className="mt-1 flex items-center gap-2">
          <Badge variant="outline" className="border-[#1a2840]/20 font-mono text-[10px]">
            {tier.tier_key}
          </Badge>
          <span className="text-xs text-[#1a2840]/60">
            currently {formatPercent(tier.commission_rate)}
          </span>
        </div>
      </div>

      <div>
        <Label className="text-xs text-[#1a2840]/70">Rate (%)</Label>
        <Input
          type="number"
          step="0.5"
          min="0"
          max="100"
          value={ratePct}
          onChange={(e) => setRatePct(e.target.value)}
        />
      </div>

      <div>
        <Label className="text-xs text-[#1a2840]/70">Recurring</Label>
        <div className="mt-2 flex items-center gap-2">
          <Switch checked={isRecurring} onCheckedChange={setIsRecurring} />
          <span className="text-xs text-[#1a2840]/60">
            {isRecurring ? "on every invoice" : "first payment only"}
          </span>
        </div>
      </div>

      <div>
        <Label className="text-xs text-[#1a2840]/70">
          Duration (months)
        </Label>
        <Input
          type="number"
          min="1"
          placeholder="lifetime"
          value={durationMonths}
          onChange={(e) => setDurationMonths(e.target.value)}
        />
      </div>

      <div className="flex flex-col items-end gap-1">
        <Button
          size="sm"
          disabled={!dirty || saving}
          onClick={save}
          className="bg-[#1a2840] text-white hover:bg-[#1a2840]/90"
        >
          {saving ? "Saving…" : "Save"}
        </Button>
        {ok && <span className="text-[11px] text-green-600">Saved</span>}
        {err && <span className="text-[11px] text-red-500">{err}</span>}
      </div>
    </div>
  );
}
