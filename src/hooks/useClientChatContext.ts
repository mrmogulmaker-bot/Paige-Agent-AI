import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { countUniqueNegativeAccounts, deduplicateNegativeItems } from "@/lib/deduplicateNegatives";
import { differenceInMonths } from "date-fns";
import { buildBureauHealthContext } from "@/components/credit/CreditFileHealthAssessment";

export interface ClientChatContext {
  contextBlock: string;
  isLoading: boolean;
  hasCreditData: boolean;
}

type Bureau = "experian" | "transunion" | "equifax";

function matchesBureau(bs: string | null | undefined, bureau: Bureau): boolean {
  if (!bs) return true; // null bureau_source means all bureaus
  const s = bs.toLowerCase().replace(/[\s-]/g, "_");
  if (s === "all_three" || s === "all") return true;
  return s.includes(bureau);
}

function statusLabel(pct: number, thresholds: [number, number, number]): string {
  if (pct >= thresholds[0]) return "Excellent";
  if (pct >= thresholds[1]) return "Good";
  if (pct >= thresholds[2]) return "Fair";
  return "Poor";
}

function ageLabel(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  return y > 0 ? `${y} years ${m} months` : `${m} months`;
}

function fmt$(n: number): string { return `$${n.toLocaleString()}`; }

/**
 * Assembles a structured client brief from real database data
 * for injection into Paige AI chat sessions.
 */
