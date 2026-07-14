// The ONE block renderer. This exact tree draws the public landing page at
// /p/<tenant>/<slug> AND the Studio live preview — preview == published, no fork. Every
// one of the 17 GrowthBlock types renders here, token-driven (only `--gp-*` vars, zero
// hardcoded hex), responsive, motion-safe, AA-contrast, on a generous spacing rhythm.
//
// Theming: <GrowthBlocks> wraps the list in a scope div that applies resolveGrowthTheme()
// as inline CSS variables, so the same component themes identically in both surfaces.
import { useEffect, useMemo, useState } from "react";
import DOMPurify from "dompurify";
import type { GrowthBlock, GrowthPageTheme } from "@/lib/growth";
import { resolveGrowthTheme, type GrowthThemeVars } from "@/components/growth/growth-theme";
import { GP_FADE_RISE, GP_PRESS, fadeRiseStyle } from "@/components/growth/growth-motion";
import { GrowthFormEmbed } from "@/pages/public/GrowthFormRenderer";

// ── shared layout tokens ─────────────────────────────────────────────────────
const SECTION = "px-6 md:px-10 py-16 md:py-24";
const WRAP = "mx-auto w-full max-w-6xl";
const WRAP_NARROW = "mx-auto w-full max-w-3xl";

// Hairline border / raised surface, both derived from theme tokens (no opacity guesswork).
const hairline = "1px solid color-mix(in srgb, var(--gp-text) 14%, transparent)";
const cardStyle: React.CSSProperties = {
  background: "color-mix(in srgb, var(--gp-text) 4%, transparent)",
  border: hairline,
  borderRadius: "1rem",
};

// ── small building blocks ────────────────────────────────────────────────────
function Eyebrow({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <span
      className="inline-block rounded-full px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.18em]"
      style={{
        color: "var(--gp-accent-ink)",
        border: "1px solid color-mix(in srgb, var(--gp-accent-ink) 40%, transparent)",
        background: "color-mix(in srgb, var(--gp-accent-ink) 8%, transparent)",
      }}
    >
      {children}
    </span>
  );
}

