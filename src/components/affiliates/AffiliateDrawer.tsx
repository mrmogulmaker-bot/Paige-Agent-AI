// src/components/affiliates/AffiliateDrawer.tsx
import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign } from "lucide-react";
import type { AffiliateStatRow, ConversionRow } from "@/lib/affiliates/types";
import { fetchAffiliateConversions } from "@/lib/affiliates/queries";
import { formatCents, formatDate, formatNumber, formatPercent } from "@/lib/affiliates/format";
import MarkPaidDialog from "./MarkPaidDialog";

interface Props {
  affiliate: AffiliateStatRow | null;
  onClose: () => void;
  onPaid?: () => void;
}

export default function AffiliateDrawer({ affiliate, onClose, onPaid }: Props) {
  const [rows, setRows] = useState<ConversionRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markPaidOpen, setMarkPaidOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!affiliate) {
      setRows(null);
      return;
    }
    setLoading(true);
    setError(null);
    fetchAffiliateConversions(affiliate.affiliate_id)
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? "Failed to load conversions");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [affiliate]);

  const open = !!affiliate;

  return (
    <Sheet open={open} onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl overflow-y-auto"
      >
        {affiliate && (
          <>
            <SheetHeader>
              <SheetTitle className="text-[#1a2840]">
                {affiliate.full_name ?? "Unnamed affiliate"}
              </SheetTitle>
              <SheetDescription className="flex flex-wrap gap-2 pt-1">
                <Badge className="bg-[#1a2840] text-white">
                  {affiliate.tier_name}
                </Badge>
                <Badge variant="outline" className="border-[#d4a574] text-[#d4a574]">
                  {formatPercent(affiliate.commission_rate)}
                </Badge>
                <span className="font-mono text-xs text-[#1a2840]/70">
                  {affiliate.referral_code}
                </span>
                {!affiliate.active && (
                  <Badge variant="outline" className="border-red-400 text-red-500">
                    inactive
                  </Badge>
                )}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <MiniStat label="Clicks" value={formatNumber(affiliate.clicks)} />
              <MiniStat label="Signups" value={formatNumber(affiliate.signups)} />
              <MiniStat label="Paid" value={formatNumber(affiliate.paid_conversions)} />
              <MiniStat
                label="Commission owed"
                value={formatCents(affiliate.commission_owed_cents)}
                highlight
              />
            </div>

            {(affiliate.commission_owed_cents ?? 0) > 0 && (
              <div className="mt-4">
                <Button
                  onClick={() => setMarkPaidOpen(true)}
                  className="w-full bg-[#d4a574] text-[#1a2840] hover:bg-[#d4a574]/90"
                >
                  <DollarSign className="mr-2 h-4 w-4" />
                  Mark Paid &amp; Notify Affiliate
                </Button>
              </div>
            )}

            <MarkPaidDialog
              open={markPaidOpen}
              onOpenChange={setMarkPaidOpen}
              affiliate={affiliate}
              onPaid={() => {
                onPaid?.();
                onClose();
              }}
            />

            <div className="mt-6">
              <h3 className="mb-2 text-sm font-semibold text-[#1a2840]">
                Recent conversions
              </h3>
              {loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ) : error ? (
                <p className="text-sm text-red-500">{error}</p>
              ) : !rows || rows.length === 0 ? (
                <p className="rounded-md border border-dashed border-[#1a2840]/20 p-6 text-center text-sm text-[#1a2840]/60">
                  No conversions yet.
                </p>
              ) : (
                <div className="overflow-hidden rounded-md border border-[#1a2840]/10">
                  <Table>
                    <TableHeader className="bg-[#1a2840]/5">
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Commission</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="text-sm">
                            {formatDate(c.converted_at)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                c.status === "attributed"
                                  ? "border-green-500 text-green-600"
                                  : "border-[#1a2840]/30 text-[#1a2840]/60"
                              }
                            >
                              {c.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCents(c.amount_cents ?? 0)}
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums text-[#1a2840]">
                            {formatCents(c.commission_cents ?? 0)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function MiniStat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        highlight
          ? "rounded-md bg-[#d4a574]/10 p-3"
          : "rounded-md border border-[#1a2840]/10 p-3"
      }
    >
      <p className="text-xs uppercase tracking-wider text-[#1a2840]/60">{label}</p>
      <p
        className={
          highlight
            ? "mt-1 text-lg font-semibold text-[#d4a574]"
            : "mt-1 text-lg font-semibold text-[#1a2840]"
        }
      >
        {value}
      </p>
    </div>
  );
}
