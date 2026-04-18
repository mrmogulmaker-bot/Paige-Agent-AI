// src/lib/affiliates/format.ts
export function formatCents(cents: number | null | undefined): string {
  const n = (cents ?? 0) / 100;
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

export function formatNumber(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString("en-US");
}

export function formatPercent(rate: number | null | undefined): string {
  return `${Math.round((rate ?? 0) * 100)}%`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function referralUrlForCode(code: string, baseUrl?: string): string {
  const base =
    baseUrl ??
    (typeof window !== "undefined" ? window.location.origin : "https://paigeagent.ai");
  return `${base.replace(/\/+$/, "")}/?ref=${encodeURIComponent(code)}#pricing`;
}
