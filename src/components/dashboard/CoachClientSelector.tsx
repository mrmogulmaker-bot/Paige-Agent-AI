import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, UserCheck } from "lucide-react";
import { toast } from "sonner";

interface CoachClient {
  id: string;
  client_user_id: string;
  status: string;
  notes: string | null;
  profiles: {
    full_name: string | null;
  };
}

interface CoachClientSelectorProps {
  onClientSelected: (clientId: string | null) => void;
}

export function CoachClientSelector({ onClientSelected }: CoachClientSelectorProps) {
  const [clients, setClients] = useState<CoachClient[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchClients = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('coach_clients')
        .select('id, client_user_id, status, notes')
        .eq('coach_user_id', user.id)
        .eq('status', 'active');

      if (error) throw error;
      
      // Fetch profile names separately
      if (data && data.length > 0) {
        const clientIds = data.map(c => c.client_user_id);
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', clientIds);

        const profilesMap = new Map(profilesData?.map(p => [p.user_id, p]) || []);
        const clientsWithProfiles = data.map(client => ({
          ...client,
          profiles: profilesMap.get(client.client_user_id) || { full_name: null }
        }));
        setClients(clientsWithProfiles as CoachClient[]);
      }
    } catch (error: any) {
      toast.error("Failed to load clients", {
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const handleClientSelect = (clientId: string) => {
    if (clientId === "all") {
      setSelectedClientId(null);
      onClientSelected(null);
    } else {
      setSelectedClientId(clientId);
      onClientSelected(clientId);
    }
  };

  return (
    <Card className="p-4 mb-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <label className="text-sm font-medium mb-2 block">Viewing Client</label>
          <Select value={selectedClientId || "all"} onValueChange={handleClientSelect}>
            <SelectTrigger>
              <SelectValue placeholder="Select a client" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                <div className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4" />
                  <span>All Clients</span>
                </div>
              </SelectItem>
              {clients.map((client) => (
                <SelectItem key={client.id} value={client.client_user_id}>
                  {client.profiles?.full_name || 'Unknown Client'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </Card>
  );
}