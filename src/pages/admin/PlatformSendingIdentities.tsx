/**
 * Platform → Sending Identities (#123)
 * The operator's live view of every tenant's email sending identity — the From
 * name + address each tenant's mail actually goes out as, on the platform's shared
 * verified domain (or a tenant's own verified domain once it upgrades). Owner-only.
 *
 * "See them live": rows are the real resolved identities (list_tenant_sender_identities),
 * and the edit sheet writes through set_tenant_email_identity — the same Paige-governable
 * seam, no raw table writes. §9 platform/tenant seam, §11 primitive layer.
 */
import { useEffect, useMemo, useState } from "react";
import { Mail, Send, Globe, ShieldAlert, AtSign, CornerUpLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import {
  PageShell, PageHeader, StatRow, StatTile, SectionCard,
  DataTableShell, EmptyState, Toolbar, StatePill, type Column,
} from "@/components/ui/page";
import { useTenantContext } from "@/hooks/useTenantContext";
import { PLATFORM } from "@/lib/platform/identity";

type Identity = {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  from_name: string;
  from_address: string;
  reply_to: string;
  domain: string;
  kind: "shared" | "custom_domain" | "platform";
  source: "shared" | "custom_domain" | "platform_default";
  status: "active" | "disabled";
};

type Settings = { shared_domain: string; default_from_name: string; default_reply_to: string };

const SOURCE_LABEL: Record<Identity["source"], string> = {
  shared: "Shared domain",
  custom_domain: "Custom domain",
  platform_default: "Platform default",
};

export default function PlatformSendingIdentities() {
  const { isPlatformOwner, loading: ctxLoading } = useTenantContext();
  const { toast } = useToast();
  const [rows, setRows] = useState<Identity[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Identity | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [list, cfg] = await Promise.all([
        (supabase as any).rpc("list_tenant_sender_identities"),
        (supabase as any).rpc("get_platform_email_settings"),
      ]);
      if (list?.error || cfg?.error) {
        toast({
          title: "Couldn't load sending identities",
          description: (list?.error ?? cfg?.error)?.message ?? "Please try again.",
          variant: "destructive",
        });
        return; // keep whatever we had rather than blanking to a false "no tenants"
      }
      setRows(Array.isArray(list?.data) ? (list.data as Identity[]) : []);
      setSettings((cfg?.data as Settings) ?? null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ctxLoading || !isPlatformOwner) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxLoading, isPlatformOwner]);

  const totals = useMemo(() => rows.reduce(
    (a, r) => ({
      total: a.total + 1,
      shared: a.shared + (r.source === "shared" ? 1 : 0),
      custom: a.custom + (r.source === "custom_domain" ? 1 : 0),
    }),
    { total: 0, shared: 0, custom: 0 },
  ), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      r.tenant_name.toLowerCase().includes(q) ||
      r.from_address.toLowerCase().includes(q) ||
      r.from_name.toLowerCase().includes(q));
  }, [rows, query]);

  if (ctxLoading) {
    return (
      <PageShell width="wide">
        <div className="text-muted-foreground text-sm">Loading sending identities…</div>
      </PageShell>
    );
  }

  if (!isPlatformOwner) {
    return (
      <PageShell width="narrow">
        <SectionCard title="Platform owner only" icon={ShieldAlert}>
          <p className="text-sm text-muted-foreground">
            This area is restricted to the platform owner. If you manage a tenant,
            head to <strong>Settings → Workspace</strong> instead.
          </p>
        </SectionCard>
      </PageShell>
    );
  }

  const columns: Column[] = [
    { key: "tenant", header: "Tenant" },
    { key: "from", header: "Sends as" },
    { key: "reply", header: "Reply-to" },
    { key: "source", header: "Source" },
    { key: "status", header: "Status" },
  ];

  return (
    <PageShell width="wide">
      <PageHeader
        variant="hero"
        eyebrow="Platform · Email"
        title="Sending Identities"
        description={`Every tenant on ${PLATFORM.name} sends live from its own identity. New workspaces are provisioned automatically — no DNS setup.`}
      />

      <StatRow cols={3}>
        <StatTile label="Live identities" value={totals.total} icon={Send} loading={loading} />
        <StatTile label="On shared domain" value={totals.shared} icon={Mail} loading={loading} />
        <StatTile label="Own domain" value={totals.custom} icon={Globe} loading={loading} />
      </StatRow>

      {settings && (
        <SectionCard
          icon={Globe}
          title="Shared sending domain"
          description="Tenants without their own verified domain send from this platform domain — their mail lands from day one."
        >
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="inline-flex items-center gap-2">
              <span className="text-muted-foreground">Domain</span>
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{settings.shared_domain}</code>
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="text-muted-foreground">Default reply-to</span>
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{settings.default_reply_to}</code>
            </span>
          </div>
        </SectionCard>
      )}

      <Toolbar>
        <h2 className="font-display text-base font-semibold text-foreground">All identities</h2>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tenant or address…"
          className="max-w-[240px] h-9"
          aria-label="Search identities"
        />
      </Toolbar>

      <DataTableShell
        columns={columns}
        loading={loading}
        isEmpty={filtered.length === 0}
        empty={
          <EmptyState
            icon={Mail}
            title={rows.length === 0 ? "No tenants yet" : "No identities match your search"}
            description={
              rows.length === 0
                ? "The moment a workspace signs on, its sending identity is provisioned and appears here."
                : "Clear the search to see them all."
            }
          />
        }
      >
        {filtered.map((r) => (
          <TableRow
            key={r.tenant_id}
            className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            tabIndex={0}
            role="button"
            aria-label={`Edit sending identity for ${r.tenant_name}`}
            onClick={() => setEditing(r)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEditing(r); } }}
          >
            <TableCell>
              <div className="font-medium">{r.tenant_name}</div>
              <div className="text-xs text-muted-foreground">/{r.tenant_slug}</div>
            </TableCell>
            <TableCell>
              <div className="font-medium">{r.from_name}</div>
              <div className="font-mono text-xs text-muted-foreground">{r.from_address}</div>
            </TableCell>
            <TableCell>
              <span className="font-mono text-xs text-muted-foreground">{r.reply_to}</span>
            </TableCell>
            <TableCell>
              <span className="text-xs text-muted-foreground">{SOURCE_LABEL[r.source]}</span>
            </TableCell>
            <TableCell>
              <StatePill state={r.status === "active" ? "success" : "off"}>
                {r.status === "active" ? "Live" : "Off"}
              </StatePill>
            </TableCell>
          </TableRow>
        ))}
      </DataTableShell>

      <EditIdentitySheet
        identity={editing}
        sharedDomain={settings?.shared_domain ?? "paigeagent.ai"}
        onOpenChange={(v) => { if (!v) setEditing(null); }}
        onSaved={() => { setEditing(null); load(); }}
        toast={toast}
      />
    </PageShell>
  );
}

