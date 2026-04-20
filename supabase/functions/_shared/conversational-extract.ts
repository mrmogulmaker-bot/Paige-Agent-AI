// Server-side mirror of src/lib/conversationalExtractor.ts — runs on transcripts
// (e.g. ElevenLabs voice transcripts) inside Deno edge functions.
// Keep field keys aligned with paige-write-back's ALLOWED_FIELDS whitelist.
export interface ProfileSnapshot {
  full_name?: string | null;
  phone?: string | null;
  address?: string | null;
  primary_goal?: string | null;
  goal_amount?: number | null;
  business?: {
    legal_name?: string | null;
    dba?: string | null;
    ein?: string | null;
    formation_date?: string | null;
    state_of_formation?: string | null;
    business_street_address?: string | null;
    website?: string | null;
    business_email?: string | null;
    naics?: string | null;
    entity_type?: string | null;
  } | null;
}

export interface ExtractionField {
  key: string;
  label: string;
  value: string | number | boolean | null;
  displayValue?: string;
}

export interface ExtractionProposal {
  id: string;
  source: "document" | "conversation";
  intro?: string;
  fields: ExtractionField[];
}

const isEmpty = (v: unknown): boolean =>
  v === null || v === undefined || (typeof v === "string" && v.trim().length === 0);

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

function parseYear(raw: string): string | null {
  const m = raw.match(/(19|20)\d{2}/);
  if (!m) return null;
  const y = parseInt(m[0], 10);
  if (y < 1900 || y > new Date().getFullYear()) return null;
  return `${y}-01-01`;
}

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
const URL_RE = /\b((?:https?:\/\/)?(?:www\.)?[a-z0-9-]+\.[a-z]{2,}(?:\/[^\s]*)?)\b/i;

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim().replace(/[.,;]+$/, "");
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

const ENTITY_MAP: Record<string, string> = {
  "llc": "LLC", "limited liability company": "LLC",
  "corp": "Corporation", "corporation": "Corporation",
  "c-corp": "C-Corp", "c corp": "C-Corp",
  "s-corp": "S-Corp", "s corp": "S-Corp",
  "sole proprietor": "Sole Proprietor", "sole prop": "Sole Proprietor",
  "partnership": "Partnership",
  "nonprofit": "Nonprofit", "non-profit": "Nonprofit",
};

