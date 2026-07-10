import { useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_AGREEMENT_TITLE,
  DEFAULT_AGREEMENT_VERSION,
  DEFAULT_AGREEMENT_TEMPLATE,
  renderAgreementBody,
} from "./agreement-default";
import { readableTextOn } from "@/lib/brand/contrast";
import type { OnboardClient } from "./useOnboardingClient";
import type { OnboardBrand } from "./OnboardLayout";

type Ctx = { client: OnboardClient; refresh: () => void; brand: OnboardBrand | null };

const STEPS = ["Your info", "Agreement"];

function ProgressHeader({ stepIndex, title, subtitle }: { stepIndex: number; title: string; subtitle: string }) {
  const pct = Math.round(((stepIndex + 1) / STEPS.length) * 100);
  return (
    <div className="mb-6">
      <span className="onboard-step-chip">Step {stepIndex + 1} of {STEPS.length} · {STEPS[stepIndex]}</span>
      <h1 className="onboard-h1">{title}</h1>
      <p className="onboard-sub">{subtitle}</p>
      <div className="onboard-progress"><div style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const dirtyRef = useRef(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#081428";
  }, []);

  const pos = (e: React.MouseEvent | React.TouchEvent) => {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    const point = "touches" in e ? e.touches[0] : (e as React.MouseEvent);
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  };

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    drawingRef.current = true;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const move = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    dirtyRef.current = true;
  };
  const end = () => {
    drawingRef.current = false;
    if (dirtyRef.current) onChange(canvasRef.current?.toDataURL("image/png") ?? null);
  };
  const clear = () => {
    const c = canvasRef.current;
    if (!c) return;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    dirtyRef.current = false;
    onChange(null);
  };

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        className="signature-pad"
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={clear}>Clear signature</Button>
      </div>
    </div>
  );
}

export default function Step2Agreement() {
  const { client, refresh, brand } = useOutletContext<Ctx>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const [typedName, setTypedName] = useState(`${client.first_name ?? ""} ${client.last_name ?? ""}`.trim());
  const [sigImg, setSigImg] = useState<string | null>(null);
  const [readConsent, setReadConsent] = useState(false);
  const [esignConsent, setEsignConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // The agreement is the TENANT's own document if they've authored one, else the
  // neutral platform default — never a hardcoded vertical/credit contract (§2/§9).
  const [agr, setAgr] = useState<
    { title: string; body: string; key: string; version: string; tenantName: string } | null
  >(null);
  useEffect(() => {
    let cancelled = false;
    supabase.rpc("get_client_service_agreement").then(({ data }) => {
      if (cancelled) return;
      const row = Array.isArray(data) ? data[0] : data;
      const tenantName = (row as any)?.tenant_name || brand?.tenant_name || "your provider";
      const custom = (row as any)?.agreement_body as string | null;
      setAgr({
        title: (row as any)?.agreement_title || DEFAULT_AGREEMENT_TITLE,
        body: custom || DEFAULT_AGREEMENT_TEMPLATE,
        key: custom ? "tenant_custom" : "platform_default",
        version: custom ? "tenant-v1" : DEFAULT_AGREEMENT_VERSION,
        tenantName,
      });
    });
    return () => { cancelled = true; };
  }, [brand?.tenant_name]);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const agreementTitle = agr?.title ?? DEFAULT_AGREEMENT_TITLE;
  const agreementText = useMemo(() => {
    if (!agr) return "";
    return renderAgreementBody(agr.body, {
      tenant_name: agr.tenantName,
      client_full_legal_name: `${client.first_name ?? ""} ${client.last_name ?? ""}`.trim() || "Client",
      effective_date: today,
      signature_date: today,
    });
  }, [agr, client, today]);
  const accent = brand?.primary_color || null;

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setScrolledToEnd(true);
  };

  const canSubmit =
    scrolledToEnd && typedName.trim().length > 1 && readConsent && esignConsent && !submitting && !!agreementText;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("finalize-agreement", {
        body: {
          client_id: client.id,
          agreement_template_key: agr?.key ?? "platform_default",
          agreement_version: agr?.version ?? DEFAULT_AGREEMENT_VERSION,
          agreement_text_snapshot: agreementText,
          signature: {
            typed_name: typedName.trim(),
            signature_image_base64: sigImg ?? "",
            e_sign_consent: esignConsent,
            read_consent: readConsent,
          },
          client_meta: { tz_offset_min: new Date().getTimezoneOffset() },
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Could not finalize");
      toast({ title: "Agreement signed", description: "Welcome aboard — taking you into your workspace." });
      await refresh();
      navigate("/app");
    } catch (e: any) {
      toast({ title: "Could not sign", description: e.message || String(e), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <ProgressHeader
        stepIndex={1}
        title={agreementTitle}
        subtitle="Read the full agreement. Scroll to the end to unlock signing — this is the last step before your portal opens."
      />
      <div className="onboard-card p-6 sm:p-8 space-y-6">
        <div className="agreement-body" onScroll={onScroll}>{agreementText || "Loading agreement…"}</div>

        <div className={scrolledToEnd ? "space-y-5" : "space-y-5 opacity-60 pointer-events-none select-none"}>
          {!scrolledToEnd && (
            <p className="text-xs italic" style={{ color: "rgba(8,20,40,0.6)" }}>
              Scroll the agreement to the end to enable signing.
            </p>
          )}

          <div className="space-y-2">
            <Label>Type your full legal name</Label>
            <Input value={typedName} onChange={(e) => setTypedName(e.target.value)} placeholder="Jane A. Doe" />
          </div>

          <div className="space-y-2">
            <Label>Draw your signature (optional but recommended)</Label>
            <SignaturePad onChange={setSigImg} />
          </div>

          <div className="space-y-3">
            <label className="flex items-start gap-3 text-sm">
              <Checkbox checked={readConsent} onCheckedChange={(v) => setReadConsent(!!v)} />
              <span>I have read and agree to the {agreementTitle}.</span>
            </label>
            <label className="flex items-start gap-3 text-sm">
              <Checkbox checked={esignConsent} onCheckedChange={(v) => setEsignConsent(!!v)} />
              <span>
                I consent to use of electronic signatures and electronic records under the
                E-SIGN Act and applicable UETA. My typed name and signature image are my legal signature.
              </span>
            </label>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={submit}
              disabled={!canSubmit}
              style={accent ? { backgroundColor: accent, color: readableTextOn(accent) } : undefined}
            >
              {submitting ? "Signing…" : "Sign & continue"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
