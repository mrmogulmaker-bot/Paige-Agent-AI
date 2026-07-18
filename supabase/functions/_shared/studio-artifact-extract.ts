// _shared/studio-artifact-extract.ts — turn a Studio artifact's structured data into the plain
// prose the KB learns from (#310 Slice B). Pure functions, no I/O: the studio-learn-from-artifact
// seam reads the rows and calls these; a funnel is composed by concatenating its pages' + forms'
// extracted text (the seam resolves the step → page_id/form_id and reuses these two extractors, so
// there is no third code path — §12).
//
// We pull only the HUMAN-READABLE copy (headlines, body, questions, options, CTA labels, proof) —
// the words that carry the practice's voice, offers, and client language. We deliberately DROP
// pure-visual/technical fields (image_url, cta_href, provider, form_slug) — a URL is not knowledge.

const clip = (v: unknown, max = 4000): string =>
  (typeof v === "string" ? v : "").replace(/\s+/g, " ").trim().slice(0, max);

/** Strip HTML tags from a rich_text block to plain text (entities left as-is; the chunker cleans ws). */
function stripHtml(html: unknown): string {
  return clip(String(typeof html === "string" ? html : "").replace(/<[^>]+>/g, " "), 20000);
}

const push = (out: string[], label: string, value: unknown) => {
  const v = clip(value);
  if (v) out.push(label ? `${label}: ${v}` : v);
};

/**
 * Flatten a GrowthBlock[] (a published page's blocks_json) into prose. Mirrors the field shapes
 * enforced by validateBlock() in growth-blocks.ts — if a block type is added there, add its text
 * fields here.
 */
export function flattenBlocks(blocks: unknown): string {
  if (!Array.isArray(blocks)) return "";
  const out: string[] = [];
  for (const raw of blocks) {
    const b = (raw ?? {}) as Record<string, unknown>;
    switch (b.type) {
      case "hero":
      case "hero_scene":
        push(out, "", b.eyebrow); push(out, "", b.title); push(out, "", b.subtitle);
        push(out, "", b.cta_label); push(out, "", b.quote);
        break;
      case "phase_cards":
        for (const c of (Array.isArray(b.cards) ? b.cards : []) as Record<string, unknown>[]) {
          push(out, "", c?.phase); push(out, "", c?.title); push(out, "", c?.body); push(out, "", c?.outcome);
        }
        break;
      case "feature_grid":
      case "steps":
        push(out, "", b.title);
        for (const it of (Array.isArray(b.items) ? b.items : []) as Record<string, unknown>[]) {
          push(out, "", it?.title); push(out, "", it?.body);
        }
        break;
      case "cta":
        push(out, "", b.title); push(out, "", b.body); push(out, "", b.cta_label);
        break;
      case "rich_text": {
        const t = stripHtml(b.html); if (t) out.push(t);
        break;
      }
      case "social_proof":
        push(out, "", b.title);
        for (const l of (Array.isArray(b.logos) ? b.logos : []) as Record<string, unknown>[]) push(out, "", l?.name);
        break;
      case "testimonial":
        for (const it of (Array.isArray(b.items) ? b.items : []) as Record<string, unknown>[]) {
          push(out, "", it?.quote); push(out, "", it?.author); push(out, "", it?.role);
        }
        break;
      case "pricing":
        push(out, "", b.title);
        for (const t of (Array.isArray(b.tiers) ? b.tiers : []) as Record<string, unknown>[]) {
          push(out, "", t?.name); push(out, "", t?.price); push(out, "", t?.period);
          for (const f of (Array.isArray(t?.features) ? t.features : [])) push(out, "", f);
        }
        break;
      case "faq":
        push(out, "", b.title);
        for (const it of (Array.isArray(b.items) ? b.items : []) as Record<string, unknown>[]) {
          push(out, "Q", it?.question); push(out, "A", it?.answer);
        }
        break;
      case "stats":
        push(out, "", b.title);
        for (const it of (Array.isArray(b.items) ? b.items : []) as Record<string, unknown>[]) {
          push(out, "", it?.value); push(out, "", it?.label);
        }
        break;
      case "countdown":
        push(out, "", b.title); push(out, "", b.subtitle); push(out, "", b.expired_text);
        break;
      case "two_column":
        push(out, "", b.heading); push(out, "", b.body); push(out, "", b.cta_label);
        break;
      case "media":
      case "image":
        push(out, "", b.title); push(out, "", b.caption); push(out, "", b.alt);
        break;
      case "gallery":
        push(out, "", b.title);
        for (const im of (Array.isArray(b.images) ? b.images : []) as Record<string, unknown>[]) {
          push(out, "", im?.alt); push(out, "", im?.caption);
        }
        break;
      case "chatbot":
        push(out, "", b.title); push(out, "", b.greeting); push(out, "", b.placeholder);
        break;
      default:
        break; // embedded_form and unknown types carry no learnable prose
    }
  }
  return out.join("\n");
}

/** Flatten a form's schema_json (sections[].fields[]) — the questions ARE the intent signal. */
export function flattenFormSchema(schema: unknown): string {
  const s = (schema ?? {}) as Record<string, unknown>;
  const out: string[] = [];
  push(out, "", s.submit_label);
  const sections = Array.isArray(s.sections) ? s.sections : [];
  for (const sec of sections as Record<string, unknown>[]) {
    push(out, "", sec?.title);
    for (const f of (Array.isArray(sec?.fields) ? sec.fields : []) as Record<string, unknown>[]) {
      push(out, "", f?.label);
      const opts = Array.isArray(f?.options) ? f.options : [];
      for (const o of opts) push(out, "", typeof o === "string" ? o : (o as Record<string, unknown>)?.label);
    }
  }
  return out.join("\n");
}
