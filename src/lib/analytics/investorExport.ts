// Investor-grade export helpers for the analytics dashboard.
// CSV: simple plain-text download.
// PDF: jsPDF + autotable styled summary.

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface InvestorMetrics {
  generatedAt: Date;
  periodLabel: string;
  totalUsers: number;
  mrr: number;
  arr: number;
  activeToday: number;
  trialToPaid: number; // 0..1
  churnRate: number; // 0..1
  dauMau: number; // 0..1
  newSignups: number;
  topChannels: Array<{ source: string; signups: number }>;
  growth: Array<{ date: string; new_signups: number }>;
}

const fmtMoney = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

export function exportMetricsToCsv(m: InvestorMetrics): void {
  const rows: string[][] = [
    ["PaigeAgent Investor Metrics"],
    ["Generated", m.generatedAt.toISOString()],
    ["Period", m.periodLabel],
    [],
    ["Metric", "Value"],
    ["Total Users", String(m.totalUsers)],
    ["MRR", fmtMoney(m.mrr)],
    ["ARR", fmtMoney(m.arr)],
    ["Active Today", String(m.activeToday)],
    ["New Signups (period)", String(m.newSignups)],
    ["Trial -> Paid Conversion", fmtPct(m.trialToPaid)],
    ["Churn Rate", fmtPct(m.churnRate)],
    ["DAU / MAU", fmtPct(m.dauMau)],
    [],
    ["Top Acquisition Channels"],
    ["Source", "Signups"],
    ...m.topChannels.map((c) => [c.source, String(c.signups)]),
    [],
    ["Daily New Signups"],
    ["Date", "New Signups"],
    ...m.growth.map((g) => [g.date, String(g.new_signups)]),
  ];

  const csv = rows
    .map((r) =>
      r
        .map((cell) =>
          /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell,
        )
        .join(","),
    )
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, `paigeagent-investor-metrics-${dateSlug(m.generatedAt)}.csv`);
}

export function exportMetricsToPdf(m: InvestorMetrics): void {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();

  // Header
  doc.setFillColor(0, 0, 0);
  doc.rect(0, 0, pageW, 70, "F");
  doc.setTextColor(207, 174, 112); // brand gold
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("PaigeAgent — Investor Metrics", 40, 35);
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "normal");
  doc.text(`${m.periodLabel}  •  Generated ${m.generatedAt.toLocaleString()}`, 40, 55);

  // KPI table
  autoTable(doc, {
    startY: 100,
    head: [["Metric", "Value"]],
    body: [
      ["Total Users", String(m.totalUsers.toLocaleString())],
      ["MRR", fmtMoney(m.mrr)],
      ["ARR", fmtMoney(m.arr)],
      ["Active Today", String(m.activeToday.toLocaleString())],
      ["New Signups (period)", String(m.newSignups.toLocaleString())],
      ["Trial → Paid Conversion", fmtPct(m.trialToPaid)],
      ["Churn Rate", fmtPct(m.churnRate)],
      ["DAU / MAU", fmtPct(m.dauMau)],
    ],
    headStyles: { fillColor: [0, 0, 0], textColor: [207, 174, 112] },
    styles: { fontSize: 11, cellPadding: 8 },
    theme: "grid",
  });

  // Channels
  const afterKpi = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 100;
  autoTable(doc, {
    startY: afterKpi + 24,
    head: [["Top Acquisition Channels", "Signups"]],
    body: m.topChannels.length
      ? m.topChannels.map((c) => [c.source, String(c.signups)])
      : [["No data yet", "—"]],
    headStyles: { fillColor: [0, 0, 0], textColor: [207, 174, 112] },
    styles: { fontSize: 11, cellPadding: 8 },
    theme: "grid",
  });

  // Growth
  const afterChannels = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? afterKpi + 24;
  autoTable(doc, {
    startY: afterChannels + 24,
    head: [["Date", "New Signups"]],
    body: m.growth.slice(-30).map((g) => [g.date, String(g.new_signups)]),
    headStyles: { fillColor: [0, 0, 0], textColor: [207, 174, 112] },
    styles: { fontSize: 10, cellPadding: 6 },
    theme: "striped",
  });

  doc.save(`paigeagent-investor-metrics-${dateSlug(m.generatedAt)}.pdf`);
}

function dateSlug(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
