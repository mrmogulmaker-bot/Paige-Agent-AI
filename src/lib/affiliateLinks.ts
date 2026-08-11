/**
 * Centralized registry of NEUTRAL third-party product URLs Paige can reference.
 *
 * §45 de-brand: this is a shared/platform-level registry, so it must NEVER carry an
 * operator's affiliate/referral code (e.g. a personal `?affi=` or `/l/<code>/` link).
 * Per-tenant affiliate offers are TENANT-AUTHORED and resolve at runtime from the
 * operator-identity seam (resolve_operator_identity → tradeline_partners), present-only —
 * never from a hardcoded code here. Entries below are bare public URLs only.
 */
export const affiliateLinks = {
  // Credit Building — bare public URLs (no operator referral code, §45)
  creditStrong: "https://www.creditstrong.com",
  creditRentBoost: "https://www.creditrentboost.com",
  navyFederal: "https://www.navyfederal.org",
  experianBoost: "https://www.experian.com/boost",

  // Payroll
  gusto: "https://gusto.com", // Replace with affiliate URL
  adp: "https://adp.com", // Replace with affiliate URL
  onpay: "https://onpay.com", // Replace with affiliate URL
  rippling: "https://rippling.com", // Replace with affiliate URL
  wavePayroll: "https://waveapps.com/payroll", // Replace with affiliate URL

  // Accounting
  quickbooks: "https://quickbooks.intuit.com", // Replace with affiliate URL
  wave: "https://waveapps.com", // Replace with affiliate URL
  freshbooks: "https://freshbooks.com", // Replace with affiliate URL
  xero: "https://xero.com", // Replace with affiliate URL

  // Banking
  mercury: "https://mercury.com", // Replace with affiliate URL
  relay: "https://relayfi.com", // Replace with affiliate URL
  bluevine: "https://bluevine.com", // Replace with affiliate URL

  // Business Tools
  expensify: "https://expensify.com", // Replace with affiliate URL
  ramp: "https://ramp.com", // Replace with affiliate URL
} as const;

export type AffiliateKey = keyof typeof affiliateLinks;
