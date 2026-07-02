import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Copy, RefreshCw, Plus, Trash2, ChevronDown, ChevronRight, Eye, Check, X, Loader2 } from "lucide-react";
import { format } from "date-fns";

const OUTBOUND_EVENTS = [
  { value: "client_created", label: "Client Created" },
  { value: "score_changed", label: "Score Changed (±50 pts)" },
  { value: "milestone_completed", label: "Milestone Completed" },
  { value: "dispute_letter_generated", label: "Dispute Letter Generated" },
  { value: "lender_match_completed", label: "Lender Match Completed" },
  { value: "funding_logged", label: "Funding Logged" },
  { value: "outreach_draft_generated", label: "Outreach Draft Generated" },
];

const INBOUND_ACTIONS = [
  { action: "create_client", fields: "first_name, last_name, email, phone, entity_name, entity_type, funding_goal, notes", example: '{"action":"create_client","data":{"first_name":"Jane","last_name":"Smith","email":"jane@example.com","phone":"555-0100","entity_name":"Smith LLC","entity_type":"llc","funding_goal":"50000"}}' },
  { action: "update_client_profile", fields: "client_id, full_name, phone, address", example: '{"action":"update_client_profile","data":{"client_id":"uuid","full_name":"Jane Smith","phone":"555-0101"}}' },
  { action: "complete_milestone", fields: "client_id, milestone_name", example: '{"action":"complete_milestone","data":{"client_id":"uuid","milestone_name":"EIN Obtained"}}' },
  { action: "add_activity_note", fields: "client_id, note", example: '{"action":"add_activity_note","data":{"client_id":"uuid","note":"Client completed onboarding call"}}' },
  { action: "log_funding", fields: "client_id, amount, lender_name, product_type, date_secured", example: '{"action":"log_funding","data":{"client_id":"uuid","amount":25000,"lender_name":"Chase","product_type":"business_credit_line","date_secured":"2026-04-10"}}' },
  { action: "trigger_score_recalculation", fields: "client_id", example: '{"action":"trigger_score_recalculation","data":{"client_id":"uuid"}}' },
];

const OUTBOUND_EXAMPLES: Record<string, string> = {
  client_created: '{"event":"client_created","timestamp":"2026-04-11T12:00:00Z","platform":"paige_agent","data":{"client_id":"uuid","email":"jane@example.com","name":"Jane Smith"}}',
  score_changed: '{"event":"score_changed","timestamp":"2026-04-11T12:00:00Z","platform":"paige_agent","data":{"client_id":"uuid","old_score":520,"new_score":580,"direction":"up"}}',
  milestone_completed: '{"event":"milestone_completed","timestamp":"2026-04-11T12:00:00Z","platform":"paige_agent","data":{"client_id":"uuid","milestone_name":"EIN Obtained"}}',
  dispute_letter_generated: '{"event":"dispute_letter_generated","timestamp":"2026-04-11T12:00:00Z","platform":"paige_agent","data":{"client_id":"uuid","item_disputed":"Late Payment - Chase"}}',
  lender_match_completed: '{"event":"lender_match_completed","timestamp":"2026-04-11T12:00:00Z","platform":"paige_agent","data":{"client_id":"uuid","matches_found":8}}',
  funding_logged: '{"event":"funding_logged","timestamp":"2026-04-11T12:00:00Z","platform":"paige_agent","data":{"client_id":"uuid","lender_name":"Chase","amount":25000,"product_type":"business_credit_line"}}',
  outreach_draft_generated: '{"event":"outreach_draft_generated","timestamp":"2026-04-11T12:00:00Z","platform":"paige_agent","data":{"client_id":"uuid","outreach_type":"lender_introduction"}}',
};

