import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { countUniqueNegativeAccounts } from "@/lib/deduplicateNegatives";

export interface ClientChatContext {
  contextBlock: string;
  isLoading: boolean;
}

/**
 * Assembles a structured client brief from real database data
 * for injection into Paige AI chat sessions.
 */
export function useClientChatContext(clientId?: string | null, userId?: string | null): ClientChatContext {
  const [contextBlock, setContextBlock] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!clientId && !userId) {
      setContextBlock("");
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
        parts.push(`Bureau Scores: TransUnion ${scores.transunion ?? "N/A"} | Experian ${scores.experian ?? "N/A"} | Equifax ${scores.equifax ?? "N/A"} | Middle Score ${middleScore ?? "N/A"}`);

        // --- Credit factors ---
        const factorFilter = clientId
          ? supabase.from("credit_factor_scores").select("aggregate_utilization, overall_fundability_score, revolving_count, installment_count, mortgage_count").eq("client_id", clientId).order("calculated_at", { ascending: false }).limit(1)
          : resolvedUserId
            ? supabase.from("credit_factor_scores").select("aggregate_utilization, overall_fundability_score, revolving_count, installment_count, mortgage_count").eq("user_id", resolvedUserId).order("calculated_at", { ascending: false }).limit(1)
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

        // --- Active negatives ---
        const negFilter = clientId
          ? supabase.from("credit_negative_items").select("creditor_name, amount, bureau, item_type, status").eq("client_id", clientId).neq("status", "removed")
          : resolvedUserId
            ? supabase.from("credit_negative_items").select("creditor_name, amount, bureau, item_type, status").eq("user_id", resolvedUserId).neq("status", "removed")
            : null;

        if (negFilter) {
          const { data: negatives } = await negFilter;
          if (negatives && negatives.length > 0) {
            const uniqueCount = countUniqueNegativeAccounts(negatives);
            const totalBureauRecords = negatives.length;
            parts.push(`Active Negatives: ${uniqueCount} unique accounts across ${totalBureauRecords} bureau records`);
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

        // --- Business Foundation Status ---
        if (resolvedUserId) {
          const { data: businesses } = await supabase
            .from("businesses")
            .select("legal_name, entity_type, state_of_formation, formation_date, ein, business_address_type, business_street_address, business_city, business_state, business_zip, business_phone, phone_411_listed, has_bank_account, bank_name, bank_account_opened_date")
            .eq("owner_user_id", resolvedUserId)
            .limit(3);

          if (businesses && businesses.length > 0) {
            const biz = businesses[0];

            // Entity status
            const entityVerified = biz.entity_type && biz.state_of_formation;
            const entityPending = !entityVerified && (biz.entity_type || biz.state_of_formation);
            const entityStatus = entityVerified ? "Verified" : entityPending ? "Pending" : "Missing";
            const entityLine = entityVerified
              ? `Entity: ${biz.entity_type} formed in ${biz.state_of_formation}${biz.formation_date ? ` on ${biz.formation_date}` : ""} | Status: ${entityStatus}`
              : `Entity: Not yet formed | Status: ${entityStatus}`;

            // EIN
            const einLine = `EIN: ${biz.ein ? "On file" : "Not on file"}`;

            // Address
            const addrFilled = biz.business_street_address && biz.business_city && biz.business_state && biz.business_zip;
            const isHome = biz.business_address_type === "Home Address";
            const addrStatus = isHome ? "Pending — Home Address (privacy risk)" : addrFilled && biz.business_address_type ? "Verified" : biz.business_street_address ? "Pending" : "Missing";
            const addrDetail = addrFilled ? `${biz.business_street_address}, ${biz.business_city}, ${biz.business_state} ${biz.business_zip}` : "Not entered";
            const addrLine = `Business Address: ${biz.business_address_type || "Not set"} — ${addrDetail} | Status: ${addrStatus}`;

            // Phone
            const phoneStatus = biz.business_phone && biz.phone_411_listed ? "Verified" : biz.business_phone ? "Pending" : "Missing";
            const phoneLine = `Business Phone: ${biz.business_phone || "Not on file"} | 411 Listed: ${biz.phone_411_listed ? "Yes" : "No"} | Status: ${phoneStatus}`;

            // Bank
            const bankStatus = biz.has_bank_account && biz.bank_name && biz.bank_account_opened_date ? "Verified" : biz.has_bank_account || biz.bank_name ? "Pending" : "Missing";
            const bankLine = `Business Bank Account: ${biz.bank_name || "Not on file"}${biz.bank_account_opened_date ? ` opened ${biz.bank_account_opened_date}` : ""} | Commingling-free: ${biz.has_bank_account ? "Yes" : "No"} | Status: ${bankStatus}`;

            // Completion
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
          } else {
            parts.push("Business Profile: No business entity on file");
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
          setIsLoading(false);
        }
      }
    }

    fetchContext();
    return () => { cancelled = true; };
  }, [clientId, userId]);

  return { contextBlock, isLoading };
}

async function resolveUserIdFromClient(clientId: string): Promise<string | null> {
  const { data } = await supabase
    .from("clients")
    .select("linked_user_id")
    .eq("id", clientId)
    .maybeSingle();
  return data?.linked_user_id || null;
}
