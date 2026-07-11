import { useEffect, useMemo, useRef, useState } from "react";
import { Image as ImageIcon, Palette, Type, Mail, UploadCloud, X, Loader2, Check, AlertTriangle } from "lucide-react";
import { SectionCard } from "@/components/ui/page/SectionCard";
import { StatePill } from "@/components/ui/page/StatePill";
import { EmptyState } from "@/components/ui/page/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useBrandKit, type LogoKind } from "@/hooks/useBrandKit";
import {
  contrastRatio, readableTextOn, isValidHex, PRIMARY_FLOOR, ACCENT_FLOOR,
  type BrandField, type BrandSource,
} from "@/lib/brand/resolveBrand";
import { cn } from "@/lib/utils";

const FONT_OPTIONS = [
  "System default", "Inter", "Plus Jakarta Sans", "Poppins", "Montserrat",
  "Playfair Display", "Lora", "Source Serif 4", "DM Sans", "Space Grotesk",
];

const MAX_BYTES = 2 * 1024 * 1024;
const IMG_TYPES = ["image/png", "image/svg+xml", "image/webp", "image/jpeg", "image/x-icon", "image/vnd.microsoft.icon"];

function SourceBadge({ source, hasOwn }: { source?: BrandSource; hasOwn: boolean }) {
  // "Custom" uses `success` (not gold `included`) — gold is reserved for the Save act (§11).
  if (hasOwn) return <StatePill state="success">Custom</StatePill>;
  if (source === "agency") return <StatePill state="pending">Inherited</StatePill>;
  return <StatePill state="off">Placeholder</StatePill>;
}