function Heading({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  // §11: headings read in --gp-text, never accent. Accent is reserved for eyebrows + CTAs.
  return (
    <h2 className={`font-display font-semibold tracking-tight ${className}`} style={{ color: "var(--gp-text)" }}>
      {children}
    </h2>
  );
}

function Lede({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  if (!children) return null;
  return <p className={`text-lg leading-relaxed ${className}`} style={{ color: "var(--gp-muted)" }}>{children}</p>;
}

function CtaButton({ label, href, size = "md" }: { label?: string; href?: string; size?: "md" | "lg" }) {
  if (!label || !href) return null;
  const pad = size === "lg" ? "px-8 py-3.5 text-base" : "px-6 py-3 text-sm";
  return (
    <a
      href={href}
      className={`${GP_PRESS} inline-flex items-center gap-2 rounded-full font-semibold shadow-lg transition-[filter,box-shadow] hover:brightness-95 ${pad}`}
      style={{ background: "var(--gp-accent)", color: "var(--gp-accent-foreground)" }}
    >
      {label}
      <span aria-hidden>→</span>
    </a>
  );
}

function SectionHead({ eyebrow, title, subtitle, center = true }: { eyebrow?: string; title?: string; subtitle?: string; center?: boolean }) {
  if (!title && !subtitle && !eyebrow) return null;
  return (
    <div className={`${center ? "text-center mx-auto max-w-2xl" : "max-w-2xl"} mb-12 space-y-4`}>
      {eyebrow && <div>{center ? <Eyebrow>{eyebrow}</Eyebrow> : <Eyebrow>{eyebrow}</Eyebrow>}</div>}
      {title && <Heading className="text-3xl md:text-4xl">{title}</Heading>}
      {subtitle && <Lede>{subtitle}</Lede>}
    </div>
  );
}

// A framed, motion-safe media/image frame with a token hairline.
function Frame({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-2xl ${className}`} style={{ border: hairline, background: "var(--gp-surface)" }}>
      {children}
    </div>
  );
}

// ── media embed helpers (client-side render into a SANDBOXED iframe) ──────────
function youTubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : null;
}
function vimeoId(url: string): string | null {
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return m ? m[1] : null;
}
function loomId(url: string): string | null {
  const m = url.match(/loom\.com\/(?:share|embed)\/([A-Za-z0-9]+)/);
  return m ? m[1] : null;
}

function embedUrl(provider: string, url: string): string | null {
  switch (provider) {
    case "youtube": {
      const id = youTubeId(url);
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    case "vimeo": {
      const id = vimeoId(url);
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
    case "loom": {
      const id = loomId(url);
      return id ? `https://www.loom.com/embed/${id}` : null;
    }
    default:
      return null;
  }
}

// ── individual block bodies ──────────────────────────────────────────────────
function HeroBlock({ block }: { block: Extract<GrowthBlock, { type: "hero" }> }) {
  const hasImage = !!block.image_url;
  const split = block.image_position === "split" && hasImage;

  const copy = (
    <div className={`space-y-6 ${split ? "" : "mx-auto max-w-3xl text-center"}`}>
      {block.eyebrow && <Eyebrow>{block.eyebrow}</Eyebrow>}
      <h1 className="font-display text-4xl font-semibold leading-[1.08] tracking-tight md:text-6xl" style={{ color: "var(--gp-text)" }}>
        {block.title}
      </h1>
      {block.subtitle && (
        <p className={`text-lg leading-relaxed md:text-xl ${split ? "" : "mx-auto max-w-2xl"}`} style={{ color: "var(--gp-muted)" }}>
          {block.subtitle}
        </p>
      )}
      {block.quote && (
        <blockquote
          className="border-l-2 pl-4 text-base italic md:text-lg"
          style={{ color: "var(--gp-muted)", borderColor: "var(--gp-accent-ink)" }}
        >
          {block.quote}
        </blockquote>
      )}
      {block.cta_label && block.cta_href && (
        <div className={split ? "" : "flex justify-center"}>
          <CtaButton label={block.cta_label} href={block.cta_href} size="lg" />
        </div>
      )}
    </div>
  );

  // Full-bleed image: image behind, AA scrim from the brand ink, copy centered on top.
  if (hasImage && !split) {
    return (
      <section className="relative overflow-hidden">
        <img src={block.image_url} alt="" className="absolute inset-0 h-full w-full object-cover" aria-hidden />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, color-mix(in srgb, var(--gp-primary) 78%, transparent) 0%, color-mix(in srgb, var(--gp-primary) 62%, transparent) 55%, color-mix(in srgb, var(--gp-primary) 84%, transparent) 100%)",
          }}
        />
        <div className={`relative ${WRAP} px-6 md:px-10 py-28 md:py-40`}>{copy}</div>
      </section>
    );
  }

  // Split: copy one side, framed image the other.
  if (split) {
    return (
      <section className={SECTION}>
        <div className={`${WRAP} grid items-center gap-10 md:grid-cols-2 md:gap-16`}>
          <div>{copy}</div>
          <Frame>
            <img src={block.image_url} alt="" className="aspect-[4/3] w-full object-cover" />
          </Frame>
        </div>
      </section>
    );
  }

  // No image: centered editorial hero.
  return (
    <section className={`${SECTION} py-24 md:py-36`}>
      <div className={`${WRAP} px-0`}>{copy}</div>
    </section>
  );
}

