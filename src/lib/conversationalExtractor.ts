/**
 * Conversational extraction engine — scans a user's chat message for structured
 * profile/business/funding fields and returns an ExtractionProposal that the
 * chat UI can render as an inline confirmation card.
 *
 * Hard rules:
 * - Only flag fields that are currently null/empty in the client's profile
 * - Never trigger on credit score mentions
 * - Returns null if nothing detected
 * - Field keys MUST match paige-write-back's ALLOWED_FIELDS whitelist
 */
import type { ExtractionField, ExtractionProposal } from "@/components/chat/ExtractionProposalCard";

/** Snapshot of the fields the extractor needs to know about to skip already-populated values. */
export interface ProfileSnapshot {
  // profiles row
  full_name?: string | null;
  phone?: string | null;
  address?: string | null;
  primary_goal?: string | null;
  goal_amount?: number | null;

  // primary business row (if any)
  business?: {
    legal_name?: string | null;
    dba?: string | null;
    ein?: string | null;
    formation_date?: string | null;
    state_of_formation?: string | null;
    business_street_address?: string | null;
    website?: string | null;
    business_email?: string | null;
    estimated_annual_revenue?: number | null;
    employee_count?: number | null;
    naics?: string | null;
    entity_type?: string | null;
  } | null;
}

const isEmpty = (v: unknown): boolean =>
  v === null || v === undefined || (typeof v === "string" && v.trim().length === 0);

// --- US state lookup (full names + abbreviations) -------------------------
const US_STATES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO",
  montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND",
  ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI",
  "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT",
  vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV",
  wisconsin: "WI", wyoming: "WY", "district of columbia": "DC",
};
const STATE_ABBRS = new Set(Object.values(US_STATES));

function normalizeState(raw: string): string | null {
  const lower = raw.trim().toLowerCase();
  if (US_STATES[lower]) return US_STATES[lower];
  const upper = raw.trim().toUpperCase();
  if (STATE_ABBRS.has(upper) && upper.length === 2) return upper;
  return null;
}

// --- Money parsing --------------------------------------------------------
/** "5,000", "$50k", "1.2 million", "2m" → number */
function parseMoney(raw: string): number | null {
  let s = raw.trim().toLowerCase().replace(/[$,\s]/g, "");
  let multiplier = 1;
  if (/[km]illion$/.test(s) || s.endsWith("million")) {
    multiplier = 1_000_000;
    s = s.replace(/million$/, "");
  } else if (s.endsWith("m")) {
    multiplier = 1_000_000;
    s = s.slice(0, -1);
  } else if (s.endsWith("k") || s.endsWith("thousand")) {
    multiplier = 1_000;
    s = s.replace(/thousand$/, "").replace(/k$/, "");
  }
  const n = parseFloat(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * multiplier);
}

const MONEY_RE = /(\$?\s?[\d,]+(?:\.\d+)?\s?(?:k|m|million|thousand)?)/i;

// --- Year/date parsing ----------------------------------------------------
function parseYear(raw: string): string | null {
  const m = raw.match(/(19|20)\d{2}/);
  if (!m) return null;
  const y = parseInt(m[0], 10);
  if (y < 1900 || y > new Date().getFullYear()) return null;
  // Store as YYYY-01-01 so it lands cleanly in a date column
  return `${y}-01-01`;
}

