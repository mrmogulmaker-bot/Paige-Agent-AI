// The post-submit delivery editor — closes the confirmed gap where every Page-mode form's
// success_action_json was hardcoded to a generic "thanks" with NO way to attach a real
// deliverable, and no UI anywhere to set one (§13/§15).
//
// Lives in the page-mode rail once a page has been saved (its embedded_form has a real backing
// row in growth_forms — auto-authored by growth_page_upsert). Reads/writes through studio.ts's
// loadFormBySlug / saveFormDelivery / listGrowthAssets / uploadGrowthAsset — this file touches
// Supabase for nothing; it is pure presentation + local state, same discipline as every other
// Studio component.
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Paperclip } from "lucide-react";
import type { GrowthAsset, GrowthSuccessAction } from "@/lib/growth";
import { GROWTH_ASSET_ACCEPT } from "@/lib/growth";
import { SectionCard } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import {
  isStudioError,
  listGrowthAssets,
  loadFormBySlug,
  saveFormDelivery,
  uploadGrowthAsset,
  type FormDeliveryRecord,
} from "./studio";

type DeliveryMode = "message" | "redirect" | "download";

function modeFromAction(action: GrowthSuccessAction | null): DeliveryMode {
  if (action?.download_url) return "download";
  if (action?.redirect_url) return "redirect";
  return "message";
}

export interface DeliveryEditorProps {
  tenantId: string;
  /** The embedded_form block's own form_slug on the CURRENT page. */
  formSlug: string;
  /** A real, already-uploaded attachment URL Paige flagged as the likely deliverable during
   *  generation (studio.ts's DraftPageResult.suggestedDelivery, resolved to a URL by the shell).
   *  Purely a proposal (§15) — never written until the operator explicitly saves. */
  suggestedAssetUrl?: string | null;
  className?: string;
}

