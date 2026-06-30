// src/lib/legal/useLegalDocuments.ts
// Hooks for fetching legal documents and recording acceptances.

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type LegalDoc = {
  id: string;
  slug: string;
  version: number;
  title: string;
  summary: string | null;
  body_md: string;
  audience: "all" | "tenant_owner" | "contextual";
  required_at_signup: boolean;
  effective_date: string;
  is_current: boolean;
};

export type OutstandingConsent = {
  slug: string;
  version: number;
  title: string;
  summary: string | null;
  effective_date: string;
};

/** Fetch a single current document by slug. */
export function useLegalDoc(slug: string) {
  const [doc, setDoc] = useState<LegalDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from("legal_documents")
      .select("*")
      .eq("slug", slug)
      .eq("is_current", true)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setError(error.message);
        setDoc((data as LegalDoc) ?? null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return { doc, loading, error };
}

/** Fetch the current versions of every required-at-signup doc (for the checkbox). */
export function useRequiredSignupDocs() {
  const [docs, setDocs] = useState<LegalDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("legal_documents")
      .select("*")
      .eq("is_current", true)
      .eq("required_at_signup", true)
      .order("slug")
      .then(({ data }) => {
        if (cancelled) return;
        setDocs((data as LegalDoc[]) ?? []);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return { docs, loading };
}

/** List outstanding required consents for the signed-in user. */
export function useOutstandingConsents(userId: string | undefined) {
  const [outstanding, setOutstanding] = useState<OutstandingConsent[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) {
      setOutstanding([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc("get_outstanding_consents", { _user_id: userId });
    if (!error && data) setOutstanding(data as OutstandingConsent[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { outstanding, loading, refresh };
}

/** Record acceptance rows for one or more (slug, version) pairs. */
export async function recordAcceptances(
  userId: string,
  items: { slug: string; version: number; context?: Record<string, unknown> }[]
) {
  if (!items.length) return { error: null };
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : null;
  const rows = items.map((it) => ({
    user_id: userId,
    document_slug: it.slug,
    document_version: it.version,
    user_agent: userAgent,
    context: it.context ?? {},
  }));
  const { error } = await supabase.from("legal_acceptances").insert(rows);
  return { error };
}
