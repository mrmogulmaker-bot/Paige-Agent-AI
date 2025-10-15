import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Building2, MoreVertical, Eye, Edit2, Star, Unlink, RefreshCcw, Download, Search } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Account {
  id: string;
  institution: string;
  accountName: string;
  type: string;
  currentBalance: number;
  available?: number;
  lastSync: Date;
  status: "connected" | "relink_needed";
  isPrimary?: boolean;
}

interface AccountsTabProps {
  accounts: Account[];
  onRefresh: (accountId: string) => void;
  onDisconnect: (accountId: string) => void;
}

export function AccountsTab({ accounts, onRefresh, onDisconnect }: AccountsTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredAccounts = accounts.filter((account) => {
    const matchesSearch =
      account.institution.toLowerCase().includes(searchQuery.toLowerCase()) ||
      account.accountName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === "all" || account.type === typeFilter;
    const matchesStatus = statusFilter === "all" || account.status === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card className="border-border/50 shadow-card">
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search institutions or accounts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Account Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="checking">Checking</SelectItem>
                <SelectItem value="savings">Savings</SelectItem>
                <SelectItem value="credit">Credit</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="connected">Connected</SelectItem>
                <SelectItem value="relink_needed">Relink Needed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Actions Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline">
          <RefreshCcw className="mr-2 h-4 w-4" />
          Refresh Selected
        </Button>
        <Button variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Export Selected
        </Button>
      </div>

      {/* Accounts Table */}
      <Card className="border-border/50 shadow-card">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Connected Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50">
                  <TableHead>Institution</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Current Balance</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead>Last Sync</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAccounts.map((account) => (
                  <TableRow key={account.id} className="border-border/50 hover:bg-muted/30">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gradient-primary flex items-center justify-center">
                          <Building2 className="h-5 w-5 text-primary-foreground" />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{account.institution}</span>
                          {account.isPrimary && <Star className="h-4 w-4 text-gold fill-gold" />}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{account.accountName}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {account.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      ${account.currentBalance.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {account.available ? `$${account.available.toLocaleString()}` : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(account.lastSync, { addSuffix: true })}
                    </TableCell>
                    <TableCell>
                      {account.status === "connected" ? (
                        <Badge className="bg-success/10 text-success hover:bg-success/20">Connected</Badge>
                      ) : (
                        <Badge className="bg-warning/10 text-warning hover:bg-warning/20">Relink Needed</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem>
                            <Eye className="mr-2 h-4 w-4" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Edit2 className="mr-2 h-4 w-4" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Star className="mr-2 h-4 w-4" />
                            Set as Primary
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onRefresh(account.id)}>
                            <RefreshCcw className="mr-2 h-4 w-4" />
                            Sync Now
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => onDisconnect(account.id)}
                          >
                            <Unlink className="mr-2 h-4 w-4" />
                            Disconnect
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Empty State */}
      {filteredAccounts.length === 0 && (
        <Card className="border-2 border-dashed border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-semibold mb-2">No accounts found</p>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              {searchQuery || typeFilter !== "all" || statusFilter !== "all"
                ? "Try adjusting your filters"
                : "Connect your first bank account to get started"}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