export function useClientChatContext(clientId?: string | null, userId?: string | null): ClientChatContext {
  const [contextBlock, setContextBlock] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasCreditData, setHasCreditData] = useState(false);

  useEffect(() => {
    if (!clientId && !userId) {
      setContextBlock("");
      setHasCreditData(false);
      return;
    }

    let cancelled = false;

    async function fetchContext() {
      setIsLoading(true);
      try {
        const parts: string[] = [];
        let fullName = "Unknown";
        let entityName: string | null = null;
        let fundingGoal: number | null = null;

        if (clientId) {
          const { data: client } = await supabase
            .from("clients")
            .select("first_name, last_name, entity_name, email, phone, funding_goal, monthly_revenue")
            .eq("id", clientId)
            .maybeSingle();

          if (client) {
            fullName = `${client.first_name} ${client.last_name}`.trim();
            entityName = client.entity_name;
            fundingGoal = client.funding_goal;
            parts.push(`CLIENT CONTEXT — ${fullName}`);
            if (entityName) parts.push(`Entity: ${entityName}`);
            if (client.funding_goal) parts.push(`Funding Goal: $${client.funding_goal.toLocaleString()}`);
            if (client.monthly_revenue) parts.push(`Monthly Revenue: $${client.monthly_revenue.toLocaleString()}`);
          }
        } else if (userId) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name, city, state")
            .eq("user_id", userId)
            .maybeSingle();

          if (profile) {
            fullName = profile.full_name || "User";
            parts.push(`CLIENT CONTEXT — ${fullName}`);
            if (profile.city) parts.push(`Location: ${profile.city}, ${profile.state}`);
          }
        }

        const resolvedUserId = userId || (clientId ? await resolveUserIdFromClient(clientId) : null);

        // --- Bureau scores from profiles ---
        let scores = { equifax: null as number | null, experian: null as number | null, transunion: null as number | null };
        if (resolvedUserId) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("estimated_fico_eq, estimated_fico_ex, estimated_fico_tu, funding_goals")
            .eq("user_id", resolvedUserId)
            .maybeSingle();
          if (profile) {
            scores.equifax = profile.estimated_fico_eq;
            scores.experian = profile.estimated_fico_ex;
            scores.transunion = profile.estimated_fico_tu;
            if (!fundingGoal && profile.funding_goals) {
              try {
                const fg = profile.funding_goals as any;
                if (fg?.target_amount) parts.push(`Funding Goal: $${Number(fg.target_amount).toLocaleString()} — ${fg.objective || ""} — ${fg.timeline || ""}`);
              } catch { /* skip */ }
            }
          }
        }

        const scoreValues = [scores.transunion, scores.experian, scores.equifax].filter((v): v is number => v != null).sort((a, b) => a - b);
        const middleScore = scoreValues.length >= 2 ? scoreValues[Math.floor(scoreValues.length / 2)] : scoreValues[0] || null;
        parts.push(`Bureau Scores:`);
        parts.push(`  TransUnion: ${scores.transunion ?? "N/A"} — Pulled by: Capital One, Discover, OpenSky, Chime, Upgrade, Divvy`);
        parts.push(`  Experian: ${scores.experian ?? "N/A"} — Pulled by: Chase, Amex, Wells Fargo, SoFi, OnDeck, BlueVine`);
        parts.push(`  Equifax: ${scores.equifax ?? "N/A"} — Pulled by: Citi, Bank of America, LightStream, Equipment lenders`);
        parts.push(`  Middle Score: ${middleScore ?? "N/A"} — Used for SBA and multi-bureau products`);

        // === CONTEXT UPDATE 1 — Credit Factors Panel Data (per-bureau) ===
        if (resolvedUserId) {
          const [{ data: allAccounts }, { data: allNegs }] = await Promise.all([
            supabase.from("credit_accounts").select("id, creditor, type, is_open, is_authorized_user, credit_limit, limit_amount, balance, current_balance, account_open_date, account_close_date, opened_on, status, bureau_source, payment_history_json, original_amount, is_disputed_ownership, duplicate_of_id, needs_review").eq("user_id", resolvedUserId),
            supabase.from("credit_negative_items").select("id, creditor_name, account_number_masked, amount, bureau, item_type, status, date_of_occurrence, date_reported, is_disputed_ownership, duplicate_of_id").eq("user_id", resolvedUserId).neq("status", "removed"),
          ]);

          const activeAccounts = (allAccounts || []).filter(a => !a.is_disputed_ownership && !a.duplicate_of_id);
          const activeNegs = (allNegs || []).filter(n => !n.is_disputed_ownership && !n.duplicate_of_id);
          const hasAnyScores = [scores.experian, scores.transunion, scores.equifax].some((value) => value != null);
          const hasAnyCreditData = activeAccounts.length > 0 || activeNegs.length > 0 || hasAnyScores;
          setHasCreditData(hasAnyCreditData);
          const now = new Date();

          const bureaus: Bureau[] = ["experian", "transunion", "equifax"];
          const bureauScoreMap: Record<Bureau, number | null> = { experian: scores.experian, transunion: scores.transunion, equifax: scores.equifax };

          if (!hasAnyCreditData) {
            parts.push("");
            parts.push("Credit Data Status: No credit data is currently on file. Tell the client to upload a credit report to get started.");
          }

          parts.push("");
          for (const bureau of bureaus) {
            const bAccounts = activeAccounts.filter(a => matchesBureau(a.bureau_source, bureau));
            const bNegs = activeNegs.filter(n => n.bureau?.toLowerCase().replace(/[\s-]/g, "_").includes(bureau));
            const bScore = bureauScoreMap[bureau];
            const bureauLabel = bureau.charAt(0).toUpperCase() + bureau.slice(1);

            // Payment History
            let onTimeCount = 0;
            let totalPayments = 0;
            let accountsWithLates = 0;
            let worstAccount = "";
            let worstPct = 100;
            for (const a of bAccounts) {
              const phj = a.payment_history_json as any;
              if (phj && typeof phj === "object") {
                const months = Object.values(phj).length;
                const onTime = Object.values(phj).filter((v: any) => v === "OK" || v === "C" || v === "1").length;
                totalPayments += months;
                onTimeCount += onTime;
                const pct = months > 0 ? Math.round((onTime / months) * 100) : 100;
                if (pct < 95) accountsWithLates++;
                if (pct < worstPct) { worstPct = pct; worstAccount = a.creditor; }
              }
            }
            const paymentRate = totalPayments > 0 ? Math.round((onTimeCount / totalPayments) * 100) : 100;

            // Utilization — use inference chain for credit_limit: credit_limit → limit_amount → original_amount → highest_balance
            const revolving = bAccounts.filter(a => {
              const t = (a.type || "").toLowerCase();
              return t.includes("revolving") || t.includes("credit_card") || t.includes("creditcard");
            });
            const inferLimit = (a: any): number => {
              return Number(a.credit_limit) || Number(a.limit_amount) || Number(a.original_amount) || 0;
            };
            // Separate accounts with reported limits from those without
            const revWithLimit = revolving.filter(a => inferLimit(a) > 0);
            const revWithoutLimit = revolving.filter(a => inferLimit(a) <= 0);
            const totalRevBal = revWithLimit.reduce((s, a) => s + (Number(a.current_balance ?? a.balance) || 0), 0);
            const totalRevLimit = revWithLimit.reduce((s, a) => s + inferLimit(a), 0);
            const utilPct = totalRevLimit > 0 ? Math.round((totalRevBal / totalRevLimit) * 100) : 0;
            const over30 = revWithLimit.filter(a => {
              const bal = Number(a.current_balance ?? a.balance) || 0;
              const lim = inferLimit(a);
              return lim > 0 && (bal / lim) > 0.3;
            });
            const paydownTo10 = totalRevLimit > 0 ? Math.max(0, totalRevBal - Math.round(totalRevLimit * 0.1)) : 0;

            // Derogatory Marks
            const derogStatuses = ["collection", "charge_off", "chargeoff", "charge off", "late", "bad debt"];
            const derogAccounts = bAccounts.filter(a => {
              const st = (a.status || "").toLowerCase();
              return derogStatuses.some(d => st.includes(d));
            });
            const collectionsCount = bNegs.filter(n => (n.item_type || "").toLowerCase().includes("collection")).length;
            const chargeOffsCount = bNegs.filter(n => {
              const t = (n.item_type || "").toLowerCase();
              return t.includes("charge") || t.includes("bad debt");
            }).length;
            const newestDerog = bNegs.length > 0 ? bNegs.sort((a, b) => new Date(b.date_reported || b.date_of_occurrence || 0).getTime() - new Date(a.date_reported || a.date_of_occurrence || 0).getTime())[0] : null;

            // Credit Age
            const accountAges = bAccounts
              .map(a => {
                const opened = a.account_open_date || a.opened_on;
                return opened ? differenceInMonths(now, new Date(opened)) : null;
              })
              .filter((v): v is number => v != null && v >= 0);
            const avgAge = accountAges.length > 0 ? Math.round(accountAges.reduce((s, v) => s + v, 0) / accountAges.length) : 0;
            const oldestAge = accountAges.length > 0 ? Math.max(...accountAges) : 0;
            const newestAge = accountAges.length > 0 ? Math.min(...accountAges) : 0;

            // Find anchor accounts (3 oldest)
            const sortedByAge = bAccounts
              .map(a => ({ creditor: a.creditor, months: (() => { const d = a.account_open_date || a.opened_on; return d ? differenceInMonths(now, new Date(d)) : 0; })() }))
              .sort((a, b) => b.months - a.months);
            const anchors = sortedByAge.slice(0, 3).map(a => a.creditor);

            // Oldest/newest account names
            const oldestAcct = sortedByAge[0];
            const newestAcct = sortedByAge[sortedByAge.length - 1];

            // Total Accounts
            const openAccounts = bAccounts.filter(a => a.is_open !== false);
            const closedGood = bAccounts.filter(a => a.is_open === false && !(derogStatuses.some(d => (a.status || "").toLowerCase().includes(d))));
            const closedDerog = bAccounts.filter(a => a.is_open === false && derogStatuses.some(d => (a.status || "").toLowerCase().includes(d)));

            // Account type breakdown
            const typeCount = (pattern: string) => bAccounts.filter(a => (a.type || "").toLowerCase().includes(pattern)).length;
            const revCount = typeCount("revolving") + typeCount("credit_card");
            const instCount = typeCount("installment");
            const mortCount = typeCount("mortgage");
            const autoCount = typeCount("auto");
            const otherCount = bAccounts.length - revCount - instCount - mortCount - autoCount;

            // File completion (10-account target)
            let fileTargets = 0;
            if (revCount >= 3) fileTargets += 3; else fileTargets += revCount;
            if (instCount >= 2) fileTargets += 2; else fileTargets += instCount;
            if (mortCount >= 1) fileTargets += 1;
            if (autoCount >= 1) fileTargets += 1;
            // + remaining from any type up to 10
            const remaining = Math.min(3, otherCount);
            fileTargets += remaining;
            const fileCompletion = Math.min(100, Math.round((fileTargets / 10) * 100));

            parts.push(`Credit Factors — ${bureauLabel} (score: ${bScore ?? "N/A"}):`);
            parts.push(`  Payment History: ${paymentRate}% on-time (${accountsWithLates} accounts with lates)${worstAccount && worstPct < 95 ? ` — worst: ${worstAccount} at ${worstPct}%` : ""}`);
            parts.push(`  Utilization: ${utilPct}% overall — ${fmt$(totalRevBal)} of ${fmt$(totalRevLimit)} — ${over30.length} accounts over 30%${revWithoutLimit.length > 0 ? ` (Note: ${revWithoutLimit.length} revolving accounts excluded — credit limits not reported)` : ""}`);
            if (paydownTo10 > 0) parts.push(`  Paydown needed for 10% utilization: ${fmt$(paydownTo10)}`);
            if (over30.length > 0) {
              const over30Detail = over30.slice(0, 3).map(a => {
                const bal = Number(a.current_balance ?? a.balance) || 0;
                const lim = inferLimit(a);
                return `${a.creditor} (${lim > 0 ? Math.round((bal / lim) * 100) : "?"}%)`;
              }).join(", ");
              parts.push(`  Accounts over 30%: ${over30Detail}`);
            }
            parts.push(`  Derogatory Marks: ${derogAccounts.length + bNegs.length} total (${collectionsCount} collections, ${chargeOffsCount} charge-offs)`);
            if (newestDerog) parts.push(`  Newest derogatory: ${newestDerog.creditor_name} — ${newestDerog.date_reported || newestDerog.date_of_occurrence || "unknown date"}`);
            parts.push(`  Credit Age: ${ageLabel(avgAge)} average — oldest: ${oldestAcct?.creditor || "N/A"} (${ageLabel(oldestAge)}) — newest: ${newestAcct?.creditor || "N/A"} (${ageLabel(newestAge)})`);
            parts.push(`  Anchor Accounts (never close): ${anchors.join(", ") || "N/A"}`);
            parts.push(`  Total Accounts: ${openAccounts.length} open, ${closedGood.length} closed good standing, ${closedDerog.length} closed derogatory`);
            parts.push(`  Mix: ${revCount} revolving, ${instCount} installment, ${mortCount} mortgage, ${autoCount} auto, ${otherCount} other`);
            parts.push(`  File Completion: ${fileCompletion}% of optimal 10-account structure`);
            parts.push("");
          }

          // === CONTEXT UPDATE 4 — Account Manager Status ===
          const disputedOwnership = activeAccounts.filter(() => false).length; // already filtered out
          const allAccountsRaw = allAccounts || [];
          const disputedCount = allAccountsRaw.filter(a => a.is_disputed_ownership).length;
          const mergedCount = allAccountsRaw.filter(a => a.duplicate_of_id).length;
          const reviewCount = allAccountsRaw.filter(a => a.needs_review).length;

          const { data: recentMod } = await supabase
            .from("account_modifications")
            .select("modification_type, modification_source, notes, created_at")
            .eq("user_id", resolvedUserId)
            .order("created_at", { ascending: false })
            .limit(1);

          parts.push(`Account File Status:`);
          parts.push(`  Disputed ownership (not mine): ${disputedCount} accounts excluded from scoring`);
          parts.push(`  Merged duplicates: ${mergedCount} accounts consolidated`);
          parts.push(`  Needs review: ${reviewCount} accounts flagged`);
          if (recentMod?.[0]) {
            const mod = recentMod[0];
            const daysAgo = Math.round((Date.now() - new Date(mod.created_at).getTime()) / 86400000);
            parts.push(`  Last modification: ${mod.modification_type} by ${mod.modification_source} — ${daysAgo}d ago`);
          }
          parts.push("");

          // === Comparable Credit (CONTEXT UPDATE 3) ===
          const comparableLines: string[] = [];
          for (const bureau of bureaus) {
            const bureauLabel = bureau.charAt(0).toUpperCase() + bureau.slice(1);
            const bAccts = activeAccounts.filter(a => matchesBureau(a.bureau_source, bureau));

            // Active comparable: open, positive
            const activeComp = bAccts.filter(a => a.is_open !== false && !(["collection", "charge_off", "chargeoff", "late"].some(d => (a.status || "").toLowerCase().includes(d))));
            // Historical comparable: closed, good standing, zero balance
            const historicalComp = bAccts.filter(a => a.is_open === false && !(["collection", "charge_off", "chargeoff", "late"].some(d => (a.status || "").toLowerCase().includes(d))));

            const projectionMultiplier = (type: string) => {
              const t = type.toLowerCase();
              if (t.includes("revolving") || t.includes("credit_card")) return 1.5;
              return 3;
            };

            const getAmount = (a: any) => Number(a.original_amount) || Number(a.credit_limit) || Number(a.limit_amount) || Number(a.balance) || 0;

            comparableLines.push(`Comparable Credit — ${bureauLabel}:`);
            if (activeComp.length > 0) {
              comparableLines.push(`  Active:`);
              for (const a of activeComp.slice(0, 5)) {
                const amt = getAmount(a);
                const mult = projectionMultiplier(a.type || "");
                comparableLines.push(`  - ${a.creditor}: ${a.type} — limit/amount ${fmt$(amt)} — supports up to ${fmt$(Math.round(amt * mult))}`);
              }
              if (activeComp.length > 5) comparableLines.push(`  ... and ${activeComp.length - 5} more`);
            }
            if (historicalComp.length > 0) {
              comparableLines.push(`  Historical (Closed Good Standing):`);
              for (const a of historicalComp.slice(0, 5)) {
                const amt = getAmount(a);
                const mult = projectionMultiplier(a.type || "");
                comparableLines.push(`  - ${a.creditor}: ${a.type} — original ${fmt$(amt)} — supports up to ${fmt$(Math.round(amt * mult))}`);
              }
              if (historicalComp.length > 5) comparableLines.push(`  ... and ${historicalComp.length - 5} more`);
            }

            // Strongest by category
            const strongestByCategory = (pattern: string, mult: number) => {
              const matching = [...activeComp, ...historicalComp].filter(a => (a.type || "").toLowerCase().includes(pattern));
              if (matching.length === 0) return null;
              const best = matching.sort((a, b) => getAmount(b) - getAmount(a))[0];
              const amt = getAmount(best);
              return { creditor: best.creditor, amount: amt, projection: Math.round(amt * mult) };
            };
            const autoComp = strongestByCategory("auto", 3);
            const revComp = strongestByCategory("revolving", 1.5) || strongestByCategory("credit_card", 1.5);
            const instComp = strongestByCategory("installment", 3);

            comparableLines.push(`  Strongest comparable:`);
            comparableLines.push(`  - Auto: ${autoComp ? `${fmt$(autoComp.amount)} — supports up to ${fmt$(autoComp.projection)}` : "None"}`);
            comparableLines.push(`  - Revolving: ${revComp ? `${fmt$(revComp.amount)} — supports up to ${fmt$(revComp.projection)}` : "None"}`);
            comparableLines.push(`  - Installment: ${instComp ? `${fmt$(instComp.amount)} — supports up to ${fmt$(instComp.projection)}` : "None"}`);
            comparableLines.push("");
          }
          parts.push(...comparableLines);
        }

        // --- Credit factors from pre-calculated table (legacy) ---
        if (!resolvedUserId) {
          const factorFilter = clientId
            ? supabase.from("credit_factor_scores").select("aggregate_utilization, overall_fundability_score, revolving_count, installment_count, mortgage_count").eq("client_id", clientId).order("calculated_at", { ascending: false }).limit(1)
            : null;
          if (factorFilter) {
            const { data: factors } = await factorFilter;
            const f = factors?.[0];
            if (f) {
              parts.push(`Utilization: ${f.aggregate_utilization != null ? `${f.aggregate_utilization}%` : "N/A"}`);
              parts.push(`Fundability Score: ${f.overall_fundability_score ?? "N/A"}/100`);
              parts.push(`Credit Mix: ${f.revolving_count ?? 0} revolving, ${f.installment_count ?? 0} installment, ${f.mortgage_count ?? 0} mortgage`);
            }
          }
        }

        // --- Active negatives (summary) ---
        const negFilter = clientId
          ? supabase.from("credit_negative_items").select("creditor_name, account_number_masked, amount, bureau, item_type, status").eq("client_id", clientId).neq("status", "removed")
          : resolvedUserId
            ? supabase.from("credit_negative_items").select("creditor_name, account_number_masked, amount, bureau, item_type, status").eq("user_id", resolvedUserId).neq("status", "removed")
            : null;

        if (negFilter) {
          const { data: negatives } = await negFilter;
          if (negatives && negatives.length > 0) {
            const uniqueCount = countUniqueNegativeAccounts(negatives);
            const totalBureauRecords = negatives.length;
            parts.push(`Active Negatives: ${uniqueCount} unique accounts (${totalBureauRecords} bureau records total — same account may appear on multiple bureaus)`);

            const chargeOffRecords = negatives.filter(n => {
              const t = (n.item_type || "").toLowerCase();
              return t.includes("charge") || t.includes("chargeoff") || t.includes("bad debt") || t.includes("write off") || t.includes("written off");
            });
            if (chargeOffRecords.length > 0) {
              const uniqueChargeOffs = deduplicateNegativeItems(chargeOffRecords);
              parts.push(`Charge-Offs: ${uniqueChargeOffs.length} unique accounts (${chargeOffRecords.length} bureau records)`);
            }

            const collectionRecords = negatives.filter(n => (n.item_type || "").toLowerCase().includes("collection"));
            if (collectionRecords.length > 0) {
              const uniqueCollections = deduplicateNegativeItems(collectionRecords);
              parts.push(`Collections: ${uniqueCollections.length} unique accounts (${collectionRecords.length} bureau records)`);
            }

            const sorted = [...negatives].sort((a, b) => (b.amount || 0) - (a.amount || 0)).slice(0, 3);
            const topItems = sorted.map(n => `${n.creditor_name || "Unknown"} ($${n.amount?.toLocaleString() ?? "N/A"}, ${n.bureau}, ${n.item_type})`).join(" | ");
            parts.push(`Top items: ${topItems}`);
          } else {
            parts.push("Active Negatives: 0 items");
          }
        }

        // --- Disputes ---
        const disputeFilter = clientId
          ? supabase.from("disputes").select("status, dispute_round").eq("client_id", clientId)
          : resolvedUserId
            ? supabase.from("disputes").select("status, dispute_round").eq("user_id", resolvedUserId)
            : null;

        if (disputeFilter) {
          const { data: disputes } = await disputeFilter;
          if (disputes && disputes.length > 0) {
            const openDisputes = disputes.filter(d => d.status !== "resolved");
            const statusCounts: Record<string, number> = {};
            openDisputes.forEach(d => { statusCounts[d.status] = (statusCounts[d.status] || 0) + 1; });
            const maxRound = Math.max(...disputes.map(d => d.dispute_round || 1));
            const statusStr = Object.entries(statusCounts).map(([s, c]) => `${c} ${s}`).join(", ");
            parts.push(`Disputes: ${openDisputes.length} open (${statusStr || "none"}) | Round ${maxRound}`);
          } else {
            parts.push("Disputes: None on file");
          }
        }

        // Last dispute outcome
        const outcomeFilter = clientId
          ? supabase.from("dispute_outcomes").select("outcome_type, creditor_name, bureau, created_at").eq("client_id", clientId).order("created_at", { ascending: false }).limit(1)
          : resolvedUserId
            ? supabase.from("dispute_outcomes").select("outcome_type, creditor_name, bureau, created_at").eq("user_id", resolvedUserId).order("created_at", { ascending: false }).limit(1)
            : null;

        if (outcomeFilter) {
          const { data: outcomes } = await outcomeFilter;
          if (outcomes?.[0]) {
            const o = outcomes[0];
            parts.push(`Last Dispute Outcome: ${o.outcome_type} — ${o.creditor_name} (${o.bureau}) on ${new Date(o.created_at).toLocaleDateString()}`);
          }
        }

        // --- Business Foundation Status + Personal/Business Separation Audit ---
        if (resolvedUserId) {
          const [{ data: businesses }, { data: ownerProfile }] = await Promise.all([
            supabase
              .from("businesses")
              .select("id, legal_name, entity_type, state_of_formation, formation_date, ein, business_address_type, business_street_address, business_city, business_state, business_zip, business_phone, business_email, phone_411_listed, has_bank_account, bank_name, bank_account_opened_date")
              .eq("owner_user_id", resolvedUserId)
              .limit(3),
            supabase
              .from("profiles")
              .select("street_address, city, state, zip_code, phone_number, email")
              .eq("user_id", resolvedUserId)
              .maybeSingle(),
          ]);

          if (businesses && businesses.length > 0) {
            const biz = businesses[0];
            const entityVerified = biz.entity_type && biz.state_of_formation;
            const entityPending = !entityVerified && (biz.entity_type || biz.state_of_formation);
            const entityStatus = entityVerified ? "Verified" : entityPending ? "Pending" : "Missing";
            const entityLine = entityVerified
              ? `Entity: ${biz.entity_type} formed in ${biz.state_of_formation}${biz.formation_date ? ` on ${biz.formation_date}` : ""} | Status: ${entityStatus}`
              : `Entity: Not yet formed | Status: ${entityStatus}`;
            const einLine = `EIN: ${biz.ein ? "On file" : "Not on file"}`;
            const addrFilled = biz.business_street_address && biz.business_city && biz.business_state && biz.business_zip;
            const isHome = biz.business_address_type === "Home Address";
            const addrStatus = isHome ? "Pending — Home Address (privacy risk)" : addrFilled && biz.business_address_type ? "Verified" : biz.business_street_address ? "Pending" : "Missing";
            const addrDetail = addrFilled ? `${biz.business_street_address}, ${biz.business_city}, ${biz.business_state} ${biz.business_zip}` : "Not entered";
            const addrLine = `Business Address: ${biz.business_address_type || "Not set"} — ${addrDetail} | Status: ${addrStatus}`;
            const phoneStatus = biz.business_phone && biz.phone_411_listed ? "Verified" : biz.business_phone ? "Pending" : "Missing";
            const phoneLine = `Business Phone: ${biz.business_phone || "Not on file"} | 411 Listed: ${biz.phone_411_listed ? "Yes" : "No"} | Status: ${phoneStatus}`;
            const bankStatus = biz.has_bank_account && biz.bank_name && biz.bank_account_opened_date ? "Verified" : biz.has_bank_account || biz.bank_name ? "Pending" : "Missing";
            const bankLine = `Business Bank Account: ${biz.bank_name || "Not on file"}${biz.bank_account_opened_date ? ` opened ${biz.bank_account_opened_date}` : ""} | Commingling-free: ${biz.has_bank_account ? "Yes" : "No"} | Status: ${bankStatus}`;
            let foundationVerified = 0;
            if (entityVerified) foundationVerified++;
            if (biz.ein) foundationVerified++;
            if (addrFilled && biz.business_address_type && !isHome) foundationVerified++;
            if (biz.business_phone && biz.phone_411_listed) foundationVerified++;
            if (biz.has_bank_account && biz.bank_name && biz.bank_account_opened_date) foundationVerified++;
            const foundationPct = Math.round((foundationVerified / 5) * 100);

            parts.push(`\nBusiness Foundation Status:`);
            parts.push(`- ${entityLine}`);
            parts.push(`- ${einLine}`);
            parts.push(`- ${addrLine}`);
            parts.push(`- ${phoneLine}`);
            parts.push(`- ${bankLine}`);
            parts.push(`- Foundation Completion: ${foundationPct}%`);
            parts.push(`Business: ${biz.legal_name}`);

            // === Personal/Business Separation Audit ===
            try {
              const { data: presence } = await supabase
                .from("business_public_presence")
                .select("website_url, website_live")
                .eq("business_id", biz.id)
                .maybeSingle();

              const { runSeparationAudit, summarizeSeparation } = await import("@/lib/separationAudit");
              const audit = runSeparationAudit({
                personalAddress: (ownerProfile as any)?.street_address ?? null,
                personalCity: (ownerProfile as any)?.city ?? null,
                personalState: (ownerProfile as any)?.state ?? null,
                personalZip: (ownerProfile as any)?.zip_code ?? null,
                personalPhone: (ownerProfile as any)?.phone_number ?? null,
                personalEmail: (ownerProfile as any)?.email ?? null,
                businessName: biz.legal_name,
                businessStreetAddress: biz.business_street_address,
                businessCity: biz.business_city,
                businessState: biz.business_state,
                businessZip: biz.business_zip,
                businessPhone: biz.business_phone,
                businessEmail: (biz as any).business_email,
                businessAddressType: biz.business_address_type,
                phone411Listed: biz.phone_411_listed,
                websiteUrl: presence?.website_url ?? null,
                websiteLive: presence?.website_live ?? null,
              });

              parts.push("");
              parts.push(`Personal/Business Separation Audit (score ${audit.score}/100, status: ${audit.status}):`);
              parts.push(`  ${summarizeSeparation(audit)}`);
              if (audit.issues.length > 0) {
                for (const issue of audit.issues.slice(0, 6)) {
                  parts.push(`  - [${issue.severity.toUpperCase()}] ${issue.field}: ${issue.detail} → ${issue.fixHint}`);
                }
                parts.push(`  Coaching guidance: When the client asks about funding, applying for credit, or readiness, proactively warn them about any HIGH severity items above before they submit applications. Funders and bureaus (LexisNexis, Equifax SBFE, D&B) penalize commingling.`);
              }
            } catch {
              /* audit is best-effort — never block context */
            }
          } else {
            parts.push("Business Profile: No business entity on file");
          }
        }

        // --- Bureau-Specific Credit File Health Assessment ---
        if (resolvedUserId) {
          const [{ data: creditAccounts }, { data: negItems }, { data: lenderPrefs }] = await Promise.all([
            supabase.from("credit_accounts").select("id, creditor, type, is_open, is_authorized_user, credit_limit, limit_amount, balance, current_balance, account_open_date, account_close_date, opened_on, status").eq("user_id", resolvedUserId).order("creditor"),
            supabase.from("credit_negative_items").select("id, creditor_name, account_number_masked, amount, bureau, item_type, status").eq("user_id", resolvedUserId).neq("status", "removed"),
            supabase.from("lender_bureau_preferences" as any).select("institution_name, primary_bureau, secondary_bureau").limit(100),
          ]);

          if (creditAccounts && creditAccounts.length > 0) {
            const bureauScores = {
              experian: scores.experian,
              transunion: scores.transunion,
              equifax: scores.equifax,
            };
            const ctx = buildBureauHealthContext(
              bureauScores,
              creditAccounts as any,
              (negItems || []) as any,
              ((lenderPrefs as unknown) || []) as any
            );
            parts.push(`\n${ctx}`);
          }
        }

        // === CONTEXT UPDATE 2 — Credit Alert System Data ===
        if (resolvedUserId) {
          const [{ data: unreadAlerts }, { data: resolvedAlert }] = await Promise.all([
            supabase.from("credit_alerts").select("alert_type, alert_severity, alert_title, alert_description, bureau, previous_value, new_value, created_at").eq("client_id", resolvedUserId).eq("is_dismissed", false).eq("is_read", false).order("created_at", { ascending: false }).limit(5),
            supabase.from("credit_alerts").select("alert_type, alert_title, bureau, created_at").eq("client_id", resolvedUserId).eq("is_dismissed", true).order("created_at", { ascending: false }).limit(1),
          ]);

          parts.push("");
          if (unreadAlerts && unreadAlerts.length > 0) {
            parts.push(`Active Alerts (${unreadAlerts.length} unread):`);
            for (const a of unreadAlerts) {
              const msAgo = Date.now() - new Date(a.created_at).getTime();
              const timeAgo = msAgo < 86400000 ? `${Math.round(msAgo / 3600000)}h ago` : `${Math.round(msAgo / 86400000)}d ago`;
              const desc = (a.alert_description || "").length > 100 ? a.alert_description.substring(0, 100) + "..." : a.alert_description;
              parts.push(`- ${(a.alert_severity || "").toUpperCase()}: ${a.alert_title} — ${desc} — Bureau: ${a.bureau || "all"} — ${timeAgo}`);
              if (a.previous_value || a.new_value) {
                parts.push(`  Previous: ${a.previous_value || "N/A"} | Current: ${a.new_value || "N/A"}`);
              }
            }
          } else {
            parts.push(`Active Alerts: No active alerts. Credit file is stable since last analysis.`);
          }
          if (resolvedAlert?.[0]) {
            const r = resolvedAlert[0];
            const daysAgo = Math.round((Date.now() - new Date(r.created_at).getTime()) / 86400000);
            parts.push(`Last resolved alert: ${r.alert_title} (${r.bureau || "all"}) — ${daysAgo}d ago`);
          }
        }

        // === CONTEXT UPDATE 5 — Data Freshness Status ===
        if (resolvedUserId) {
          const { data: recentUploads } = await supabase
            .from("credit_report_uploads")
            .select("bureau_detected, last_analyzed_at, analysis_status, created_at")
            .eq("user_id", resolvedUserId)
            .eq("analysis_status", "completed")
            .order("last_analyzed_at", { ascending: false })
            .limit(10);

          const { data: qualityLogs } = await supabase
            .from("extraction_quality_log" as any)
            .select("overall_quality_score, required_fields_percentage")
            .eq("client_id", resolvedUserId)
            .order("extraction_date", { ascending: false })
            .limit(3);

          parts.push("");
          parts.push("Data Freshness:");
          const bureauFreshness: Record<string, { daysAgo: number; qualityScore: number | null }> = {};
          const bureauNames = ["Experian", "TransUnion", "Equifax"];
          for (const bn of bureauNames) {
            const upload = (recentUploads || []).find(u => (u.bureau_detected || "").toLowerCase().includes(bn.toLowerCase()));
            if (upload && upload.last_analyzed_at) {
              const daysAgo = Math.round((Date.now() - new Date(upload.last_analyzed_at).getTime()) / 86400000);
              bureauFreshness[bn] = { daysAgo, qualityScore: null };
              parts.push(`  ${bn}: Last analyzed ${daysAgo} days ago`);
              if (daysAgo > 30) parts.push(`    ⚠ Data is over 30 days old and may not reflect recent changes`);
            } else {
              parts.push(`  ${bn}: No analysis on file`);
            }
          }

          // Overall data completeness from quality logs
          if (qualityLogs && qualityLogs.length > 0) {
            const avgQuality = Math.round((qualityLogs as any[]).reduce((s: number, q: any) => s + (q.overall_quality_score || 0), 0) / qualityLogs.length);
            const avgFields = Math.round((qualityLogs as any[]).reduce((s: number, q: any) => s + (q.required_fields_percentage || 0), 0) / qualityLogs.length);
            parts.push(`  Overall data completeness: ${avgFields}% of account fields fully populated`);
            parts.push(`  Average extraction quality: ${avgQuality}/100`);
          }
        }

        // --- Funding applications ---
        const fundingFilter = clientId
          ? supabase.from("funding_application_outcomes").select("id, outcome, lender_name").eq("client_id", clientId)
          : resolvedUserId
            ? supabase.from("funding_application_outcomes").select("id, outcome, lender_name").eq("user_id", resolvedUserId)
            : null;

        if (fundingFilter) {
          const { data: apps } = await fundingFilter;
          if (apps && apps.length > 0) {
            const approved = apps.filter((a: any) => a.outcome === "approved").length;
            const declined = apps.filter((a: any) => a.outcome === "declined").length;
            parts.push(`Funding Applications: ${apps.length} total | ${approved} approved, ${declined} declined`);
          }
        }

        // --- Funding secured ---
        const securedId = resolvedUserId || (clientId ? null : null);
        if (securedId) {
          const { data: secured } = await supabase
            .from("funding_secured")
            .select("lender_name, amount, product_type")
            .eq("user_id", securedId);

          if (secured && secured.length > 0) {
            const totalSecured = secured.reduce((sum, s) => sum + (s.amount || 0), 0);
            parts.push(`Funding Secured: $${totalSecured.toLocaleString()} across ${secured.length} products`);
          }
        }

        // --- Memory ---
        const memFilter = clientId
          ? supabase.from("client_memory").select("memory_type, content, created_at").eq("client_id", clientId).eq("is_active", true).order("created_at", { ascending: false }).limit(5)
          : resolvedUserId
            ? supabase.from("client_memory").select("memory_type, content, created_at").eq("client_user_id", resolvedUserId).eq("is_active", true).order("created_at", { ascending: false }).limit(5)
            : null;

        if (memFilter) {
          const { data: memories } = await memFilter;
          if (memories && memories.length > 0) {
            const memLines = memories.slice(0, 3).map(m => {
              const date = new Date(m.created_at).toLocaleDateString();
              const typeLabel = m.memory_type.replace(/_/g, " ");
              const short = m.content.length > 100 ? m.content.substring(0, 100) + "..." : m.content;
              return `[${typeLabel}] (${date}): ${short}`;
            });
            parts.push(`Recent Memory: ${memLines.join(" | ")}`);
          }
        }

        if (!cancelled) {
          setContextBlock(parts.length > 1 ? parts.join("\n") : "");
          setIsLoading(false);
        }
      } catch (err) {
        console.error("Error fetching client chat context:", err);
        if (!cancelled) {
          setContextBlock("");
          setHasCreditData(false);
          setIsLoading(false);
        }
      }
    }

    fetchContext();
    return () => { cancelled = true; };
  }, [clientId, userId]);

  return { contextBlock, isLoading, hasCreditData };
}

async function resolveUserIdFromClient(clientId: string): Promise<string | null> {
  const { data } = await supabase
    .from("clients")
    .select("linked_user_id")
    .eq("id", clientId)
    .maybeSingle();
  return data?.linked_user_id || null;
}