/** Run extraction over a single message string. */
export function extractFromMessage(message: string, snapshot: ProfileSnapshot): ExtractionProposal | null {
  if (!message || message.trim().length < 4) return null;
  const fields: ExtractionField[] = [];
  const biz = snapshot.business || {};

  if (isEmpty(biz.ein)) {
    const m = message.match(/\b(\d{2}-\d{7})\b/);
    if (m) fields.push({ key: "foundation.ein", label: "Business EIN", value: m[1], displayValue: m[1] });
  }

  if (isEmpty(biz.legal_name) || isEmpty(biz.dba)) {
    const nameMatch = message.match(
      /(?:my\s+company\s+is\s+called|our\s+business\s+is\s+called|our\s+business\s+is|the\s+business\s+is\s+called|we\s+go\s+by|company\s+name\s+is)\s+["']?([A-Z][A-Za-z0-9&'.,\-\s]{1,60}?)["']?(?:[.,!?]|\s+(?:and|but|so|with|in|for|located)|$)/i
    );
    if (nameMatch) {
      const name = nameMatch[1].trim().replace(/\s+/g, " ");
      if (name.length >= 2) {
        if (isEmpty(biz.legal_name)) fields.push({ key: "foundation.legal_name", label: "Business Legal Name", value: name, displayValue: name });
        else if (isEmpty(biz.dba)) fields.push({ key: "foundation.dba", label: "Business DBA", value: name, displayValue: name });
      }
    }
  }

  if (isEmpty(biz.formation_date)) {
    const m = message.match(/(?:founded|started|incorporated|operating|in\s+business)\s+(?:in\s+|since\s+)?((?:19|20)\d{2})/i);
    if (m) {
      const date = parseYear(m[1]);
      if (date) fields.push({ key: "foundation.formation_date", label: "Formation Date", value: date, displayValue: m[1] });
    }
  }

  if (isEmpty(biz.state_of_formation)) {
    const m = message.match(/(?:incorporated|registered|formed)\s+in\s+([A-Za-z][A-Za-z\s]{1,30}?)(?:[.,!?]|\s+(?:and|but|so|with|as|in|for)|$)/i);
    if (m) {
      const state = normalizeState(m[1]);
      if (state) fields.push({ key: "foundation.state_of_formation", label: "State of Formation", value: state, displayValue: state });
    }
  }

  if (isEmpty(biz.business_street_address)) {
    const m = message.match(/(?:our\s+(?:business\s+)?address\s+is|(?:we\s+are\s+)?located\s+at|business\s+is\s+located\s+at)\s+(\d+\s+[A-Za-z0-9.,'\-\s]{4,80}?)(?:[.!?]|\s+(?:and|but|so|with)|$)/i);
    if (m) {
      const addr = m[1].trim().replace(/\s+/g, " ");
      if (addr.length >= 6) fields.push({ key: "foundation.street_address", label: "Business Street Address", value: addr, displayValue: addr });
    }
  }

  if (isEmpty(biz.website)) {
    const m = message.match(/(?:our\s+(?:business\s+)?website\s+is|find\s+us\s+at|website\s+is|site\s+is)\s+(\S+)/i);
    if (m) {
      const u = m[1].match(URL_RE);
      if (u) {
        const url = normalizeUrl(u[1]);
        fields.push({ key: "public_presence.website_url", label: "Business Website", value: url, displayValue: url });
      }
    }
  }

  if (isEmpty(biz.business_email)) {
    const m = message.match(/(?:my\s+business\s+email\s+is|business\s+email\s+is|reach\s+us\s+at|contact\s+us\s+at|email\s+us\s+at)\s+(\S+)/i);
    if (m) {
      const e = m[1].match(EMAIL_RE);
      if (e) fields.push({ key: "foundation.business_email", label: "Business Email", value: e[0], displayValue: e[0] });
    }
  }

  if (isEmpty(biz.naics)) {
    const m = message.match(/\b(?:NAICS|industry)\s+code\s+(\d{2,6})\b/i);
    if (m) fields.push({ key: "foundation.naics", label: "NAICS Code", value: m[1], displayValue: m[1] });
  }

  if (isEmpty(biz.entity_type)) {
    const m = message.match(/(?:we(?:'re|\s+are)\s+(?:an?\s+)?|entity\s+type\s+is\s+(?:an?\s+)?|set\s+up\s+as\s+(?:an?\s+)?|registered\s+as\s+(?:an?\s+)?)(LLC|limited\s+liability\s+company|c[\s-]?corp(?:oration)?|s[\s-]?corp(?:oration)?|corporation|sole\s+prop(?:rietor)?|partnership|non-?profit)\b/i);
    if (m) {
      const key = m[1].toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ");
      const mapped = ENTITY_MAP[key];
      if (mapped) fields.push({ key: "foundation.entity_type", label: "Entity Type", value: mapped, displayValue: mapped });
    }
  }

  if (isEmpty(snapshot.full_name)) {
    const m = message.match(/\b(?:my\s+name\s+is|i\s+am|i'?m)\s+([A-Z][a-z]{1,20}(?:\s+[A-Z][a-z'-]{1,30}){0,3})\b/);
    if (m) {
      const name = m[1].trim();
      if (!/^(looking|here|trying|wondering|hoping|just|really|not|so|very)$/i.test(name)) {
        fields.push({ key: "profile.full_name", label: "Your Name", value: name, displayValue: name });
      }
    }
  }

  if (isEmpty(snapshot.phone)) {
    const m = message.match(/(?:my\s+(?:phone|number|cell|mobile)\s+(?:is|number\s+is)?|reach\s+me\s+at|call\s+me\s+at|text\s+me\s+at)\s+(\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/i);
    if (m) fields.push({ key: "profile.phone", label: "Your Phone", value: m[1].trim(), displayValue: m[1].trim() });
  }

  if (isEmpty(snapshot.address)) {
    const m = message.match(/(?:my\s+(?:home\s+)?address\s+is|i\s+live\s+at|residence\s+is)\s+(\d+\s+[A-Za-z0-9.,'\-\s]{4,80}?)(?:[.!?]|\s+(?:and|but|so|with)|$)/i);
    if (m) {
      const addr = m[1].trim().replace(/\s+/g, " ");
      if (addr.length >= 6) fields.push({ key: "profile.address", label: "Your Address", value: addr, displayValue: addr });
    }
  }

  if (isEmpty(snapshot.goal_amount)) {
    const m = message.match(/(?:looking\s+for|need(?:ing)?\s+(?:about|around|approximately)?|trying\s+to\s+raise|want\s+to\s+raise|seeking|need\s+to\s+borrow|hoping\s+for)\s+(\$?\s?[\d,]+(?:\.\d+)?\s?(?:k|m|million|thousand)?)/i);
    if (m) {
      const amt = parseMoney(m[1]);
      if (amt && amt >= 1000 && amt <= 100_000_000) {
        fields.push({ key: "intake.goal_amount", label: "Funding Goal Amount", value: amt, displayValue: `$${amt.toLocaleString()}` });
      }
    }
  }

  if (isEmpty(snapshot.primary_goal)) {
    const m = message.match(/(?:(?:want|going|need|plan(?:ning)?|hoping)\s+to\s+use\s+(?:it|the\s+(?:money|funds|capital|loan))\s+for|for\s+([a-z][a-z\s]{3,40})\s+(?:financing|funding|capital|purposes)|to\s+fund\s+([a-z][a-z\s]{3,40}))(?:[.,!?]|$)/i);
    if (m) {
      const purpose = (m[1] || m[2] || "").trim();
      if (purpose.length >= 4 && purpose.length <= 80) {
        fields.push({ key: "intake.primary_goal", label: "Funding Purpose", value: purpose, displayValue: purpose });
      }
    }
  }

  if (fields.length === 0) return null;
  const seen = new Map<string, ExtractionField>();
  for (const f of fields) seen.set(f.key, f);
  const unique = Array.from(seen.values());

  return {
    id: `voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source: "conversation",
    intro: unique.length === 1
      ? "I caught something from our call I can save for you."
      : "From our call, I picked up a few things I can save to your profile:",
    fields: unique,
  };
}

/** Run extraction over a full transcript by concatenating user-side utterances. */
export function extractFromTranscript(messages: { role: string; content: string }[], snapshot: ProfileSnapshot): ExtractionProposal | null {
  if (!messages || messages.length === 0) return null;
  const userText = messages.filter((m) => m.role === "user").map((m) => m.content).join("\n");
  return extractFromMessage(userText, snapshot);
}
