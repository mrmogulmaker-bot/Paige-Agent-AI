// Uniform adapter shape used by business-verifier.
export interface BusinessVerifyInput {
  legal_name: string;
  dba?: string | null;
  ein?: string | null;
  state?: string | null;
  city?: string | null;
  address_line_1?: string | null;
  postal_code?: string | null;
  phone?: string | null;
  website?: string | null;
  entity_type?: string | null;
}

export type VerifyStatus =
  | "match"
  | "mismatch"
  | "not_found"
  | "error"
  | "unavailable";

export interface VerifyResult {
  source: string;
  source_kind: "public" | "paid" | "government" | "browser";
  status: VerifyStatus;
  confidence?: number; // 0-100
  matched_fields?: string[];
  mismatched_fields?: string[];
  raw_payload?: Record<string, unknown>;
  normalized?: Record<string, unknown>;
  source_url?: string;
  error?: string;
}

export interface VerifyAdapter {
  source: string;
  enabled(): boolean;
  verify(input: BusinessVerifyInput): Promise<VerifyResult>;
}
