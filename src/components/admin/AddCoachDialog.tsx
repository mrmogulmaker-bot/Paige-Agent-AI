import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAdded?: () => void;
}

interface UserRow { id: string; email: string | null; full_name?: string | null; }

export function AddCoachDialog({ open, onOpenChange, onAdded }: Props) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // invite form
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (!open) { setSelected(null); setFilter(""); setEmail(""); return; }
    (async () => {
      const { data, error } = await supabase.functions.invoke("admin-list-users");
      if (error) return;
      const list = (data?.users ?? []) as UserRow[];
      const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", list.map((u) => u.id));
      const byId = new Map((profs ?? []).map((p: any) => [p.user_id, p.full_name]));
      setUsers(list.map((u) => ({ ...u, full_name: byId.get(u.id) ?? null })));
    })();
  }, [open]);

  const promote = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("user_roles").upsert(
        { user_id: selected, role: "coach" },
        { onConflict: "user_id,role" }
      );
      if (error) throw error;
      toast.success("Coach role granted");
      onAdded?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to grant coach role");
    } finally { setBusy(false); }
  };

  const invite = async () => {
    if (!email) return;
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { error } = await supabase.functions.invoke("send-admin-invitation", {
        body: { email, role: "coach" },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (error) throw error;
      toast.success(`Coach invitation sent to ${email}`);
      onAdded?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to send invite");
    } finally { setBusy(false); }
  };

  const filtered = users.filter((u) => {
    const f = filter.toLowerCase();
    return !f || (u.email || "").toLowerCase().includes(f) || (u.full_name || "").toLowerCase().includes(f);
  }).slice(0, 50);

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add coach</DialogTitle>
          <DialogDescription>Promote an existing user or send an email invite.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="promote">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="promote">Promote user</TabsTrigger>
            <TabsTrigger value="invite">Invite new</TabsTrigger>
          </TabsList>
          <TabsContent value="promote" className="space-y-3 pt-3">
            <Command shouldFilter={false} className="rounded-md border">
              <CommandInput placeholder="Search users by name or email…" value={filter} onValueChange={setFilter} />
              <CommandList>
                <CommandEmpty>No users found.</CommandEmpty>
                <CommandGroup>
                  {filtered.map((u) => (
                    <CommandItem
                      key={u.id}
                      value={u.id}
                      onSelect={() => setSelected(u.id)}
                      className={selected === u.id ? "bg-accent" : ""}
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">{u.full_name || u.email || u.id}</span>
                        <span className="text-xs text-muted-foreground">{u.email}</span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
              <Button onClick={promote} disabled={!selected || busy}>{busy ? "Granting…" : "Grant coach role"}</Button>
            </DialogFooter>
          </TabsContent>
          <TabsContent value="invite" className="space-y-3 pt-3">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="coach@example.com" />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
              <Button onClick={invite} disabled={!email || busy}>{busy ? "Sending…" : "Send invite"}</Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