export const WebhooksIntegrations = () => {
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [apiKeyPrefix, setApiKeyPrefix] = useState<string | null>(null);
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const [webhookConfigs, setWebhookConfigs] = useState<any[]>([]);
  const [eventLog, setEventLog] = useState<any[]>([]);
  const [newWebhook, setNewWebhook] = useState({ label: "", url: "", events: [] as string[] });
  const [showAddWebhook, setShowAddWebhook] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/handle-inbound-webhook`;

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    await Promise.all([loadApiKey(), loadWebhookConfigs(), loadEventLog()]);
    setLoading(false);
  };

  const loadApiKey = async () => {
    const { data } = await supabase
      .from("platform_api_keys")
      .select("key_prefix, is_active")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1);
    if (data && data.length > 0) {
      setApiKeyPrefix(data[0].key_prefix);
    }
  };

  const loadWebhookConfigs = async () => {
    const { data } = await supabase
      .from("outbound_webhook_configs")
      .select("*")
      .eq("is_active", true)
      .order("created_at");
    setWebhookConfigs(data || []);
  };

  const loadEventLog = async () => {
    const { data } = await supabase
      .from("webhook_event_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    setEventLog(data || []);
  };

  const generateApiKey = async () => {
    setIsGeneratingKey(true);
    try {
      // Generate a random API key
      const array = new Uint8Array(32);
      crypto.getRandomValues(array);
      const key = "pme_" + Array.from(array).map(b => b.toString(16).padStart(2, "0")).join("");
      const prefix = key.substring(0, 12) + "...";

      // Hash it
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(key));
      const keyHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");

      // Deactivate old keys
      await supabase.from("platform_api_keys").update({ is_active: false, revoked_at: new Date().toISOString() }).eq("is_active", true);

      // Store new key
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("platform_api_keys").insert({
        key_hash: keyHash,
        key_prefix: prefix,
        created_by: user!.id,
      });

      setApiKey(key);
      setApiKeyPrefix(prefix);
      toast({ title: "API Key Generated", description: "Copy it now — it won't be shown again." });
    } catch (e) {
      toast({ title: "Error", description: "Failed to generate API key", variant: "destructive" });
    }
    setIsGeneratingKey(false);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied!", description: `${label} copied to clipboard` });
  };

  const addWebhookConfig = async () => {
    if (!newWebhook.label || !newWebhook.url || newWebhook.events.length === 0) {
      toast({ title: "Error", description: "Label, URL, and at least one event required", variant: "destructive" });
      return;
    }
    if (webhookConfigs.length >= 5) {
      toast({ title: "Limit Reached", description: "Maximum 5 outbound webhooks", variant: "destructive" });
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("outbound_webhook_configs").insert({
      label: newWebhook.label,
      subscribed_events: newWebhook.events,
      created_by: user!.id,
    } as any).select("id").single();
    if (!error && data?.id) {
      await supabase.rpc("platform_set_outbound_webhook_url" as any, { _id: data.id, _url: newWebhook.url });
    }
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setNewWebhook({ label: "", url: "", events: [] });
      setShowAddWebhook(false);
      loadWebhookConfigs();
      toast({ title: "Webhook Added" });
    }
  };


  const deleteWebhookConfig = async (id: string) => {
    await supabase.from("outbound_webhook_configs").update({ is_active: false }).eq("id", id);
    loadWebhookConfigs();
    toast({ title: "Webhook Removed" });
  };

  const toggleEvent = (event: string) => {
    setNewWebhook(prev => ({
      ...prev,
      events: prev.events.includes(event) ? prev.events.filter(e => e !== event) : [...prev.events, event],
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Webhooks & Integrations</h2>
        <p className="text-muted-foreground mt-1">Connect PaigeAgent to Zapier, n8n, Make, and other automation tools.</p>
      </div>

      {/* Inbound Webhooks */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-lg">Inbound Webhooks</CardTitle>
          <CardDescription>Accept data from external automation tools</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm font-medium">Webhook URL</Label>
            <div className="flex gap-2 mt-1">
              <Input value={webhookUrl} readOnly className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={() => copyToClipboard(webhookUrl, "Webhook URL")}>
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium">API Key</Label>
            {apiKey ? (
              <div className="mt-1 space-y-2">
                <div className="flex gap-2">
                  <Input value={apiKey} readOnly className="font-mono text-xs" />
                  <Button variant="outline" size="icon" onClick={() => copyToClipboard(apiKey, "API Key")}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-amber-500">⚠️ Copy this key now — it won't be shown again after you leave this page.</p>
              </div>
            ) : apiKeyPrefix ? (
              <div className="flex items-center gap-2 mt-1">
                <code className="text-sm bg-muted px-2 py-1 rounded">{apiKeyPrefix}</code>
                <Button variant="outline" size="sm" onClick={generateApiKey} disabled={isGeneratingKey}>
                  <RefreshCw className="w-4 h-4 mr-1" /> Regenerate
                </Button>
              </div>
            ) : (
              <div className="mt-1">
                <Button onClick={generateApiKey} disabled={isGeneratingKey}>
                  {isGeneratingKey ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                  Generate API Key
                </Button>
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Include this key in the <code className="bg-muted px-1 rounded">Authorization</code> header as <code className="bg-muted px-1 rounded">Bearer YOUR_API_KEY</code>
          </p>
        </CardContent>
      </Card>

      {/* Outbound Webhooks */}
      <Card className="border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Outbound Webhooks</CardTitle>
            <CardDescription>Send events to external tools when things happen</CardDescription>
          </div>
          {webhookConfigs.length < 5 && (
            <Button size="sm" onClick={() => setShowAddWebhook(!showAddWebhook)}>
              <Plus className="w-4 h-4 mr-1" /> Add Webhook
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {showAddWebhook && (
            <Card className="border-dashed border-primary/30 bg-muted/20">
              <CardContent className="pt-4 space-y-3">
                <Input placeholder="Label (e.g. Zapier CRM Sync)" value={newWebhook.label} onChange={e => setNewWebhook(p => ({ ...p, label: e.target.value }))} />
                <Input placeholder="https://hooks.zapier.com/..." value={newWebhook.url} onChange={e => setNewWebhook(p => ({ ...p, url: e.target.value }))} />
                <div>
                  <Label className="text-sm">Subscribe to events:</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {OUTBOUND_EVENTS.map(evt => (
                      <div key={evt.value} className="flex items-center gap-2">
                        <Checkbox checked={newWebhook.events.includes(evt.value)} onCheckedChange={() => toggleEvent(evt.value)} id={`evt-${evt.value}`} />
                        <label htmlFor={`evt-${evt.value}`} className="text-sm cursor-pointer">{evt.label}</label>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={addWebhookConfig}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowAddWebhook(false)}>Cancel</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {webhookConfigs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No outbound webhooks configured yet.</p>
          ) : (
            <div className="space-y-2">
              {webhookConfigs.map(config => (
                <div key={config.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/10">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">{config.label}</p>
                    <p className="text-xs text-muted-foreground truncate">{config.url}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(config.subscribed_events || []).map((evt: string) => (
                        <Badge key={evt} variant="secondary" className="text-[10px]">{evt}</Badge>
                      ))}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => deleteWebhookConfig(config.id)} className="text-destructive hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Event Log */}
      <Card className="border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Webhook Event Log</CardTitle>
            <CardDescription>Last 100 events</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={loadEventLog}>
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {eventLog.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No webhook events yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {eventLog.map(log => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs font-mono">{format(new Date(log.created_at), "MMM d, HH:mm:ss")}</TableCell>
                      <TableCell>
                        <Badge variant={log.direction === "inbound" ? "default" : "secondary"} className="text-[10px]">
                          {log.direction}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{log.event_type}</TableCell>
                      <TableCell>
                        {log.status === "success" ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : log.status === "failed" ? (
                          <X className="w-4 h-4 text-destructive" />
                        ) : (
                          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="sm" onClick={() => setSelectedLog(log)}>
                              <Eye className="w-4 h-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-lg">
                            <DialogHeader>
                              <DialogTitle>Event Details</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-3 text-sm">
                              <div><strong>Direction:</strong> {log.direction}</div>
                              <div><strong>Event:</strong> {log.event_type}</div>
                              <div><strong>Status:</strong> {log.status} {log.http_status ? `(HTTP ${log.http_status})` : ""}</div>
                              {log.target_url && <div><strong>Target:</strong> <span className="font-mono text-xs break-all">{log.target_url}</span></div>}
                              <div>
                                <strong>Payload:</strong>
                                <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-auto max-h-48">{JSON.stringify(log.request_payload, null, 2)}</pre>
                              </div>
                              {log.response_body && (
                                <div>
                                  <strong>Response:</strong>
                                  <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-auto max-h-32">{log.response_body}</pre>
                                </div>
                              )}
                            </div>
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Integration Guide */}
      <Collapsible open={docsOpen} onOpenChange={setDocsOpen}>
        <Card className="border-border">
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/20 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Integration Guide</CardTitle>
                  <CardDescription>Connect PaigeAgent to Zapier, n8n, and Make</CardDescription>
                </div>
                {docsOpen ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-6 pt-0">
              {/* Authentication */}
              <div>
                <h3 className="font-semibold text-foreground mb-2">Authentication</h3>
                <p className="text-sm text-muted-foreground">All inbound requests must include your API key in the Authorization header:</p>
                <pre className="mt-2 p-3 bg-muted rounded text-xs font-mono overflow-auto">
{`POST ${webhookUrl}
Content-Type: application/json
Authorization: Bearer YOUR_API_KEY

{
  "action": "create_client",
  "data": { ... }
}`}
                </pre>
              </div>

              {/* Inbound Actions */}
              <div>
                <h3 className="font-semibold text-foreground mb-2">Supported Inbound Actions</h3>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Action</TableHead>
                        <TableHead>Required Fields</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {INBOUND_ACTIONS.map(a => (
                        <TableRow key={a.action}>
                          <TableCell className="font-mono text-xs">{a.action}</TableCell>
                          <TableCell className="text-xs">{a.fields}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="mt-3 space-y-2">
                  <h4 className="text-sm font-medium">Example Payloads</h4>
                  {INBOUND_ACTIONS.map(a => (
                    <div key={a.action} className="relative">
                      <p className="text-xs font-medium text-muted-foreground mb-1">{a.action}:</p>
                      <pre className="p-2 bg-muted rounded text-[11px] font-mono overflow-auto">{JSON.stringify(JSON.parse(a.example), null, 2)}</pre>
                      <Button variant="ghost" size="icon" className="absolute top-6 right-1 h-6 w-6" onClick={() => copyToClipboard(a.example, a.action)}>
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Outbound Events */}
              <div>
                <h3 className="font-semibold text-foreground mb-2">Outbound Event Payloads</h3>
                <div className="space-y-2">
                  {OUTBOUND_EVENTS.map(evt => (
                    <div key={evt.value}>
                      <p className="text-xs font-medium text-muted-foreground mb-1">{evt.label} ({evt.value}):</p>
                      <pre className="p-2 bg-muted rounded text-[11px] font-mono overflow-auto">{JSON.stringify(JSON.parse(OUTBOUND_EXAMPLES[evt.value]), null, 2)}</pre>
                    </div>
                  ))}
                </div>
              </div>

              {/* Zapier Setup */}
              <div>
                <h3 className="font-semibold text-foreground mb-2">Setting Up a Zapier Zap</h3>
                <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                  <li>Create a new Zap and select <strong>"Webhooks by Zapier"</strong> as the trigger (for outbound) or action (for inbound).</li>
                  <li><strong>To send data TO PaigeAgent (inbound):</strong> Use "Webhooks by Zapier → POST" as an action. Set the URL to your webhook URL above, add an Authorization header with your Bearer token, and send a JSON body with the action and data fields.</li>
                  <li><strong>To receive data FROM PaigeAgent (outbound):</strong> Use "Webhooks by Zapier → Catch Hook" as a trigger. Copy the Zapier webhook URL and add it as an outbound webhook above, then select which events to subscribe to.</li>
                  <li>Test your Zap by triggering an event or sending a test payload.</li>
                </ol>
              </div>

              {/* n8n Setup */}
              <div>
                <h3 className="font-semibold text-foreground mb-2">Setting Up an n8n Workflow</h3>
                <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                  <li><strong>To send data TO PaigeAgent:</strong> Add an "HTTP Request" node. Set Method to POST, URL to your webhook URL, add an Authorization header (<code>Bearer YOUR_KEY</code>), and configure the JSON body with action and data.</li>
                  <li><strong>To receive data FROM PaigeAgent:</strong> Add a "Webhook" node to your workflow. Copy the webhook URL from n8n, add it as an outbound webhook above, and select events to subscribe to.</li>
                  <li>Activate your workflow in n8n so the webhook node is listening.</li>
                  <li>Test by triggering a subscribed event in PaigeAgent.</li>
                </ol>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
};
