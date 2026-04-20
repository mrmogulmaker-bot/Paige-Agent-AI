/**
 * Centralized affiliate link registry for Paige's third-party recommendations.
 *
 * Update placeholder URLs with real affiliate URLs as partnerships are established.
 * Paige's edge function references these by name when surfacing recommendations.
 */
export const affiliateLinks = {
  // Credit Building
  creditStrong: "https://creditstrong.referralrock.com/l/3ANTONIO94/",
  creditRentBoost: "https://affiliates.creditrentboost.com/?affi=00498",
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