export function DeliveryEditor({ tenantId, formSlug, suggestedAssetUrl, className }: DeliveryEditorProps) {
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormDeliveryRecord | null>(null);
  const [mode, setMode] = useState<DeliveryMode>("message");
  const [message, setMessage] = useState("");
  const [redirectUrl, setRedirectUrl] = useState("");
  const [assets, setAssets] = useState<GrowthAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [selectedAssetUrl, setSelectedAssetUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);
  const newAssetInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    loadFormBySlug(tenantId, formSlug)
      .then((row) => {
        if (!live) return;
        setForm(row);
        const action = row?.successAction ?? null;
        setMode(modeFromAction(action));
        setMessage(action?.message ?? "");
        setRedirectUrl(action?.redirect_url ?? "");
        setSelectedAssetUrl(action?.download_url ?? null);
      })
      .catch((err) => {
        console.error("[studio] delivery editor failed to load its form:", err);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [tenantId, formSlug]);

  const refreshAssets = useCallback(() => {
    setAssetsLoading(true);
    listGrowthAssets(tenantId)
      .then((list) => setAssets(list))
      .catch((err) => console.error("[studio] couldn't list uploaded assets:", err))
      .finally(() => setAssetsLoading(false));
  }, [tenantId]);

  // Load the picker's options once the operator actually wants to pick a download asset.
  useEffect(() => {
    if (mode === "download" && assets.length === 0 && !assetsLoading) refreshAssets();
  }, [mode, assets.length, assetsLoading, refreshAssets]);

  const acceptSuggestion = useCallback(() => {
    setMode("download");
    setSelectedAssetUrl(suggestedAssetUrl ?? null);
  }, [suggestedAssetUrl]);

  const onUploadNewAsset = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (e.target) e.target.value = "";
      if (!file) return;
      setUploading(true);
      try {
        const asset = await uploadGrowthAsset(tenantId, file);
        setAssets((prev) => [asset, ...prev]);
        setSelectedAssetUrl(asset.url);
      } catch (err) {
        toast.error(isStudioError(err) ? err.message : "Couldn't upload that file. Try again.");
      } finally {
        setUploading(false);
      }
    },
    [tenantId],
  );

  const save = useCallback(async () => {
    if (!form) return;
    if (mode === "redirect" && !/^https?:\/\//i.test(redirectUrl.trim())) {
      toast.error("Give a real https:// link to redirect to.");
      return;
    }
    if (mode === "download" && !selectedAssetUrl) {
      toast.error("Pick (or upload) the file to deliver first.");
      return;
    }
    const successAction: GrowthSuccessAction = {
      type: "thank_you",
      message: message.trim() || undefined,
      ...(mode === "redirect" ? { redirect_url: redirectUrl.trim() } : {}),
      ...(mode === "download" && selectedAssetUrl ? { download_url: selectedAssetUrl } : {}),
    };
    setSaving(true);
    try {
      await saveFormDelivery({
        tenantId,
        formId: form.id,
        slug: form.slug,
        name: form.name,
        schema: form.schema,
        successAction,
      });
      setForm({ ...form, successAction });
      toast.success("Post-submit behavior updated.");
    } catch (err) {
      toast.error(isStudioError(err) ? err.message : "Couldn't save that. Try again.");
    } finally {
      setSaving(false);
    }
  }, [form, mode, message, redirectUrl, selectedAssetUrl, tenantId]);

  if (loading) {
    return (
      <SectionCard title="After they submit" className={className}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
          Loading…
        </div>
      </SectionCard>
    );
  }

  // The form hasn't been auto-authored yet — nothing to edit until the page is saved once.
  if (!form) return null;

  return (
    <SectionCard
      title="After they submit"
      description="What a visitor sees the moment they submit this page's signup form."
      className={className}
    >
      <div className="space-y-3">
        {suggestedAssetUrl && !suggestionDismissed && mode !== "download" && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-[hsl(var(--ring)/0.4)] bg-[hsl(var(--ring)/0.06)] px-3 py-2">
            <span className="text-xs text-foreground">
              One of your attachments looks like the deliverable this page promises — want to deliver it here?
            </span>
            <div className="flex shrink-0 gap-1.5">
              <Button type="button" size="sm" variant="outline" onClick={acceptSuggestion}>
                Use it
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setSuggestionDismissed(true)}>
                Dismiss
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="delivery-message">Thank-you message</Label>
          <Input
            id="delivery-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Thanks — we'll be in touch."
          />
        </div>

        <RadioGroup value={mode} onValueChange={(v) => setMode(v as DeliveryMode)} className="space-y-2">
          <div className="flex items-center gap-2.5">
            <RadioGroupItem id="delivery-mode-message" value="message" />
            <Label htmlFor="delivery-mode-message" className="cursor-pointer text-sm font-normal">
              Just show the message
            </Label>
          </div>
          <div className="flex items-center gap-2.5">
            <RadioGroupItem id="delivery-mode-redirect" value="redirect" />
            <Label htmlFor="delivery-mode-redirect" className="cursor-pointer text-sm font-normal">
              Redirect to a page
            </Label>
          </div>
          <div className="flex items-center gap-2.5">
            <RadioGroupItem id="delivery-mode-download" value="download" />
            <Label htmlFor="delivery-mode-download" className="cursor-pointer text-sm font-normal">
              Let them download a file
            </Label>
          </div>
        </RadioGroup>

        {mode === "redirect" && (
          <div className="space-y-1.5 pl-6">
            <Label htmlFor="delivery-redirect-url">Redirect URL</Label>
            <Input
              id="delivery-redirect-url"
              value={redirectUrl}
              onChange={(e) => setRedirectUrl(e.target.value)}
              placeholder="https://example.com/thank-you"
            />
          </div>
        )}

        {mode === "download" && (
          <div className="space-y-2 pl-6">
            {assetsLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
                Loading your uploaded files…
              </div>
            ) : assets.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nothing uploaded yet — attach the file below.</p>
            ) : (
              <RadioGroup value={selectedAssetUrl ?? ""} onValueChange={setSelectedAssetUrl} className="space-y-1.5">
                {assets.map((a) => (
                  <div key={a.path} className="flex items-center gap-2.5">
                    <RadioGroupItem id={`delivery-asset-${a.path}`} value={a.url} />
                    <Label htmlFor={`delivery-asset-${a.path}`} className="min-w-0 flex-1 cursor-pointer truncate text-sm font-normal">
                      {a.name}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            )}
            <input
              ref={newAssetInputRef}
              type="file"
              accept={GROWTH_ASSET_ACCEPT}
              className="hidden"
              onChange={onUploadNewAsset}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={uploading}
              onClick={() => newAssetInputRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
              ) : (
                <Paperclip className="h-3.5 w-3.5" aria-hidden />
              )}
              Upload a new file
            </Button>
          </div>
        )}

        <Button type="button" variant="default" size="sm" onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </SectionCard>
  );
}

export default DeliveryEditor;
