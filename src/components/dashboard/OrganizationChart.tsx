import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, Plus, ChevronRight, ChevronDown } from "lucide-react";
import { AddBusinessDialog } from "./AddBusinessDialog";
import { useToast } from "@/hooks/use-toast";

interface Business {
  id: string;
  legal_name: string;
  business_type: "holding" | "parent" | "subsidiary" | "standalone";
  parent_business_id: string | null;
  organizational_level: number;
  display_order: number;
  entity_type: string | null;
  ein: string | null;
  child_count: number;
  children?: Business[];
}

export function OrganizationChart() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedParent, setSelectedParent] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  useEffect(() => {
    loadBusinessHierarchy();
  }, []);

  const loadBusinessHierarchy = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase.rpc("get_business_hierarchy", {
        _user_id: user.id,
      });

      if (error) throw error;

      const tree = buildTree(data || []);
      setBusinesses(tree);
    } catch (error) {
      console.error("Error loading business hierarchy:", error);
      toast({
        title: "Error",
        description: "Failed to load organization chart",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const buildTree = (flatList: Business[]): Business[] => {
    const map = new Map<string, Business>();
    const roots: Business[] = [];

    flatList.forEach((item) => {
      map.set(item.id, { ...item, children: [] });
    });

    flatList.forEach((item) => {
      const node = map.get(item.id)!;
      if (item.parent_business_id) {
        const parent = map.get(item.parent_business_id);
        if (parent) {
          parent.children = parent.children || [];
          parent.children.push(node);
        }
      } else {
        roots.push(node);
      }
    });

    return roots;
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

  const getTypeColor = (type: string) => {
    switch (type) {
      case "holding":
        return "bg-gradient-gold text-black";
      case "parent":
        return "bg-primary text-primary-foreground";
      case "subsidiary":
        return "bg-secondary text-secondary-foreground";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const renderBusinessNode = (business: Business, level: number = 0) => {
    const hasChildren = (business.children?.length ?? 0) > 0;
    const isExpanded = expandedNodes.has(business.id);

    return (
      <div key={business.id} className="space-y-2">
        <Card className={`p-4 ${level > 0 ? "ml-8" : ""}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1">
              {hasChildren && (
                <button
                  onClick={() => toggleNode(business.id)}
                  className="hover:bg-accent rounded p-1"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </button>
              )}
              
              <Building2 className="w-5 h-5 text-muted-foreground" />
              
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{business.legal_name}</h3>
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${getTypeColor(
                      business.business_type
                    )}`}
                  >
                    {business.business_type}
                  </span>
                </div>
                {business.ein && (
                  <p className="text-sm text-muted-foreground">
                    EIN: {business.ein}
                  </p>
                )}
              </div>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSelectedParent(business.id);
                setShowAddDialog(true);
              }}
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Subsidiary
            </Button>
          </div>
        </Card>

        {hasChildren && isExpanded && (
          <div className="space-y-2">
            {business.children?.map((child) =>
              renderBusinessNode(child, level + 1)
            )}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return <div className="text-center py-8">Loading organization chart...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold bg-gradient-gold bg-clip-text text-transparent">
            Organization Chart
          </h2>
          <p className="text-muted-foreground">
            Manage your business structure with Holdings, Parents, and Subsidiaries
          </p>
        </div>
        <Button
          onClick={() => {
            setSelectedParent(null);
            setShowAddDialog(true);
          }}
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Holding/Company
        </Button>
      </div>

      <div className="space-y-4">
        {businesses.length === 0 ? (
          <Card className="p-8 text-center">
            <Building2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No businesses yet</h3>
            <p className="text-muted-foreground mb-4">
              Start building your organizational structure
            </p>
            <Button onClick={() => setShowAddDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Your First Business
            </Button>
          </Card>
        ) : (
          businesses.map((business) => renderBusinessNode(business))
        )}
      </div>

      <AddBusinessDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        parentBusinessId={selectedParent}
        onSuccess={loadBusinessHierarchy}
      />
    </div>
  );
}