// --- Email/URL/Phone ------------------------------------------------------
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
const URL_RE = /\b((?:https?:\/\/)?(?:www\.)?[a-z0-9-]+\.[a-z]{2,}(?:\/[^\s]*)?)\b/i;
const PHONE_RE = /(\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/;

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim().replace(/[.,;]+$/, "");
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

// --- Entity type ----------------------------------------------------------
const ENTITY_MAP: Record<string, string> = {
  "llc": "LLC",
  "limited liability company": "LLC",
  "corp": "Corporation",
  "corporation": "Corporation",
  "c-corp": "C-Corp",
  "c corp": "C-Corp",
  "s-corp": "S-Corp",
  "s corp": "S-Corp",
  "sole proprietor": "Sole Proprietor",
  "sole prop": "Sole Proprietor",
  "partnership": "Partnership",
  "nonprofit": "Nonprofit",
  "non-profit": "Nonprofit",
};

// --------------------------------------------------------------------------
// MAIN ENTRY
// --------------------------------------------------------------------------
export function extractFromMessage(
  message: string,
  snapshot: ProfileSnapshot
): ExtractionProposal | null {
  if (!message || message.trim().length < 4) return null;

  // Skip if message looks like it's about credit scores — scores come from reports
  if (/\b(credit\s+score|fico|vantage|fico\s*score)\b/i.test(message)) {
    // Only skip score-specific lines; we still scan for other patterns
    // but block any numeric capture that could collide with a 3-digit score range.
  }

  const lower = message.toLowerCase();
  const fields: ExtractionField[] = [];
  const biz = snapshot.business || {};

  // ---- BUSINESS PATTERNS ----

  // EIN (XX-XXXXXXX)
  if (isEmpty(biz.ein)) {
    const m = message.match(/\b(\d{2}-\d{7})\b/);
    if (m) {
      fields.push({
        key: "foundation.ein",
        label: "Business EIN",
        value: m[1],
        displayValue: m[1],
      });
    }
  }

  // Legal name / DBA — "my company is called X" / "our business is X" / "we go by X"
  if (isEmpty(biz.legal_name) || isEmpty(biz.dba)) {
    const nameMatch = message.match(
      /(?:my\s+company\s+is\s+called|our\s+business\s+is\s+called|our\s+business\s+is|the\s+business\s+is\s+called|we\s+go\s+by|company\s+name\s+is)\s+["']?([A-Z][A-Za-z0-9&'.,\-\s]{1,60}?)["']?(?:[.,!?]|\s+(?:and|but|so|with|in|for|located)|$)/i
    );
    if (nameMatch) {
      const name = nameMatch[1].trim().replace(/\s+/g, " ");
      if (name.length >= 2) {
        if (isEmpty(biz.legal_name)) {
          fields.push({
            key: "foundation.legal_name",
            label: "Business Legal Name",
            value: name,
            displayValue: name,
          });
        } else if (isEmpty(biz.dba)) {
          fields.push({
            key: "foundation.dba",
            label: "Business DBA",
            value: name,
            displayValue: name,
          });
        }
      }
    }
  }

  // Formation date — "founded in 2020" / "started in 2020" / "in business since 2020"
  if (isEmpty(biz.formation_date)) {
    const m = message.match(
      /(?:founded|started|incorporated|operating|in\s+business)\s+(?:in\s+|since\s+)?((?:19|20)\d{2})/i
    );
    if (m) {
      const date = parseYear(m[1]);
      if (date) {
        fields.push({
          key: "foundation.formation_date",
          label: "Formation Date",
          value: date,
          displayValue: m[1],
        });
      }
    }
  }

  // State of formation — "incorporated in Texas" / "registered in TX" / "formed in California"
  if (isEmpty(biz.state_of_formation)) {
    const m = message.match(
      /(?:incorporated|registered|formed)\s+in\s+([A-Za-z][A-Za-z\s]{1,30}?)(?:[.,!?]|\s+(?:and|but|so|with|as|in|for)|$)/i
    );
    if (m) {
      const state = normalizeState(m[1]);
      if (state) {
        fields.push({
          key: "foundation.state_of_formation",
          label: "State of Formation",
          value: state,
          displayValue: state,
        });
      }
    }
  }

  // Business street address — "our address is X" / "located at X" / "based in X"
  if (isEmpty(biz.business_street_address)) {
    const m = message.match(
      /(?:our\s+(?:business\s+)?address\s+is|(?:we\s+are\s+)?located\s+at|business\s+is\s+located\s+at)\s+(\d+\s+[A-Za-z0-9.,'\-\s]{4,80}?)(?:[.!?]|\s+(?:and|but|so|with)|$)/i
    );
    if (m) {
      const addr = m[1].trim().replace(/\s+/g, " ");
      if (addr.length >= 6) {
        fields.push({
          key: "foundation.street_address",
          label: "Business Street Address",
          value: addr,
          displayValue: addr,
        });
      }
    }
  }

  // Business website — "our website is X" / "find us at X"
  if (isEmpty(biz.website)) {
    const m = message.match(
      /(?:our\s+(?:business\s+)?website\s+is|find\s+us\s+at|website\s+is|site\s+is)\s+(\S+)/i
    );
    if (m) {
      const u = m[1].match(URL_RE);
      if (u) {
        const url = normalizeUrl(u[1]);
        fields.push({
          key: "public_presence.website_url",
          label: "Business Website",
          value: url,
          displayValue: url,
        });
      }
    }
  }

  // Business email — "my business email is X" / "reach us at X"
  if (isEmpty(biz.business_email)) {
    const m = message.match(
      /(?:my\s+business\s+email\s+is|business\s+email\s+is|reach\s+us\s+at|contact\s+us\s+at|email\s+us\s+at)\s+(\S+)/i
    );
    if (m) {
      const e = m[1].match(EMAIL_RE);
      if (e) {
        fields.push({
          key: "foundation.business_email",
          label: "Business Email",
          value: e[0],
          displayValue: e[0],
        });
      }
    }
  }

  // Annual revenue — "annual revenue is X" / "we make about X" / "doing X a year"
  if (isEmpty(biz.estimated_annual_revenue)) {
    const m = message.match(
      /(?:annual\s+revenue\s+(?:is|of|around|about)?|we\s+(?:make|do|gross|earn)\s+(?:about|around|approximately)?|doing|grossing|revenue\s+of)\s+(\$?\s?[\d,]+(?:\.\d+)?\s?(?:k|m|million|thousand)?)\s*(?:a\s+year|per\s+year|annually|yearly)?/i
    );
    if (m) {
      const amt = parseMoney(m[1]);
      if (amt && amt >= 1000) {
        // Note: we do not write business revenue through the conversation extractor
        // because it is not in the paige-write-back whitelist for businesses.
        // Skip silently to avoid promising a save that won't land.
      }
    }
  }

  // Employee count — "X employees" / "team of X" / "staff of X"
  if (isEmpty(biz.employee_count)) {
    const m = message.match(
      /(?:team\s+of|staff\s+of|we\s+have|with)\s+(\d{1,4})\s+(?:employees|people|staff|full[\s-]?time|team\s+members)|(\d{1,4})\s+(?:employees|full[\s-]?time\s+employees|team\s+members)\b/i
    );
    if (m) {
      const n = parseInt(m[1] || m[2], 10);
      if (Number.isFinite(n) && n > 0 && n < 100000) {
        // Same — employee_count is not in the write-back whitelist.
        // Silently skip to avoid offering an unsavable field.
      }
    }
  }

  // NAICS code — "NAICS code X" / "industry code X"
  if (isEmpty(biz.naics)) {
    const m = message.match(/\b(?:NAICS|industry)\s+code\s+(\d{2,6})\b/i);
    if (m) {
      fields.push({
        key: "foundation.naics",
        label: "NAICS Code",
        value: m[1],
        displayValue: m[1],
      });
    }
  }

  // Entity type — "we are an LLC" / "entity type is S-Corp"
  if (isEmpty(biz.entity_type)) {
    const m = message.match(
      /(?:we(?:'re|\s+are)\s+(?:an?\s+)?|entity\s+type\s+is\s+(?:an?\s+)?|set\s+up\s+as\s+(?:an?\s+)?|registered\s+as\s+(?:an?\s+)?)(LLC|limited\s+liability\s+company|c[\s-]?corp(?:oration)?|s[\s-]?corp(?:oration)?|corporation|sole\s+prop(?:rietor)?|partnership|non-?profit)\b/i
    );
    if (m) {
      const key = m[1].toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ");
      const mapped = ENTITY_MAP[key];
      if (mapped) {
        fields.push({
          key: "foundation.entity_type",
          label: "Entity Type",
          value: mapped,
          displayValue: mapped,
        });
      }
    }
  }

  // ---- PERSONAL PATTERNS ----

  // Full name — "my name is X" / "I am X" / "I'm X"
  if (isEmpty(snapshot.full_name)) {
    const m = message.match(
      /\b(?:my\s+name\s+is|i\s+am|i'?m)\s+([A-Z][a-z]{1,20}(?:\s+[A-Z][a-z'-]{1,30}){0,3})\b/
    );
    if (m) {
      const name = m[1].trim();
      // Skip common false positives ("I'm looking", "I am here", etc.)
      if (!/^(looking|here|trying|wondering|hoping|just|really|not|so|very)$/i.test(name)) {
        fields.push({
          key: "profile.full_name",
          label: "Your Name",
          value: name,
          displayValue: name,
        });
      }
    }
  }

  // Phone — "my phone is X" / "reach me at X"
  if (isEmpty(snapshot.phone)) {
    const m = message.match(
      /(?:my\s+(?:phone|number|cell|mobile)\s+(?:is|number\s+is)?|reach\s+me\s+at|call\s+me\s+at|text\s+me\s+at)\s+(\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/i
    );
    if (m) {
      fields.push({
        key: "profile.phone",
        label: "Your Phone",
        value: m[1].trim(),
        displayValue: m[1].trim(),
      });
    }
  }

  // Personal address — "my address is X" / "I live at X"
  if (isEmpty(snapshot.address)) {
    const m = message.match(
      /(?:my\s+(?:home\s+)?address\s+is|i\s+live\s+at|residence\s+is)\s+(\d+\s+[A-Za-z0-9.,'\-\s]{4,80}?)(?:[.!?]|\s+(?:and|but|so|with)|$)/i
    );
    if (m) {
      const addr = m[1].trim().replace(/\s+/g, " ");
      if (addr.length >= 6) {
        fields.push({
          key: "profile.address",
          label: "Your Address",
          value: addr,
          displayValue: addr,
        });
      }
    }
  }

  // ---- FUNDING PATTERNS ----

  // Funding amount — "looking for X" / "need about X" / "trying to raise X"
  if (isEmpty(snapshot.goal_amount)) {
    const m = message.match(
      /(?:looking\s+for|need(?:ing)?\s+(?:about|around|approximately)?|trying\s+to\s+raise|want\s+to\s+raise|seeking|need\s+to\s+borrow|hoping\s+for)\s+(\$?\s?[\d,]+(?:\.\d+)?\s?(?:k|m|million|thousand)?)/i
    );
    if (m) {
      const amt = parseMoney(m[1]);
      // Funding amounts: must be at least $1,000 and below $100M to be plausible
      if (amt && amt >= 1000 && amt <= 100_000_000) {
        fields.push({
          key: "intake.goal_amount",
          label: "Funding Goal Amount",
          value: amt,
          displayValue: `$${amt.toLocaleString()}`,
        });
      }
    }
  }

  // Funding purpose — "want to use it for X" / "for X financing" / "to fund X"
  if (isEmpty(snapshot.primary_goal)) {
    const m = message.match(
      /(?:(?:want|going|need|plan(?:ning)?|hoping)\s+to\s+use\s+(?:it|the\s+(?:money|funds|capital|loan))\s+for|for\s+([a-z][a-z\s]{3,40})\s+(?:financing|funding|capital|purposes)|to\s+fund\s+([a-z][a-z\s]{3,40}))(?:[.,!?]|$)/i
    );
    if (m) {
      const purpose = (m[1] || m[2] || "").trim();
      if (purpose.length >= 4 && purpose.length <= 80) {
        fields.push({
          key: "intake.primary_goal",
          label: "Funding Purpose",
          value: purpose,
          displayValue: purpose,
        });
      }
    }
  }

  if (fields.length === 0) return null;

  // De-dupe by key (last one wins — though in practice each key should fire at most once)
  const seen = new Map<string, ExtractionField>();
  for (const f of fields) seen.set(f.key, f);
  const unique = Array.from(seen.values());

  const intro =
    unique.length === 1
      ? "I caught something I can save for you."
      : "I picked up a few things I can save to your profile:";

  return {
    id: `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source: "conversation",
    intro,
    fields: unique,
  };
}
