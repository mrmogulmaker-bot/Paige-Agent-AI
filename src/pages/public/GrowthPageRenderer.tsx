// Public landing page renderer — reads growth_pages.blocks_json by tenant slug + page slug.
// Anyone (including logged-out visitors) can view a published page thanks to the RLS
// `growth_pages_public_read_published` policy.
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { GrowthBlock, GrowthPageTheme } from "@/lib/growth";
import { GrowthFormEmbed } from "@/pages/public/GrowthFormRenderer";
import DOMPurify from "dompurify";

interface PageRow {
  id: string;
  title: string;
  status: string;
  blocks_json: GrowthBlock[];
  theme_json: GrowthPageTheme;
  seo_json: { description?: string; og_image?: string };
  og_image_url: string | null;
  tenant_id: string;
}

export default function GrowthPageRenderer() {
  const { tenantSlug, pageSlug } = useParams();
  const [page, setPage] = useState<PageRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!tenantSlug || !pageSlug) return;
    (async () => {
      const { data: tenant } = await supabase.from("tenants").select("id").eq("slug", tenantSlug).maybeSingle();
      if (!tenant) { setNotFound(true); setLoading(false); return; }
      const { data } = await supabase.from("growth_pages")
        .select("id,title,status,blocks_json,theme_json,seo_json,og_image_url,tenant_id")
        .eq("tenant_id", tenant.id)
        .eq("slug", pageSlug)
        .eq("status", "published")
        .maybeSingle();
      if (!data) setNotFound(true); else setPage(data as unknown as PageRow);
      setLoading(false);
    })();
  }, [tenantSlug, pageSlug]);

  useEffect(() => {
    if (page?.title) document.title = page.title;
  }, [page?.title]);

  if (loading) return <div className="min-h-dvh flex items-center justify-center text-muted-foreground">Loading…</div>;
  if (notFound || !page) return <div className="min-h-dvh flex items-center justify-center">Page not found.</div>;

  const theme = page.theme_json ?? {};
  const bg = theme.background ?? "#0b1220";
  const text = theme.text ?? "#f8f5ee";
  const accent = theme.accent ?? "#cfae70";

  return (
    <div style={{ background: bg, color: text, minHeight: "100dvh" }}>
      {(page.blocks_json ?? []).map((block, i) => (
        <BlockRenderer key={i} block={block} accent={accent} tenantId={page.tenant_id} />
      ))}
      <footer className="text-center text-xs opacity-50 py-8">© {new Date().getFullYear()}</footer>
    </div>
  );
}

function BlockRenderer({ block, accent, tenantId }: { block: GrowthBlock; accent: string; tenantId: string }) {
  switch (block.type) {
    case "hero":
      return (
        <section className="px-6 md:px-12 py-20 md:py-32 text-center max-w-5xl mx-auto">
          {block.eyebrow && (
            <div className="inline-block border rounded-full px-4 py-1.5 text-xs tracking-widest mb-6" style={{ borderColor: accent, color: accent }}>
              {block.eyebrow}
            </div>
          )}
          <h1 className="font-serif text-5xl md:text-7xl leading-tight mb-6" style={{ color: accent, fontFamily: "'Playfair Display', serif" }}>
            {block.title}
          </h1>
          {block.subtitle && <p className="text-lg md:text-xl opacity-80 max-w-2xl mx-auto mb-6">{block.subtitle}</p>}
          {block.quote && <p className="italic opacity-70 mb-8" style={{ fontFamily: "'Playfair Display', serif" }}>{block.quote}</p>}
          {block.cta_label && block.cta_href && (
            <a href={block.cta_href} className="inline-block px-8 py-3 font-semibold rounded" style={{ background: accent, color: "#0b1220" }}>
              {block.cta_label} →
            </a>
          )}
        </section>
      );
    case "phase_cards":
      return (
        <section className="px-6 md:px-12 py-16 max-w-6xl mx-auto grid gap-6 md:grid-cols-3">
          {block.cards.map((c, i) => (
            <div key={i} className="border rounded-lg p-6" style={{ borderColor: `${accent}30` }}>
              <div className="text-xs tracking-widest mb-2" style={{ color: accent }}>{c.phase}</div>
              <h3 className="font-semibold text-xl mb-3">{c.title}</h3>
              <p className="text-sm opacity-80 mb-4">{c.body}</p>
              {c.outcome && (
                <>
                  <div className="text-xs opacity-50 uppercase tracking-wider">Outcome</div>
                  <div className="text-sm" style={{ color: accent }}>{c.outcome}</div>
                </>
              )}
            </div>
          ))}
        </section>
      );
    case "feature_grid":
      return (
        <section className="px-6 md:px-12 py-16 max-w-6xl mx-auto">
          {block.title && <h2 className="text-3xl md:text-4xl text-center mb-10" style={{ fontFamily: "'Playfair Display', serif", color: accent }}>{block.title}</h2>}
          <div className="grid gap-6 md:grid-cols-2">
            {block.items.map((item, i) => (
              <div key={i} className="border rounded-lg p-6" style={{ borderColor: `${accent}30` }}>
                <h4 className="font-semibold mb-2" style={{ color: accent }}>{item.title}</h4>
                <p className="text-sm opacity-80">{item.body}</p>
              </div>
            ))}
          </div>
        </section>
      );
    case "cta":
      return (
        <section className="px-6 md:px-12 py-20 text-center max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-4xl mb-4" style={{ fontFamily: "'Playfair Display', serif", color: accent }}>{block.title}</h2>
          {block.body && <p className="opacity-80 mb-6">{block.body}</p>}
          <a href={block.cta_href} className="inline-block px-8 py-3 font-semibold rounded" style={{ background: accent, color: "#0b1220" }}>{block.cta_label}</a>
        </section>
      );
    case "rich_text": {
      const safeHtml = DOMPurify.sanitize(block.html ?? "", {
        FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form"],
        FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur", "onchange", "onsubmit"],
      });
      return <section className="px-6 md:px-12 py-12 max-w-3xl mx-auto prose prose-invert" dangerouslySetInnerHTML={{ __html: safeHtml }} />;
    }
    case "embedded_form":
      return (
        <section id="apply" className="px-6 md:px-12 py-16 max-w-3xl mx-auto">
          <GrowthFormEmbed tenantId={tenantId} formSlug={block.form_slug} accent={accent} />
        </section>
      );
    default:
      return null;
  }
}
