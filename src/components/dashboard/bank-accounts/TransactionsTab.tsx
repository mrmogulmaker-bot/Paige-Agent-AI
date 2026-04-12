import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, Download, Filter, CalendarIcon, RefreshCcw, TrendingUp, TrendingDown } from "lucide-react";
import { format } from "date-fns";

interface Transaction {
  id: string;
  date: Date;
  description: string;
  category: string;
  inflow?: number;
  outflow?: number;
  balance: number;
  pending: boolean;
}

interface TransactionsTabProps {
  transactions: Transaction[];
  cursorStatus: "up-to-date" | "needs-sync";
}

export function TransactionsTab({ transactions, cursorStatus }: TransactionsTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});

  return (
    <div className="space-y-6">
      {/* Status Bar */}
      <Card className="border-border/50 shadow-card bg-gradient-to-r from-primary/5 to-accent/5">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <RefreshCcw className="h-5 w-5 text-accent" />
              <div>
                <p className="font-medium">Sync Status</p>
                <p className="text-sm text-muted-foreground">
                  {cursorStatus === "up-to-date"
                    ? "All transactions synced"
                    : "New transactions available"}
                </p>
              </div>
            </div>
            <Badge
              className={
                cursorStatus === "up-to-date"
                  ? "bg-success/10 text-success"
                  : "bg-warning/10 text-warning"
              }
            >
              {cursorStatus === "up-to-date" ? "Up to Date" : "Needs Sync"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card className="border-border/50 shadow-card">
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search transactions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="justify-start">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, "LLL dd")} - {format(dateRange.to, "LLL dd")}
                      </>
                    ) : (
                      format(dateRange.from, "LLL dd, yyyy")
                    )
                  ) : (
                    "Date Range"
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={dateRange.from && dateRange.to ? { from: dateRange.from, to: dateRange.to } : undefined}
                  onSelect={(range) => setDateRange(range || {})}
                />
              </PopoverContent>
            </Popover>
            <Button variant="outline">
              <Filter className="mr-2 h-4 w-4" />
              Category Filter
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Action Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Export Transactions
        </Button>
        <Button variant="outline">
          <RefreshCcw className="mr-2 h-4 w-4" />
          Sync Now
        </Button>
      </div>

      {/* Transactions Table */}
      <Card className="border-border/50 shadow-card">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50">
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Inflow</TableHead>
                  <TableHead className="text-right">Outflow</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((txn) => (
                  <TableRow key={txn.id} className="border-border/50 hover:bg-muted/30">
                    <TableCell className="font-medium">
                      {format(txn.date, "MMM dd, yyyy")}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{txn.description}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {txn.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {txn.inflow ? (
                        <span className="font-semibold text-success flex items-center justify-end gap-1">
                          <TrendingUp className="h-4 w-4" />
                          ${txn.inflow.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {txn.outflow ? (
                        <span className="font-semibold text-destructive flex items-center justify-end gap-1">
                          <TrendingDown className="h-4 w-4" />
                          ${txn.outflow.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      ${txn.balance.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {txn.pending ? (
                        <Badge className="bg-warning/10 text-warning">Pending</Badge>
                      ) : (
                        <Badge className="bg-success/10 text-success">Posted</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Insight Card */}
      <Card className="border-border/50 shadow-card bg-gradient-to-br from-accent/5 to-gold/5">
        <CardContent className="pt-6">
          <p className="text-sm font-medium text-accent flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Cash tells the truth—let's read it.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