function PhaseCardsBlock({ block }: { block: Extract<GrowthBlock, { type: "phase_cards" }> }) {
  return (
    <section className={SECTION}>
      <div className={WRAP}>
        <SectionHead title={block.title} />
        <div className="grid gap-6 md:grid-cols-3">
          {block.cards.map((c, i) => (
            <div key={i} className="p-7" style={cardStyle}>
              <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--gp-accent-ink)" }}>{c.phase}</div>
              <h3 className="mb-3 text-xl font-semibold" style={{ color: "var(--gp-text)" }}>{c.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--gp-muted)" }}>{c.body}</p>
              {c.outcome && (
                <div className="mt-5 border-t pt-4" style={{ borderColor: "color-mix(in srgb, var(--gp-text) 12%, transparent)" }}>
                  <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--gp-muted)" }}>Outcome</div>
                  <div className="text-sm font-medium" style={{ color: "var(--gp-accent-ink)" }}>{c.outcome}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureGridBlock({ block }: { block: Extract<GrowthBlock, { type: "feature_grid" }> }) {
  return (
    <section className={SECTION}>
      <div className={WRAP}>
        <SectionHead title={block.title} />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {block.items.map((item, i) => (
            <div key={i} className="p-7" style={cardStyle}>
              {item.icon && <div className="mb-4 text-2xl" aria-hidden>{item.icon}</div>}
              <h3 className="mb-2 text-lg font-semibold" style={{ color: "var(--gp-text)" }}>{item.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--gp-muted)" }}>{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CtaBlock({ block }: { block: Extract<GrowthBlock, { type: "cta" }> }) {
  return (
    <section className={SECTION}>
      <div className={`${WRAP_NARROW} rounded-3xl px-8 py-16 text-center`} style={{ ...cardStyle, background: "var(--gp-surface)" }}>
        <Heading className="text-3xl md:text-4xl">{block.title}</Heading>
        {block.body && <Lede className="mx-auto mt-4 max-w-xl">{block.body}</Lede>}
        <div className="mt-8 flex justify-center">
          <CtaButton label={block.cta_label} href={block.cta_href} size="lg" />
        </div>
      </div>
    </section>
  );
}

function RichTextBlock({ block }: { block: Extract<GrowthBlock, { type: "rich_text" }> }) {
  // Same sanitize posture as the legacy renderer — strip scripts/embeds/handlers.
  const safeHtml = useMemo(
    () =>
      DOMPurify.sanitize(block.html ?? "", {
        FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form"],
        FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur", "onchange", "onsubmit"],
      }),
    [block.html],
  );
  return (
    <section className={`px-6 md:px-10 py-12 md:py-16`}>
      <div
        className="prose prose-invert mx-auto max-w-3xl prose-headings:font-display prose-a:font-medium"
        style={{ color: "var(--gp-text)", ["--tw-prose-body" as string]: "var(--gp-muted)", ["--tw-prose-headings" as string]: "var(--gp-text)", ["--tw-prose-links" as string]: "var(--gp-accent-ink)", ["--tw-prose-bold" as string]: "var(--gp-text)" } as React.CSSProperties}
        dangerouslySetInnerHTML={{ __html: safeHtml }}
      />
    </section>
  );
}

function EmbeddedFormBlock({ block, tenantId }: { block: Extract<GrowthBlock, { type: "embedded_form" }>; tenantId?: string }) {
  return (
    <section id="apply" className={SECTION}>
      <div className={WRAP_NARROW}>
        {block.title && <SectionHead title={block.title} />}
        {tenantId ? (
          <GrowthFormEmbed tenantId={tenantId} formSlug={block.form_slug} accent="var(--gp-accent)" />
        ) : (
          // Preview / unresolved: a designed placeholder so the section never blanks out.
          <div className="rounded-2xl p-10 text-center" style={{ ...cardStyle, background: "var(--gp-surface)" }}>
            <div className="mx-auto mb-3 h-10 w-10 rounded-full" style={{ background: "color-mix(in srgb, var(--gp-accent-ink) 20%, transparent)" }} />
            <p className="text-sm font-medium" style={{ color: "var(--gp-text)" }}>Your form renders here on the published page.</p>
            <p className="mt-1 text-xs" style={{ color: "var(--gp-muted)" }}>Connected to “{block.form_slug}”.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function SocialProofBlock({ block }: { block: Extract<GrowthBlock, { type: "social_proof" }> }) {
  return (
    <section className="px-6 md:px-10 py-14">
      <div className={WRAP}>
        {block.title && <p className="mb-8 text-center text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--gp-muted)" }}>{block.title}</p>}
        <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-8">
          {block.logos.map((logo, i) =>
            logo.image_url ? (
              <img key={i} src={logo.image_url} alt={logo.name} className="h-8 w-auto opacity-70 transition-opacity hover:opacity-100 md:h-9" style={{ filter: "grayscale(1)" }} />
            ) : (
              <span key={i} className="text-lg font-semibold tracking-tight" style={{ color: "var(--gp-muted)" }}>{logo.name}</span>
            ),
          )}
        </div>
      </div>
    </section>
  );
}

function Stars({ rating }: { rating?: number }) {
  if (!rating) return null;
  const r = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <div className="mb-3 flex gap-0.5" aria-label={`${r} out of 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} aria-hidden style={{ color: i < r ? "var(--gp-accent-ink)" : "color-mix(in srgb, var(--gp-text) 22%, transparent)" }}>★</span>
      ))}
    </div>
  );
}

function TestimonialBlock({ block }: { block: Extract<GrowthBlock, { type: "testimonial" }> }) {
  const many = block.items.length > 1;
  return (
    <section className={SECTION}>
      <div className={WRAP}>
        <div className={`grid gap-6 ${many ? "md:grid-cols-2 lg:grid-cols-3" : "mx-auto max-w-2xl"}`}>
          {block.items.map((it, i) => (
            <figure key={i} className="flex flex-col p-8" style={cardStyle}>
              <Stars rating={it.rating} />
              <blockquote className="flex-1 text-lg leading-relaxed" style={{ color: "var(--gp-text)" }}>“{it.quote}”</blockquote>
              {(it.author || it.role) && (
                <figcaption className="mt-6 flex items-center gap-3">
                  {it.avatar_url && <img src={it.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />}
                  <span className="text-sm">
                    {it.author && <span className="block font-semibold" style={{ color: "var(--gp-text)" }}>{it.author}</span>}
                    {it.role && <span className="block" style={{ color: "var(--gp-muted)" }}>{it.role}</span>}
                  </span>
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingBlock({ block }: { block: Extract<GrowthBlock, { type: "pricing" }> }) {
  return (
    <section className={SECTION}>
      <div className={WRAP}>
        <SectionHead title={block.title} />
        <div className="grid items-stretch gap-6 md:grid-cols-3">
          {block.tiers.map((tier, i) => {
            const featured = !!tier.featured;
            return (
              <div
                key={i}
                className="relative flex flex-col p-8"
                style={{
                  ...cardStyle,
                  background: featured ? "var(--gp-surface)" : (cardStyle.background as string),
                  border: featured ? "1px solid var(--gp-accent-ink)" : hairline,
                  boxShadow: featured ? "0 20px 60px -20px color-mix(in srgb, var(--gp-primary) 60%, transparent)" : undefined,
                }}
              >
                {featured && (
                  <span className="absolute -top-3 left-8 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider" style={{ background: "var(--gp-accent)", color: "var(--gp-accent-foreground)" }}>
                    Most popular
                  </span>
                )}
                <h3 className="text-lg font-semibold" style={{ color: "var(--gp-text)" }}>{tier.name}</h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="font-display text-4xl font-semibold" style={{ color: "var(--gp-text)" }}>{tier.price}</span>
                  {tier.period && <span className="text-sm" style={{ color: "var(--gp-muted)" }}>/{tier.period}</span>}
                </div>
                <ul className="mt-6 flex-1 space-y-3 text-sm">
                  {tier.features.map((f, j) => (
                    <li key={j} className="flex gap-2" style={{ color: "var(--gp-muted)" }}>
                      <span aria-hidden style={{ color: "var(--gp-accent-ink)" }}>✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                {tier.cta_label && tier.cta_href && (
                  <div className="mt-8">
                    <CtaButton label={tier.cta_label} href={tier.cta_href} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FaqBlock({ block }: { block: Extract<GrowthBlock, { type: "faq" }> }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className={SECTION}>
      <div className={WRAP_NARROW}>
        <SectionHead title={block.title} />
        <div className="divide-y" style={{ borderColor: "color-mix(in srgb, var(--gp-text) 12%, transparent)" }}>
          {block.items.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={i} style={{ borderColor: "color-mix(in srgb, var(--gp-text) 12%, transparent)" }} className="border-t first:border-t-0">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 py-5 text-left"
                >
                  <span className="text-base font-medium md:text-lg" style={{ color: "var(--gp-text)" }}>{item.question}</span>
                  <span aria-hidden className="shrink-0 text-xl transition-transform" style={{ color: "var(--gp-accent-ink)", transform: isOpen ? "rotate(45deg)" : "none" }}>+</span>
                </button>
                {isOpen && <p className="pb-5 pr-8 text-sm leading-relaxed" style={{ color: "var(--gp-muted)" }}>{item.answer}</p>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function MediaBlock({ block }: { block: Extract<GrowthBlock, { type: "media" }> }) {
  const src = block.provider !== "mp4" ? embedUrl(block.provider, block.url) : null;
  return (
    <section className={SECTION}>
      <div className={WRAP_NARROW}>
        <SectionHead title={block.title} />
        <Frame>
          <div className="aspect-video w-full bg-black">
            {block.provider === "mp4" ? (
              <video src={block.url} controls playsInline className="h-full w-full" />
            ) : src ? (
              <iframe
                src={src}
                title={block.title || "Embedded video"}
                className="h-full w-full"
                loading="lazy"
                sandbox="allow-scripts allow-same-origin allow-presentation"
                referrerPolicy="strict-origin-when-cross-origin"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
              />
            ) : null}
          </div>
        </Frame>
        {block.caption && <p className="mt-3 text-center text-sm" style={{ color: "var(--gp-muted)" }}>{block.caption}</p>}
      </div>
    </section>
  );
}

function StatsBlock({ block }: { block: Extract<GrowthBlock, { type: "stats" }> }) {
  return (
    <section className={SECTION}>
      <div className={WRAP}>
        <SectionHead title={block.title} />
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {block.items.map((s, i) => (
            <div key={i} className="text-center">
              <div className="font-display text-4xl font-semibold tabular-nums md:text-5xl" style={{ color: "var(--gp-accent-ink)" }}>{s.value}</div>
              <div className="mt-2 text-sm" style={{ color: "var(--gp-muted)" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CountdownBlock({ block }: { block: Extract<GrowthBlock, { type: "countdown" }> }) {
  const target = useMemo(() => new Date(block.ends_at).getTime(), [block.ends_at]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (isNaN(target)) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);

  const diff = Math.max(0, target - now);
  const expired = !isNaN(target) && diff <= 0;
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const units: { v: number; l: string }[] = [
    { v: d, l: "Days" }, { v: h, l: "Hours" }, { v: m, l: "Minutes" }, { v: s, l: "Seconds" },
  ];

  return (
    <section className={SECTION}>
      <div className={`${WRAP_NARROW} rounded-3xl px-8 py-14 text-center`} style={{ ...cardStyle, background: "var(--gp-surface)" }}>
        {block.title && <Heading className="text-2xl md:text-3xl">{block.title}</Heading>}
        {block.subtitle && <Lede className="mx-auto mt-3 max-w-lg">{block.subtitle}</Lede>}
        {expired ? (
          <p className="mt-8 text-xl font-semibold" style={{ color: "var(--gp-accent-ink)" }}>{block.expired_text || "This has ended."}</p>
        ) : (
          <div className="mt-8 flex justify-center gap-4 md:gap-6">
            {units.map((u, i) => (
              <div key={i} className="flex min-w-[64px] flex-col items-center rounded-xl px-3 py-4" style={{ border: hairline, background: "color-mix(in srgb, var(--gp-text) 4%, transparent)" }}>
                <span className="font-display text-3xl font-semibold tabular-nums md:text-4xl" style={{ color: "var(--gp-text)" }}>{String(u.v).padStart(2, "0")}</span>
                <span className="mt-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--gp-muted)" }}>{u.l}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function TwoColumnBlock({ block }: { block: Extract<GrowthBlock, { type: "two_column" }> }) {
  const imageRight = block.image_side !== "left";
  const img = block.image_url ? (
    <Frame>
      <img src={block.image_url} alt="" className="aspect-[4/3] w-full object-cover" />
    </Frame>
  ) : null;
  const copy = (
    <div className="space-y-5">
      {block.heading && <Heading className="text-3xl md:text-4xl">{block.heading}</Heading>}
      {block.body && <Lede>{block.body}</Lede>}
      {block.cta_label && block.cta_href && <div className="pt-2"><CtaButton label={block.cta_label} href={block.cta_href} /></div>}
    </div>
  );
  return (
    <section className={SECTION}>
      <div className={`${WRAP} grid items-center gap-10 md:grid-cols-2 md:gap-16`}>
        {img && imageRight ? <>{copy}{img}</> : img ? <>{img}{copy}</> : copy}
      </div>
    </section>
  );
}

function ImageBlock({ block }: { block: Extract<GrowthBlock, { type: "image" }> }) {
  return (
    <section className="px-6 md:px-10 py-12">
      <figure className={WRAP}>
        <Frame>
          <img src={block.url} alt={block.alt || ""} className="w-full object-cover" />
        </Frame>
        {block.caption && <figcaption className="mt-3 text-center text-sm" style={{ color: "var(--gp-muted)" }}>{block.caption}</figcaption>}
      </figure>
    </section>
  );
}

function GalleryBlock({ block }: { block: Extract<GrowthBlock, { type: "gallery" }> }) {
  return (
    <section className={SECTION}>
      <div className={WRAP}>
        <SectionHead title={block.title} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {block.images.map((img, i) => (
            <figure key={i}>
              <Frame>
                <img src={img.url} alt={img.alt || ""} className="aspect-square w-full object-cover transition-transform duration-300 hover:scale-[1.03]" />
              </Frame>
              {img.caption && <figcaption className="mt-2 text-xs" style={{ color: "var(--gp-muted)" }}>{img.caption}</figcaption>}
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

function StepsBlock({ block }: { block: Extract<GrowthBlock, { type: "steps" }> }) {
  return (
    <section className={SECTION}>
      <div className={WRAP_NARROW}>
        <SectionHead title={block.title} />
        <ol className="space-y-8">
          {block.items.map((step, i) => (
            <li key={i} className="flex gap-5">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-display text-lg font-semibold"
                style={{ background: "color-mix(in srgb, var(--gp-accent-ink) 14%, transparent)", color: "var(--gp-accent-ink)", border: "1px solid color-mix(in srgb, var(--gp-accent-ink) 40%, transparent)" }}
              >
                {step.number || i + 1}
              </span>
              <div className="pt-1">
                <h3 className="text-lg font-semibold" style={{ color: "var(--gp-text)" }}>{step.title}</h3>
                <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--gp-muted)" }}>{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ── single-block dispatcher (exported for callers that render one block) ──────
export function BlockRenderer({ block, tenantId }: { block: GrowthBlock; tenantId?: string }) {
  switch (block.type) {
    case "hero": return <HeroBlock block={block} />;
    case "phase_cards": return <PhaseCardsBlock block={block} />;
    case "feature_grid": return <FeatureGridBlock block={block} />;
    case "cta": return <CtaBlock block={block} />;
    case "rich_text": return <RichTextBlock block={block} />;
    case "embedded_form": return <EmbeddedFormBlock block={block} tenantId={tenantId} />;
    case "social_proof": return <SocialProofBlock block={block} />;
    case "testimonial": return <TestimonialBlock block={block} />;
    case "pricing": return <PricingBlock block={block} />;
    case "faq": return <FaqBlock block={block} />;
    case "media": return <MediaBlock block={block} />;
    case "stats": return <StatsBlock block={block} />;
    case "countdown": return <CountdownBlock block={block} />;
    case "two_column": return <TwoColumnBlock block={block} />;
    case "image": return <ImageBlock block={block} />;
    case "gallery": return <GalleryBlock block={block} />;
    case "steps": return <StepsBlock block={block} />;
    default: return null;
  }
}

export interface GrowthBlocksProps {
  blocks: GrowthBlock[];
  theme?: GrowthPageTheme | null;
  brandFloor?: GrowthPageTheme | null;
  /** Tenant id — lets `embedded_form` resolve a live form. Absent in bare preview. */
  tenantId?: string;
  /** Rendered inside the themed scope, after the blocks (e.g. a page footer). */
  children?: React.ReactNode;
  className?: string;
}

/**
 * The themed scope + block list. This is the single tree the public page and the Studio
 * preview both mount — one renderer, one theme resolver, so what you preview is what
 * publishes.
 */
export function GrowthBlocks({ blocks, theme, brandFloor, tenantId, children, className = "" }: GrowthBlocksProps) {
  const vars = resolveGrowthTheme(theme, brandFloor);
  const scopeStyle = {
    ...(vars as GrowthThemeVars),
    background: "var(--gp-bg)",
    color: "var(--gp-text)",
    fontFamily: "var(--gp-font)",
    minHeight: "100dvh",
  } as React.CSSProperties;

  return (
    <div className={className} style={scopeStyle}>
      {(blocks ?? []).map((block, i) => (
        <div key={i} className={GP_FADE_RISE} style={fadeRiseStyle(i)}>
          <BlockRenderer block={block} tenantId={tenantId} />
        </div>
      ))}
      {children}
    </div>
  );
}

export default GrowthBlocks;
