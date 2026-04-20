/**
 * Live rate calculation helpers driven by FRED API data.
 * Pair these with useEconomicRates() to surface current market rates.
 */

const fmtPct = (n: number) => `${n.toFixed(2)}%`;
const fmtRange = (lo: number, hi: number) => `${fmtPct(lo)} to ${fmtPct(hi)}`;

export type SBALoanType = "standard" | "express" | "microloan";

export function getSBARate(loanType: SBALoanType, primeRate: number): string {
  switch (loanType) {
    case "standard":
      // SBA 7(a) standard, loans over $50K: prime + 2.25% to prime + 4.75%
      return `${fmtRange(primeRate + 2.25, primeRate + 4.75)} APR (Prime ${fmtPct(primeRate)} + 2.25% to 4.75%)`;
    case "express":
      // SBA Express: prime + 4.5% to prime + 6.5%
      return `${fmtRange(primeRate + 4.5, primeRate + 6.5)} APR (Prime ${fmtPct(primeRate)} + 4.5% to 6.5%)`;
    case "microloan":
      // SBA Microloan: 8% to 13% fixed (not prime-based)
      return `8.00% to 13.00% APR (fixed, not prime-based)`;
  }
}

export function getSBASmallLoanRate(primeRate: number): string {
  // SBA 7(a) for loans under $25K: prime + 4.25% to prime + 6.5%
  return `${fmtRange(primeRate + 4.25, primeRate + 6.5)} APR (Prime ${fmtPct(primeRate)} + 4.25% to 6.5%)`;
}

export function getDSCRRate(
  creditScore: number,
  ltv: number,
  primeRate: number
): string {
  if (creditScore >= 720 && ltv < 65) {
    return fmtRange(primeRate + 1.5, primeRate + 2.5);
  }
  if (creditScore >= 680 && ltv < 75) {
    return fmtRange(primeRate + 2.5, primeRate + 3.5);
  }
  if (creditScore >= 640 && ltv < 80) {
    return fmtRange(primeRate + 3.5, primeRate + 5);
  }
  return `${fmtRange(primeRate + 5, primeRate + 7)} (limited availability)`;
}

export function getHardMoneyRate(): string {
  // Hard money rates are lender-set and less tied to prime
  return `9.00% to 14.00% (asset-based, not credit-score-dependent)`;
}

export function getConventionalInvestmentRate(
  creditScore: number,
  mortgageRate: number
): string {
  // Investment property premium: add 0.5% to 0.75% to primary residence rate
  let premium = 0.75;
  if (creditScore >= 720) premium = 0.5;
  else if (creditScore >= 680) premium = 0.625;
  return fmtPct(mortgageRate + premium);
}

export type MortgageLoanType = "conventional" | "fha" | "va";

export function getMortgageRate(
  creditScore: number,
  loanType: MortgageLoanType,
  mortgageRate: number
): string {
  if (loanType === "fha") return fmtPct(mortgageRate + 0.25);
  if (loanType === "va") return fmtPct(mortgageRate - 0.25);

  // Conventional, by credit tier
  if (creditScore >= 720) return fmtPct(mortgageRate - 0.25);
  if (creditScore >= 680) return fmtPct(mortgageRate);
  if (creditScore >= 640) return fmtPct(mortgageRate + 0.5);
  if (creditScore >= 620) return fmtRange(mortgageRate + 0.75, mortgageRate + 1);
  return `${fmtRange(mortgageRate + 1.5, mortgageRate + 2)} (subprime)`;
}

export function getBusinessLineRate(
  creditScore: number,
  timeInBusinessMonths: number,
  primeRate: number
): string {
  if (creditScore >= 680 && timeInBusinessMonths >= 24) {
    return fmtRange(primeRate + 1.5, primeRate + 4);
  }
  if (creditScore >= 640 && timeInBusinessMonths >= 12) {
    return fmtRange(primeRate + 4, primeRate + 8);
  }
  return `${fmtRange(primeRate + 8, primeRate + 15)} (limited availability)`;
}

/** Monthly payment helper for cost-of-waiting math */
export function calcMonthlyPayment(
  principal: number,
  annualRate: number,
  termYears: number
): number {
  const r = annualRate / 100 / 12;
  const n = termYears * 12;
  if (r === 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}
