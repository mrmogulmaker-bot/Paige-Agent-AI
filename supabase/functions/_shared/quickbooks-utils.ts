// Shared QuickBooks utilities for OAuth + API calls
// Sandbox: https://sandbox-quickbooks.api.intuit.com
// Production: https://quickbooks.api.intuit.com

export const QB_OAUTH_BASE = "https://oauth.platform.intuit.com/oauth2/v1";
export const QB_AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
export const QB_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
export const QB_REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";

export const QB_API_BASE_SANDBOX = "https://sandbox-quickbooks.api.intuit.com";
export const QB_API_BASE_PRODUCTION = "https://quickbooks.api.intuit.com";

export const QB_SCOPES = "com.intuit.quickbooks.accounting com.intuit.quickbooks.payment";

export function getRedirectUri(): string {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  return `${supabaseUrl}/functions/v1/quickbooks-oauth-callback`;
}

export function getApiBase(environment: string): string {
  return environment === "production" ? QB_API_BASE_PRODUCTION : QB_API_BASE_SANDBOX;
}

export interface QBTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;        // seconds, typically 3600
  x_refresh_token_expires_in: number;
  token_type: string;
}

export async function exchangeAuthCodeForTokens(authCode: string): Promise<QBTokenResponse> {
  const clientId = Deno.env.get("QUICKBOOKS_CLIENT_ID")!;
  const clientSecret = Deno.env.get("QUICKBOOKS_CLIENT_SECRET")!;
  const redirectUri = getRedirectUri();
  const basicAuth = btoa(`${clientId}:${clientSecret}`);

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: authCode,
    redirect_uri: redirectUri,
  });

  const res = await fetch(QB_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`QB token exchange failed [${res.status}]: ${txt}`);
  }
  return await res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<QBTokenResponse> {
  const clientId = Deno.env.get("QUICKBOOKS_CLIENT_ID")!;
  const clientSecret = Deno.env.get("QUICKBOOKS_CLIENT_SECRET")!;
  const basicAuth = btoa(`${clientId}:${clientSecret}`);

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const res = await fetch(QB_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`QB token refresh failed [${res.status}]: ${txt}`);
  }
  return await res.json();
}

export async function revokeToken(token: string): Promise<void> {
  const clientId = Deno.env.get("QUICKBOOKS_CLIENT_ID")!;
  const clientSecret = Deno.env.get("QUICKBOOKS_CLIENT_SECRET")!;
  const basicAuth = btoa(`${clientId}:${clientSecret}`);

  await fetch(QB_REVOKE_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ token }),
  });
}

export async function fetchCompanyInfo(realmId: string, accessToken: string, environment: string) {
  const base = getApiBase(environment);
  const url = `${base}/v3/company/${realmId}/companyinfo/${realmId}?minorversion=70`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`QB CompanyInfo fetch failed [${res.status}]: ${txt}`);
  }
  return await res.json();
}

export async function qbApiGet(realmId: string, accessToken: string, environment: string, path: string) {
  const base = getApiBase(environment);
  const sep = path.includes("?") ? "&" : "?";
  const url = `${base}/v3/company/${realmId}${path}${sep}minorversion=70`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`QB API GET ${path} failed [${res.status}]: ${txt}`);
  }
  return await res.json();
}

export async function qbApiPost(realmId: string, accessToken: string, environment: string, path: string, body: any) {
  const base = getApiBase(environment);
  const sep = path.includes("?") ? "&" : "?";
  const url = `${base}/v3/company/${realmId}${path}${sep}minorversion=70`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`QB API POST ${path} failed [${res.status}]: ${txt}`);
  }
  return await res.json();
}

// ==========================================================
// REPORT PARSING — flatten QB ProfitAndLoss / BalanceSheet
// ==========================================================
type QBRow = any;

function flattenRows(rows: QBRow[] | undefined, acc: { name: string; value: number }[] = []): { name: string; value: number }[] {
  if (!rows) return acc;
  for (const r of rows) {
    if (r.Rows?.Row) {
      flattenRows(r.Rows.Row, acc);
    }
    if (r.ColData && Array.isArray(r.ColData)) {
      const name = r.ColData[0]?.value || "";
      const lastCol = r.ColData[r.ColData.length - 1];
      const val = parseFloat(lastCol?.value || "0") || 0;
      if (name) acc.push({ name, value: val });
    }
    if (r.Summary?.ColData) {
      const name = r.Summary.ColData[0]?.value || "";
      const lastCol = r.Summary.ColData[r.Summary.ColData.length - 1];
      const val = parseFloat(lastCol?.value || "0") || 0;
      if (name) acc.push({ name, value: val });
    }
  }
  return acc;
}

