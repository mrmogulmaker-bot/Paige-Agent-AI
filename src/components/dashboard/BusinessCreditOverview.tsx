import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Building2, TrendingUp, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface BusinessCreditOverviewProps {
  onNavigate: () => void;
}

export const BusinessCreditOverview = ({ onNavigate }: BusinessCreditOverviewProps) => {
  const [businessCount, setBusinessCount] = useState(0);
  const [vendorCount, setVendorCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBusinessData();
  }, []);

  const fetchBusinessData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data: businesses } = await supabase
        .from("businesses")
        .select("id")
        .eq("owner_user_id", user.id);

      if (businesses) {
        setBusinessCount(businesses.length);
      }

      const { data: vendors } = await supabase
        .from("business_vendors")
        .select("id")
        .eq("user_id", user.id)
        .eq("is_active", true);

      if (vendors) {
        setVendorCount(vendors.length);
      }

      setLoading(false);
    } catch (error) {
      console.error("Error fetching business data:", error);
      setLoading(false);
    }
  };

  return (
    <Card 
      className="p-6 bg-card border-border shadow-card relative overflow-hidden cursor-pointer hover:shadow-lg transition-shadow" 
      onClick={onNavigate}
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16" />
      
      <div className="relative">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">Business Credit</h2>
            <p className="text-sm text-muted-foreground mt-1">Credit Profile</p>
          </div>
          <Building2 className="w-8 h-8 text-primary" />
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-3">
              <Building2 className="w-5 h-5 text-primary" />
              <div>
                <p className="text-sm font-medium">Active Businesses</p>
                <p className="text-xs text-muted-foreground">Registered entities</p>
              </div>
            </div>
            <span className="text-2xl font-bold text-primary">{businessCount}</span>
          </div>

          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-success" />
              <div>
                <p className="text-sm font-medium">Active Vendors</p>
                <p className="text-xs text-muted-foreground">Trade lines reporting</p>
              </div>
            </div>
            <span className="text-xl font-bold text-success">{vendorCount}</span>
          </div>
        </div>

        <div className="mt-6 p-4 bg-gradient-gold/10 rounded-lg border border-primary/20 flex items-center justify-between">
          <p className="text-sm font-medium text-primary">View Business Credit</p>
          <ArrowRight className="w-5 h-5 text-primary" />
        </div>
      </div>
    </Card>
  );
};
