import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const generateInvoiceHTML = (order: any, user: any) => {
  const invoiceDate = new Date(order.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Invoice #${order.id.slice(0, 8).toUpperCase()}</title>
  <style>
    body {
      font-family: 'Helvetica Neue', Arial, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px;
      color: #333;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: start;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 3px solid #CFAE70;
    }
    .logo {
      font-size: 32px;
      font-weight: bold;
      background: linear-gradient(135deg, #CFAE70 0%, #E8D4A0 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .invoice-info {
      text-align: right;
    }
    .invoice-title {
      font-size: 24px;
      font-weight: bold;
      margin-bottom: 8px;
    }
    .invoice-number {
      color: #666;
      font-size: 14px;
    }
    .details-section {
      display: flex;
      justify-content: space-between;
      margin: 40px 0;
    }
    .detail-block h3 {
      font-size: 12px;
      text-transform: uppercase;
      color: #999;
      margin-bottom: 8px;
    }
    .detail-block p {
      margin: 4px 0;
      font-size: 14px;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin: 40px 0;
    }
    .items-table th {
      background: #f8f9fa;
      padding: 12px;
      text-align: left;
      font-size: 12px;
      text-transform: uppercase;
      color: #666;
      border-bottom: 2px solid #dee2e6;
    }
    .items-table td {
      padding: 16px 12px;
      border-bottom: 1px solid #dee2e6;
    }
    .total-section {
      margin-top: 40px;
      text-align: right;
    }
    .total-row {
      display: flex;
      justify-content: flex-end;
      margin: 8px 0;
      font-size: 14px;
    }
    .total-row.final {
      font-size: 20px;
      font-weight: bold;
      margin-top: 16px;
      padding-top: 16px;
      border-top: 2px solid #dee2e6;
    }
    .total-label {
      width: 120px;
      text-align: right;
      margin-right: 40px;
    }
    .total-value {
      width: 120px;
      text-align: right;
    }
    .footer {
      margin-top: 60px;
      padding-top: 20px;
      border-top: 1px solid #dee2e6;
      text-align: center;
      color: #999;
      font-size: 12px;
    }
    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      background: ${order.status === "completed" ? "#d4edda" : "#fff3cd"};
      color: ${order.status === "completed" ? "#155724" : "#856404"};
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">PaigeAgent.ai</div>
      <p style="color: #666; margin-top: 4px;">Mogul Maker Academy</p>
    </div>
    <div class="invoice-info">
      <div class="invoice-title">INVOICE</div>
      <div class="invoice-number">#${order.id.slice(0, 8).toUpperCase()}</div>
      <div style="margin-top: 8px;">
        <span class="status-badge">${order.status.toUpperCase()}</span>
      </div>
    </div>
  </div>

  <div class="details-section">
    <div class="detail-block">
      <h3>Billed To</h3>
      <p><strong>${user.email}</strong></p>
      <p>${user.user_metadata?.full_name || "N/A"}</p>
    </div>
    <div class="detail-block">
      <h3>Invoice Details</h3>
      <p><strong>Date:</strong> ${invoiceDate}</p>
      <p><strong>Invoice #:</strong> ${order.id.slice(0, 8).toUpperCase()}</p>
    </div>
  </div>

  <table class="items-table">
    <thead>
      <tr>
        <th>Description</th>
        <th>Plan</th>
        <th>Amount</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>
          <strong>PaigeAgent.ai Subscription</strong><br>
          <span style="color: #666; font-size: 12px;">Monthly subscription - ${order.plan_type.charAt(0).toUpperCase() + order.plan_type.slice(1)} Plan</span>
        </td>
        <td>${order.plan_type.charAt(0).toUpperCase() + order.plan_type.slice(1)}</td>
        <td>$${(Number(order.amount) / 100).toFixed(2)}</td>
      </tr>
    </tbody>
  </table>

  <div class="total-section">
    <div class="total-row">
      <div class="total-label">Subtotal:</div>
      <div class="total-value">$${(Number(order.amount) / 100).toFixed(2)}</div>
    </div>
    <div class="total-row">
      <div class="total-label">Tax (0%):</div>
      <div class="total-value">$0.00</div>
    </div>
    <div class="total-row final">
      <div class="total-label">Total:</div>
      <div class="total-value">$${(Number(order.amount) / 100).toFixed(2)} ${order.currency.toUpperCase()}</div>
    </div>
  </div>

  <div class="footer">
    <p>Thank you for your business!</p>
    <p>Questions? Contact us at support@paigeagent.ai</p>
    <p style="margin-top: 20px;">PaigeAgent.ai - Mogul Maker Academy</p>
  </div>
</body>
</html>
  `;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw userError;
    const user = userData.user;
    if (!user) throw new Error("User not authenticated");

    const { orderId } = await req.json();
    if (!orderId) throw new Error("Order ID is required");

    // Fetch order details
    const { data: order, error: orderError } = await supabaseClient
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .eq("user_id", user.id)
      .single();

    if (orderError || !order) throw new Error("Order not found");

    // Generate HTML invoice
    const invoiceHTML = generateInvoiceHTML(order, user);

    // Return HTML that can be printed or saved as PDF
    return new Response(
      JSON.stringify({
        invoiceHTML,
        invoiceUrl: `data:text/html;base64,${btoa(invoiceHTML)}`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error generating invoice:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to generate invoice";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