function EditIdentitySheet({
  identity, sharedDomain, onOpenChange, onSaved, toast,
}: {
  identity: Identity | null;
  sharedDomain: string;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [fromName, setFromName] = useState("");
  const [localPart, setLocalPart] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!identity) return;
    setFromName(identity.from_name ?? "");
    setLocalPart(identity.from_address.split("@")[0] ?? "");
    setReplyTo(identity.reply_to ?? "");
  }, [identity]);

  const isCustom = identity?.source === "custom_domain";
  const previewAddr = isCustom ? identity!.from_address : `${localPart || "…"}@${sharedDomain}`;

  const save = async () => {
    if (!identity) return;
    setSaving(true);
    const { error } = await (supabase as any).rpc("set_tenant_email_identity", {
      p_tenant_id: identity.tenant_id,
      p_from_name: fromName || null,
      // On a custom domain the local part is owned by the verified-domain record, not this identity.
      p_local_part: isCustom ? null : (localPart || null),
      p_reply_to: replyTo || null,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Sending identity updated", description: `${identity.tenant_name} now sends as ${fromName || identity.from_name}.` });
    onSaved();
  };

  return (
    <Sheet open={!!identity} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>Sending identity</SheetTitle>
          <SheetDescription>
            {identity ? `How ${identity.tenant_name}'s email goes out.` : ""}
          </SheetDescription>
        </SheetHeader>

        {identity && (
          <div className="mt-4 flex-1 space-y-5 overflow-y-auto">
            {/* Live preview of the From header */}
            <div className="rounded-[var(--radius)] border border-border bg-muted/40 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Sends as</p>
              <p className="mt-1 text-sm font-medium">{fromName || identity.from_name}</p>
              <p className="font-mono text-xs text-muted-foreground">{previewAddr}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="from-name">From name</Label>
              <Input id="from-name" value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Acme Advisory" />
              <p className="text-xs text-muted-foreground">The display name recipients see.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor={isCustom ? undefined : "local-part"} className="flex items-center gap-1.5"><AtSign className="h-3.5 w-3.5" /> Mailbox</Label>
              {isCustom ? (
                <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  This tenant uses its own verified domain. The mailbox is managed on its domain record.
                </p>
              ) : (
                <>
                  <div className="flex items-center gap-1">
                    <Input id="local-part" value={localPart} onChange={(e) => setLocalPart(e.target.value)} placeholder="acme" className="font-mono" />
                    <span className="whitespace-nowrap font-mono text-sm text-muted-foreground">@{sharedDomain}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">We tidy this into a valid mailbox automatically.</p>
                </>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="reply-to" className="flex items-center gap-1.5"><CornerUpLeft className="h-3.5 w-3.5" /> Reply-to</Label>
              <Input id="reply-to" type="email" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="hello@acme.com" />
              <p className="text-xs text-muted-foreground">Where replies land. Leave blank to use the platform default.</p>
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button variant="gold" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save identity"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
