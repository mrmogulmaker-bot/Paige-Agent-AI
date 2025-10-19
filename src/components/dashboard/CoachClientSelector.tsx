import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Users, UserCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Client {
  id: string;
  client_user_id: string;
  status: string;
  profiles: {
    full_name: string;
    email: string;
  };
}

interface CoachClientSelectorProps {
  onClientChange: (clientId: string | null) => void;
  selectedClientId: string | null;
}

export const CoachClientSelector = ({ onClientChange, selectedClientId }: CoachClientSelectorProps) => {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // First get coach clients
      const { data: coachClients, error: clientError } = await supabase
        .from('coach_clients')
        .select('id, client_user_id, status')
        .eq('coach_user_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (clientError) throw clientError;

      // Then get profile data for each client
      if (coachClients && coachClients.length > 0) {
        const clientIds = coachClients.map(c => c.client_user_id);
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', clientIds);

        if (profilesError) throw profilesError;

        // Combine the data
        const profilesMap = new Map(profilesData?.map(p => [p.user_id, p]) || []);
        const combinedData = coachClients.map(client => ({
          ...client,
          profiles: {
            full_name: profilesMap.get(client.client_user_id)?.full_name || '',
            email: ''
          }
        }));

        setClients(combinedData);
      } else {
        setClients([]);
      }
    } catch (error: any) {
      toast({
        title: "Error loading clients",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-4 mb-4">
      <div className="flex items-center gap-4">
        <Users className="h-5 w-5 text-muted-foreground" />
        <Select
          value={selectedClientId || "all"}
          onValueChange={(value) => onClientChange(value === "all" ? null : value)}
        >
          <SelectTrigger className="w-[250px]">
            <SelectValue placeholder="Select client" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                All Clients
              </div>
            </SelectItem>
            {clients.map((client) => (
              <SelectItem key={client.id} value={client.client_user_id}>
                <div className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4" />
                  {client.profiles.full_name || client.profiles.email}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedClientId && (
          <span className="text-sm text-muted-foreground">
            Viewing client data
          </span>
        )}
      </div>
    </Card>
  );
};
