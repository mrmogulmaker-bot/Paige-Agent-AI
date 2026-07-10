/**
 * Client Agreement editor (tenant-facing).
 *
 * A tenant authors their OWN client service agreement here — their document,
 * their attorney's language. It's what a client signs at /onboard/agreement.
 * If a tenant hasn't authored one, clients see the neutral platform default
 * (agreement-default.ts); saving here overrides it for THIS tenant only.
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import {
  DEFAULT_AGREEMENT_TITLE,
  DEFAULT_AGREEMENT_TEMPLATE,
  renderAgreementBody,
} from "@/pages/onboard/agreement-default";

const PLACEHOLDERS = ["{{tenant_name}}", "{{client_full_legal_name}}", "{{effective_date}}", "{{signature_date}}"];

export default function AgreementAdmin() {
  const { activeTenantId, activeTenant, loading: tenantLoading } = useTenantContext();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    if (!activeTenantId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    supabase.rpc("get_tenant_service_agreement", { _tenant_id: activeTenantId }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) { toast.error(error.message); setLoading(false); return; }
      const row = Array.isArray(data) ? data[0] : data;
      setTitle((row as any)?.agreement_title ?? "");
      setBody((row as any)?.agreement_body ?? "");
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [activeTenantId]);

  const save = async () => {
    if (!activeTenantId) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc("set_tenant_service_agreement", {
        _tenant_id: activeTenantId,
        _title: title.trim() || null,
        _body: body.trim() || null,
      });
      if (error) throw error;
      toast.success("Agreement saved — your clients will now sign this version.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the agreement");
    } finally {
      setSaving(false);
    }
  };

  const startFromDefault = () => {
    setTitle(DEFAULT_AGREEMENT_TITLE);
    setBody(DEFAULT_AGREEMENT_TEMPLATE);
    toast.info("Loaded the platform default — edit it to make it yours, then save.");
  };

  if (!tenantLoading && !activeTenantId) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          Select a workspace to edit its client agreement.
        </CardContent></Card>
      </div>
    );
  }

  const previewText = renderAgreementBody(body || DEFAULT_AGREEMENT_TEMPLATE, {
    tenant_name: activeTenant?.name ?? "Your business",
    client_full_legal_name: "Jane A. Client",
    effective_date: "2026-01-01",
    signature_date: "2026-01-01",
  });

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Client Agreement</h1>
        <p className="text-sm text-muted-foreground">
          The agreement your clients sign during onboarding. Author your own — your document, your
          attorney's language. Leave it blank to use the neutral platform default.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Your agreement</CardTitle>
          <CardDescription>
            Markdown-style headings (<code># Heading</code>) render as bold. Available placeholders,
            substituted per client at signing: {PLACEHOLDERS.map((p) => <code key={p} className="mx-1">{p}</code>)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="agr-title">Title</Label>
                <Input
                  id="agr-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={DEFAULT_AGREEMENT_TITLE}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="agr-body">Agreement text</Label>
                  <Button type="button" variant="ghost" size="sm" onClick={startFromDefault}>
                    Start from the platform default
                  </Button>
                </div>
                <Textarea
                  id="agr-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={18}
                  className="font-mono text-xs"
                  placeholder="Leave blank to use the neutral platform default, or paste your own agreement here."
                />
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save agreement"}</Button>
                <Button type="button" variant="outline" onClick={() => setPreview((p) => !p)}>
                  {preview ? "Hide preview" : "Preview"}
                </Button>
                {!body.trim() && <span className="text-xs text-muted-foreground">Currently using the platform default.</span>}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Preview (sample client)</CardTitle></CardHeader>
          <CardContent>
            <div className="whitespace-pre-wrap text-xs bg-muted/40 rounded-md p-4 max-h-[420px] overflow-auto">
              {previewText}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