export interface ParsedPnL {
  total_revenue: number;
  total_expenses: number;
  gross_profit: number;
  net_income: number;
  cogs: number;
  operating_expenses: number;
  payroll_expenses: number;
  marketing_expenses: number;
  professional_fees: number;
  top_expense_categories: { name: string; amount: number }[];
}

export function parsePnL(report: any): ParsedPnL {
  const rows = report?.Rows?.Row || [];
  const flat = flattenRows(rows);

  const findByName = (patterns: RegExp[]): number => {
    for (const p of patterns) {
      const found = flat.find((r) => p.test(r.name));
      if (found) return found.value;
    }
    return 0;
  };

  const total_revenue = findByName([/total income/i, /total revenue/i, /total\s+sales/i]);
  const cogs = findByName([/total cost of goods sold/i, /total cogs/i, /cost of goods sold$/i]);
  const gross_profit = findByName([/gross profit/i]) || (total_revenue - cogs);
  const total_expenses = findByName([/total expenses/i, /total operating expenses/i]);
  const net_income = findByName([/net income/i, /net operating income/i]) || (gross_profit - total_expenses);
  const operating_expenses = total_expenses;

  const payroll_expenses = flat
    .filter((r) => /payroll|wages|salaries|salary|compensation/i.test(r.name) && !/total/i.test(r.name))
    .reduce((s, r) => s + r.value, 0);
  const marketing_expenses = flat
    .filter((r) => /marketing|advertising|promotion/i.test(r.name) && !/total/i.test(r.name))
    .reduce((s, r) => s + r.value, 0);
  const professional_fees = flat
    .filter((r) => /professional|legal|accounting|consulting/i.test(r.name) && !/total/i.test(r.name))
    .reduce((s, r) => s + r.value, 0);

  const expenseRows = flat
    .filter((r) => r.value > 0 && !/total|gross|net|income|revenue|sales|cogs/i.test(r.name))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)
    .map((r) => ({ name: r.name, amount: r.value }));

  return {
    total_revenue,
    total_expenses,
    gross_profit,
    net_income,
    cogs,
    operating_expenses,
    payroll_expenses,
    marketing_expenses,
    professional_fees,
    top_expense_categories: expenseRows,
  };
}

export interface ParsedBS {
  cash_and_bank_balance: number;
  accounts_receivable: number;
  accounts_payable: number;
}

export function parseBalanceSheet(report: any): ParsedBS {
  const rows = report?.Rows?.Row || [];
  const flat = flattenRows(rows);

  const cash = flat
    .filter((r) => /cash|checking|savings|bank/i.test(r.name) && !/total/i.test(r.name))
    .reduce((s, r) => s + r.value, 0);
  const ar = flat.find((r) => /accounts receivable|^a\/r/i.test(r.name))?.value || 0;
  const ap = flat.find((r) => /accounts payable|^a\/p/i.test(r.name))?.value || 0;

  return {
    cash_and_bank_balance: cash,
    accounts_receivable: ar,
    accounts_payable: ap,
  };
}

// Parse monthly P&L (summarize_column_by=Month) to extract revenue per month
export function parseMonthlyRevenue(report: any): { month: string; revenue: number }[] {
  const cols: any[] = report?.Columns?.Column || [];
  const rows = report?.Rows?.Row || [];
  const flat = (function findIncome(rs: any[]): any | null {
    for (const r of rs) {
      if (r.Summary?.ColData?.[0]?.value && /total income|total revenue/i.test(r.Summary.ColData[0].value)) {
        return r.Summary.ColData;
      }
      if (r.Rows?.Row) {
        const f = findIncome(r.Rows.Row);
        if (f) return f;
      }
    }
    return null;
  })(rows);

  if (!flat) return [];
  const result: { month: string; revenue: number }[] = [];
  // cols[0] is "" label, last col is total. middle cols are months.
  for (let i = 1; i < cols.length - 1 && i < flat.length; i++) {
    const month = cols[i]?.ColTitle || cols[i]?.MetaData?.[0]?.Value || `M${i}`;
    const revenue = parseFloat(flat[i]?.value || "0") || 0;
    result.push({ month, revenue });
  }
  return result;
}
