import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, Plus, ChevronDown, ChevronRight, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AddBusinessDialog } from "./AddBusinessDialog";

interface Business {
  id: string;
  legal_name: string;
  business_type: 'holding' | 'parent' | 'subsidiary' | 'standalone';
  parent_business_id: string | null;
  organizational_level: number;
  display_order: number;
  entity_type: string;
  ein: string;
  child_count: number;
}

export function BusinessOrganizationChart() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedParent, setSelectedParent] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadHierarchy();
  }, []);

  const loadHierarchy = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase.rpc('get_business_hierarchy', {
      _user_id: user.id
    });

    if (error) {
      toast({
        title: "Error loading businesses",
        description: error.message,
        variant: "destructive"
      });
      return;
    }

    setBusinesses(data || []);
    // Auto-expand all nodes initially
    const allIds = new Set(data?.map((b: Business) => b.id) || []);
    setExpandedNodes(allIds);
  };

  const toggleNode = (id: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedNodes(newExpanded);
  };

  const getBusinessIcon = (type: string) => {
    const iconClass = "w-4 h-4";
    switch (type) {
      case 'holding':
        return <Building2 className={`${iconClass} text-gold`} />;
      case 'parent':
        return <Building2 className={`${iconClass} text-primary`} />;
      case 'subsidiary':
        return <Building2 className={`${iconClass} text-muted-foreground`} />;
      default:
        return <Building2 className={iconClass} />;
    }
  };

  const renderBusiness = (business: Business, level: number = 0) => {
    const children = businesses.filter(b => b.parent_business_id === business.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedNodes.has(business.id);

    return (
      <div key={business.id} className="mb-2">
        <div 
          className="flex items-center gap-2 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
          style={{ marginLeft: `${level * 24}px` }}
        >
          {hasChildren && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => toggleNode(business.id)}
            >
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </Button>
          )}
          {!hasChildren && <div className="w-6" />}
          
          {getBusinessIcon(business.business_type)}
          
          <div className="flex-1">
            <div className="font-medium">{business.legal_name}</div>
            <div className="text-xs text-muted-foreground capitalize">
              {business.business_type} • {business.entity_type || 'N/A'}
              {business.ein && ` • EIN: ***-**${business.ein.slice(-4)}`}
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedParent(business.id);
              setShowAddDialog(true);
            }}
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Subsidiary
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.href = `/app/business?business=${business.id}`}
          >
            <FileText className="w-4 h-4 mr-1" />
            Files
          </Button>
        </div>

        {hasChildren && isExpanded && (
          <div className="mt-1">
            {children.map(child => renderBusiness(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const rootBusinesses = businesses.filter(b => !b.parent_business_id);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-6 h-6 text-gold" />
                Business Organization Chart
              </CardTitle>
              <CardDescription>
                Manage your holdings, parent companies, and subsidiaries
              </CardDescription>
            </div>
            <Button onClick={() => {
              setSelectedParent(null);
              setShowAddDialog(true);
            }}>
              <Plus className="w-4 h-4 mr-2" />
              Add Business
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {rootBusinesses.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Building2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="mb-4">No businesses yet. Start by adding your first business entity.</p>
              <Button onClick={() => setShowAddDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Your First Business
              </Button>
            </div>
          ) : (
            <div className="space-y-1">
              {rootBusinesses.map(business => renderBusiness(business))}
            </div>
          )}
        </CardContent>
      </Card>

      <AddBusinessDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        parentBusinessId={selectedParent}
        onSuccess={loadHierarchy}
      />
    </>
  );
}