function LogoUploader({
  label, hint, kind, url, onUpload, onClear, busy, square,
}: {
  label: string; hint: string; kind: LogoKind; url: string | null;
  onUpload: (kind: LogoKind, file: File) => Promise<void>; onClear: (kind: LogoKind) => Promise<void>;
  busy: boolean; square?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file?: File | null) => {
    if (!file) return;
    if (!IMG_TYPES.includes(file.type)) {
      toast({ title: "Unsupported file", description: "Use a PNG, SVG, WEBP, JPG, or ICO.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast({ title: "File too large", description: "Keep it under 2 MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      await onUpload(kind, file);
      toast({ title: `${label} updated` });
    } catch (e) {
      toast({ title: "Upload failed", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {url && (
          <button
            type="button"
            onClick={() => void onClear(kind)}
            disabled={busy || uploading}
            className="text-xs text-muted-foreground hover:text-destructive disabled:opacity-50"
          >
            Remove
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); void handleFile(e.dataTransfer.files?.[0]); }}
        disabled={uploading || busy}
        className={cn(
          "group relative flex w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-[conic-gradient(at_center,_hsl(var(--muted))_0deg,_transparent_90deg,_hsl(var(--muted))_180deg,_transparent_270deg)] bg-[length:16px_16px] transition-colors hover:border-[hsl(var(--ring))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
          square ? "h-24 w-24" : "h-24 w-full",
        )}
      >
        {uploading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground motion-reduce:animate-none" />
        ) : url ? (
          <img src={url} alt={label} className="max-h-[84%] max-w-[84%] object-contain" />
        ) : (
          <span className="flex flex-col items-center gap-1 text-muted-foreground">
            <UploadCloud className="h-5 w-5" />
            <span className="text-xs">Drop or click</span>
          </span>
        )}
      </button>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <input
        ref={inputRef} type="file" accept={IMG_TYPES.join(",")} className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
    </div>
  );
}

function ColorField({
  label, value, floor, onChange, contrastAgainst, contrastLabel,
}: {
  label: string; value: string; floor: string; onChange: (v: string) => void;
  contrastAgainst?: string; contrastLabel?: string;
}) {
  const hex = isValidHex(value) ? value : floor;
  const ratio = contrastAgainst ? contrastRatio(hex, contrastAgainst) : null;
  const lowContrast = ratio != null && ratio < 4.5;
  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <label className="relative h-9 w-9 shrink-0 cursor-pointer overflow-hidden rounded-md border border-border" style={{ background: hex }}>
          <input
            type="color" value={hex} onChange={(e) => onChange(e.target.value.toUpperCase())}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label={`${label} color picker`}
          />
        </label>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          placeholder={floor}
          spellCheck={false}
          className="font-mono uppercase"
        />
      </div>
      {ratio != null && (
        <p className={cn("flex items-center gap-1 text-xs", lowContrast ? "text-[hsl(var(--warning))]" : "text-muted-foreground")}>
          {lowContrast ? <AlertTriangle className="h-3 w-3" /> : <Check className="h-3 w-3" />}
          {contrastLabel} contrast {ratio.toFixed(1)}:1 {lowContrast ? "— may be hard to read" : "— AA pass"}
        </p>
      )}
    </div>
  );
}

/**
 * Brand Kit editor (#143) — the tenant's logo, colors, voice, and sending
 * identity, saved to tenants.brand via set_tenant_brand and used everywhere Paige
 * builds. Gold discipline (§11): Save is the only gold act; the active-preview
 * ring is indigo. Reads the cascade so a sub-account shows inherited values from
 * its agency with an "Inherited" badge until it sets its own.
 */
export function BrandKitPanel() {
  const { activeTenantId } = useTenantContext();
  const { toast } = useToast();
  const bk = useBrandKit(activeTenantId);
  const own = bk.state?.own ?? {};
  const eff = bk.state?.effective ?? null;

  // Local, dirty-tracked text/color form (logos save immediately on upload).
  const [form, setForm] = useState({
    primary_color: "", accent_color: "", font: "", product_name: "", tagline: "",
    from_name: "", support_email: "",
  });
  const [dark, setDark] = useState(false);

  const dirty = useMemo(() => {
    const norm = (v?: string | null) => (v ?? "").trim();
    return (["primary_color", "accent_color", "font", "product_name", "tagline", "from_name", "support_email"] as const)
      .some((k) => norm(form[k]) !== norm((own as any)[k]));
  }, [form, own]);

  // Seed the form from the saved brand — but never clobber unsaved edits. A logo
  // upload/remove refetches `own` (new identity), which would otherwise revert the
  // user's in-progress text/color changes; skip the reseed while the form is dirty.
  const seeded = useRef(false);
  useEffect(() => {
    if (!bk.state) return;
    if (seeded.current && dirty) return;
    setForm({
      primary_color: own.primary_color ?? "",
      accent_color: own.accent_color ?? "",
      font: own.font ?? "",
      product_name: own.product_name ?? "",
      tagline: own.tagline ?? "",
      from_name: own.from_name ?? "",
      support_email: own.support_email ?? "",
    });
    seeded.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bk.state?.own]);

  const src = (f: BrandField): BrandSource | undefined => eff?.source?.[f];
  const hasOwn = (k: keyof typeof form) => !!(own as any)[k]?.toString().trim();

  // Effective values drive the preview (own value if set, else inherited/floor).
  const previewPrimary = isValidHex(form.primary_color) ? form.primary_color : (eff?.primary_color ?? PRIMARY_FLOOR);
  const previewAccent = isValidHex(form.accent_color) ? form.accent_color : (eff?.accent_color ?? ACCENT_FLOOR);
  const previewName = form.product_name.trim() || eff?.product_name || bk.state?.tenantName || "Your brand";
  const previewLogo =
    (dark ? (own.logo_dark_url || eff?.logo_dark_url) : null) ||
    own.logo_url || eff?.logo_url || null;

  const invalidHex =
    (form.primary_color.trim() && !isValidHex(form.primary_color)) ||
    (form.accent_color.trim() && !isValidHex(form.accent_color));

  const handleSave = async () => {
    if (invalidHex) {
      toast({ title: "Check your colors", description: "Colors must be a 6-digit hex like #EBB94C.", variant: "destructive" });
      return;
    }
    // Send only changed keys; empty string clears the key (cascade resumes).
    const patch: Record<string, string> = {};
    (["primary_color", "accent_color", "font", "product_name", "tagline", "from_name", "support_email"] as const).forEach((k) => {
      const next = form[k].trim();
      const prev = ((own as any)[k] ?? "").toString().trim();
      if (next !== prev) patch[k] = next;
    });
    try {
      await bk.save(patch);
      toast({ title: "Brand saved", description: "Paige will build with this from now on." });
    } catch (e) {
      toast({ title: "Couldn't save", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" });
    }
  };

  if (!activeTenantId) {
    return <EmptyState icon={Palette} title="No active workspace" description="Pick a workspace to set up its brand." />;
  }
  if (bk.isLoading) {
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div className="space-y-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}</div>
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
      {/* ── Editor ── */}
      <div className="space-y-4">
        <SectionCard
          icon={ImageIcon}
          title="Logo & mark"
          description="Used in the portal, emails, and anything Paige builds. Transparent PNG or SVG works best."
          actions={<SourceBadge source={src("logo_url")} hasOwn={!!own.logo_url} />}
        >
          <div className="flex flex-wrap gap-5">
            <LogoUploader label="Logo (light)" hint="Shown on light backgrounds." kind="logo"
              url={own.logo_url ?? null} onUpload={bk.setLogo} onClear={bk.clearLogo} busy={bk.saving} />
            <LogoUploader label="Logo (dark)" hint="Shown on dark backgrounds." kind="logo-dark"
              url={own.logo_dark_url ?? null} onUpload={bk.setLogo} onClear={bk.clearLogo} busy={bk.saving} />
            <LogoUploader label="Favicon" hint="Square. The browser-tab icon." kind="favicon" square
              url={own.favicon_url ?? null} onUpload={bk.setLogo} onClear={bk.clearLogo} busy={bk.saving} />
          </div>
        </SectionCard>

        <SectionCard
          icon={Palette}
          title="Colors"
          description="Primary carries headers and buttons; accent is spent on the act/approve moment."
          actions={<SourceBadge source={src("primary_color")} hasOwn={hasOwn("primary_color")} />}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <ColorField label="Primary" value={form.primary_color} floor={PRIMARY_FLOOR}
              onChange={(v) => setForm((f) => ({ ...f, primary_color: v }))}
              contrastAgainst="#FFFFFF" contrastLabel="On white," />
            {/* Accent is always used as a fill with auto-contrast text, so a
                readability chip would always "pass" and mislead — omit it. */}
            <ColorField label="Accent" value={form.accent_color} floor={ACCENT_FLOOR}
              onChange={(v) => setForm((f) => ({ ...f, accent_color: v }))} />
          </div>
        </SectionCard>

        <SectionCard
          icon={Type}
          title="Type & voice"
          description="What your product is called and how it reads."
          actions={<SourceBadge source={src("product_name")} hasOwn={hasOwn("product_name")} />}
        >
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <span className="text-sm font-medium text-foreground">Product / portal name</span>
                <Input value={form.product_name} placeholder={bk.state?.tenantName || "Your brand"}
                  onChange={(e) => setForm((f) => ({ ...f, product_name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <span className="text-sm font-medium text-foreground">Typeface</span>
                <Select value={form.font || "System default"}
                  onValueChange={(v) => setForm((f) => ({ ...f, font: v === "System default" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="System default" /></SelectTrigger>
                  <SelectContent>
                    {FONT_OPTIONS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Tagline</span>
              <Input value={form.tagline} placeholder="One line that says what you do."
                onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))} />
            </div>
          </div>
        </SectionCard>

        <SectionCard
          icon={Mail}
          title="Sending identity"
          description="The name and reply-to on emails Paige sends for you."
          actions={<SourceBadge source={src("from_name")} hasOwn={hasOwn("from_name")} />}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">From name</span>
              <Input value={form.from_name} placeholder={bk.state?.tenantName || "Your brand"}
                onChange={(e) => setForm((f) => ({ ...f, from_name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Support / reply-to email</span>
              <Input value={form.support_email} type="email" placeholder="hello@yourbrand.com"
                onChange={(e) => setForm((f) => ({ ...f, support_email: e.target.value }))} />
            </div>
          </div>
        </SectionCard>

        <div className="flex items-center justify-end gap-3">
          {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
          <Button variant="gold" onClick={() => void handleSave()} disabled={!dirty || bk.saving || !!invalidHex}>
            {bk.saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" /> : null}
            Save brand
          </Button>
        </div>
      </div>

      {/* ── Live preview ── */}
      <div className="lg:sticky lg:top-4 lg:self-start">
        <SectionCard
          padded={false}
          title="Live preview"
          actions={
            <button type="button" onClick={() => setDark((d) => !d)}
              className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
              {dark ? "Dark" : "Light"}
            </button>
          }
        >
          <div className="p-4">
            <div className={cn("overflow-hidden rounded-xl border", dark ? "border-white/10" : "border-border")}
              style={{ background: dark ? "#0B0B12" : "#FFFFFF" }}>
              {/* portal masthead */}
              <div className="flex items-center gap-2.5 px-4 py-3" style={{ background: previewPrimary }}>
                {previewLogo ? (
                  <img src={previewLogo} alt="" className="h-6 max-w-[120px] object-contain" />
                ) : (
                  <span className="grid h-6 w-6 place-items-center rounded-md text-xs font-bold"
                    style={{ background: previewAccent, color: readableTextOn(previewAccent) }}>
                    {previewName.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="truncate text-sm font-semibold" style={{ color: readableTextOn(previewPrimary) }}>
                  {previewName}
                </span>
              </div>
              {/* body */}
              <div className="space-y-3 p-4" style={{ color: dark ? "#E7E7EA" : "#1A1A22", fontFamily: form.font || undefined }}>
                <p className="text-sm font-semibold">Welcome back</p>
                <p className="text-xs opacity-70">
                  {(form.tagline.trim() || eff?.tagline) || "This is how your portal and emails will look to your clients."}
                </p>
                <button className="rounded-md px-3 py-1.5 text-xs font-semibold"
                  style={{ background: previewAccent, color: readableTextOn(previewAccent) }}>
                  Get started
                </button>
              </div>
              {/* email footer */}
              <div className="border-t px-4 py-2 text-[11px]"
                style={{ borderColor: dark ? "rgba(255,255,255,.08)" : "hsl(var(--border))", color: dark ? "#8A8A95" : "#71717A" }}>
                From {form.from_name.trim() || eff?.from_name || previewName}
                {(form.support_email.trim() || eff?.support_email) ? ` · ${form.support_email.trim() || eff?.support_email}` : ""}
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Paige uses these everywhere she builds — the client portal, emails, pages, and assets.
            </p>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
