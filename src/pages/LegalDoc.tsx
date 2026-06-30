// src/pages/LegalDoc.tsx
// Public page at /legal/:slug — renders any current legal document by slug.

import { useParams, Link } from "react-router-dom";
import { useLegalDoc } from "@/lib/legal/useLegalDocuments";
import { LegalDocViewer } from "@/components/legal/LegalDocViewer";
import { ArrowLeft, Loader2 } from "lucide-react";

const LegalDoc = () => {
  const { slug = "" } = useParams<{ slug: string }>();
  const { doc, loading, error } = useLegalDoc(slug);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Home
        </Link>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading…
        </div>
      )}

      {!loading && !doc && (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-24 text-center">
          <h1 className="text-2xl font-bold mb-2">Document not found</h1>
          <p className="text-muted-foreground">
            {error ?? "We couldn't find that legal document."}
          </p>
        </div>
      )}

      {doc && <LegalDocViewer doc={doc} />}
    </div>
  );
};

export default LegalDoc;
