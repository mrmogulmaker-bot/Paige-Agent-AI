import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Download, Receipt, CreditCard, DollarSign, Calendar, FileText } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface Payment {
  id: string;
  amount: number;
  currency: string;
  status: string;
  plan_type: string;
  created_at: string;
  stripe_session_id: string | null;
}

export function PaymentHistory() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchPayments();
  }, []);

  const fetchPayments = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPayments(data || []);
    } catch (error) {
      console.error("Error fetching payments:", error);
      toast({
        title: "Error",
        description: "Failed to load payment history",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const generateInvoice = async (payment: Payment) => {
    try {
      const { data, error } = await supabase.functions.invoke("generate-invoice", {
        body: { orderId: payment.id },
      });

      if (error) throw error;

      // Open invoice in new tab
      if (data?.invoiceUrl) {
        window.open(data.invoiceUrl, "_blank");
      }

      toast({
        title: "Success",
        description: "Invoice generated successfully",
      });
    } catch (error) {
      console.error("Error generating invoice:", error);
      toast({
        title: "Error",
        description: "Failed to generate invoice",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      completed: "default",
      pending: "secondary",
      failed: "destructive",
      refunded: "outline",
    };
    return (
      <Badge variant={variants[status] || "secondary"}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const totalSpent = payments
    .filter((p) => p.status === "completed")
    .reduce((sum, p) => sum + Number(p.amount), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-foreground">
            Payment History
          </h1>
          <p className="text-muted-foreground mt-2">
            View and manage your payment transactions
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Spent</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold">
                ${(totalSpent / 100).toFixed(2)}
              </span>
              <DollarSign className="w-8 h-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Payments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold">{payments.length}</span>
              <Receipt className="w-8 h-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Active Subscriptions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold">
                {payments.filter((p) => p.status === "completed").length}
              </span>
              <CreditCard className="w-8 h-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payment Table */}
      <Card className="shadow-glow border-primary/20">
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
          <CardDescription>A detailed list of all your payments</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="completed">Completed</TabsTrigger>
              <TabsTrigger value="pending">Pending</TabsTrigger>
              <TabsTrigger value="failed">Failed</TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="mt-6">
              {payments.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <h3 className="text-lg font-semibold mb-2">No payments yet</h3>
                  <p className="text-muted-foreground">
                    Your payment history will appear here
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-muted-foreground" />
                            {format(new Date(payment.created_at), "MMM dd, yyyy")}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          {payment.plan_type.charAt(0).toUpperCase() +
                            payment.plan_type.slice(1)}
                        </TableCell>
                        <TableCell>
                          ${(Number(payment.amount) / 100).toFixed(2)}{" "}
                          {payment.currency.toUpperCase()}
                        </TableCell>
                        <TableCell>{getStatusBadge(payment.status)}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => generateInvoice(payment)}
                            disabled={payment.status !== "completed"}
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Invoice
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            {["completed", "pending", "failed"].map((status) => (
              <TabsContent key={status} value={status} className="mt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments
                      .filter((p) => p.status === status)
                      .map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-muted-foreground" />
                              {format(new Date(payment.created_at), "MMM dd, yyyy")}
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">
                            {payment.plan_type.charAt(0).toUpperCase() +
                              payment.plan_type.slice(1)}
                          </TableCell>
                          <TableCell>
                            ${(Number(payment.amount) / 100).toFixed(2)}{" "}
                            {payment.currency.toUpperCase()}
                          </TableCell>
                          <TableCell>{getStatusBadge(payment.status)}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => generateInvoice(payment)}
                              disabled={payment.status !== "completed"}
                            >
                              <Download className="w-4 h-4 mr-2" />
                              Invoice
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
