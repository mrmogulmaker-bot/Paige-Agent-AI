// src/lib/legal/useContextualConsent.ts
// Hook that checks whether the signed-in user has accepted the CURRENT version
// of a given legal document. Use this to gate sensitive actions (credit upload,
// broker signup, tenant creation, workforce invite acceptance, etc.).

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { recordAcceptances, type LegalDoc } from "./useLegalDocuments";

export function useContextualConsent(userId: string | undefined, slug: string) {
  const [doc, setDoc] = useState<LegalDoc | null>(null);
  const [accepted, setAccepted] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: docRow } = await supabase
      .from("legal_documents")
      .select("*")
      .eq("slug", slug)
      .eq("is_current", true)
      .maybeSingle();
    setDoc((docRow as LegalDoc) ?? null);

    if (docRow) {
      const { data: acc } = await supabase
        .from("legal_acceptances")
        .select("id")
        .eq("user_id", userId)
        .eq("document_slug", slug)
        .eq("document_version", (docRow as LegalDoc).version)
        .limit(1)
        .maybeSingle();
      setAccepted(!!acc);
    } else {
      setAccepted(true); // no doc seeded -> don't block
    }
    setLoading(false);
  }, [userId, slug]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const accept = useCallback(
    async (context: Record<string, unknown> = {}) => {
      if (!userId || !doc) return { error: new Error("Missing user or document") };
      const { error } = await recordAcceptances(userId, [
        { slug: doc.slug, version: doc.version, context: { ...context, source: "contextual" } },
      ]);
      if (!error) setAccepted(true);
      return { error };
    },
    [userId, doc]
  );

  return { doc, accepted, needsConsent: accepted === false, loading, refresh, accept };
}
