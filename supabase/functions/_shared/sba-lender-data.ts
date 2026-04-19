// SBA Approved Lender Dataset
// Source: SBA FY2024-2025 7(a) and 504 lender activity reports + Microloan intermediary list
// (https://www.sba.gov/partners/lenders, https://data.sba.gov/dataset/sba-7-a-loan-data,
//  https://www.sba.gov/partners/lenders/microloan-program/list-lenders)
// Curated subset of top-volume + nationally-active + minority/community-focused lenders by state.
// Refresh quarterly via scripts/build-sba-data.py.

export type SbaLoanType = "7a" | "504" | "microloan" | "sba_express" | "community_advantage" | "all";

export interface SbaLender {
  name: string;
  city: string;
  state: string;          // 2-letter
  phone?: string;
  website?: string;
  loan_types: Exclude<SbaLoanType, "all">[];
  max_loan_amount?: number;          // USD
  min_loan_amount?: number;          // USD (microloans / CA only)
  notes?: string;                    // e.g. "Top 10 national 7(a) lender", "Community Advantage", "MDI"
  national: boolean;                 // lends in all 50 states
  serves_minority_focused?: boolean; // CDFI / MDI / mission-based
}

// Top NATIONAL SBA lenders — appear in every state's results
export const NATIONAL_SBA_LENDERS: SbaLender[] = [
  { name: "Live Oak Bank", city: "Wilmington", state: "NC", phone: "910-790-5867", website: "https://www.liveoakbank.com", loan_types: ["7a", "504", "sba_express"], max_loan_amount: 5_000_000, notes: "Largest SBA 7(a) lender in the U.S. by dollar volume — strong for established businesses, healthcare, veterinary, self-storage.", national: true },
  { name: "Huntington National Bank", city: "Columbus", state: "OH", phone: "800-480-2265", website: "https://www.huntington.com/Small-Business/sba-loans", loan_types: ["7a", "504", "sba_express"], max_loan_amount: 5_000_000, notes: "Top 10 SBA 7(a) lender — active in 11+ states, strong on smaller 7(a) loans.", national: false },
  { name: "Newtek Small Business Finance", city: "Boca Raton", state: "FL", phone: "855-763-9835", website: "https://www.newtekone.com", loan_types: ["7a", "504", "sba_express"], max_loan_amount: 5_000_000, notes: "Non-bank SBA lender — flexible underwriting, lends in all 50 states.", national: true },
  { name: "Wells Fargo Bank", city: "Sioux Falls", state: "SD", phone: "800-545-0670", website: "https://www.wellsfargo.com/biz/loans-lines/sba", loan_types: ["7a", "504", "sba_express"], max_loan_amount: 5_000_000, notes: "Top 5 national SBA lender — favors established borrowers with banking relationship.", national: true },
  { name: "U.S. Bank", city: "Minneapolis", state: "MN", phone: "800-872-2657", website: "https://www.usbank.com/business-banking/business-lending/sba-loans.html", loan_types: ["7a", "504", "sba_express"], max_loan_amount: 5_000_000, notes: "Top 10 SBA lender — strong 504 program for owner-occupied real estate.", national: true },
  { name: "JPMorgan Chase Bank", city: "Columbus", state: "OH", phone: "800-242-7338", website: "https://www.chase.com/business/banking/sba-loans", loan_types: ["7a", "504", "sba_express"], max_loan_amount: 5_000_000, notes: "Major national SBA lender — typically wants 680+ credit and 2+ years in business.", national: true },
  { name: "Byline Bank", city: "Chicago", state: "IL", phone: "773-244-7000", website: "https://www.bylinebank.com/business/sba-lending", loan_types: ["7a", "504"], max_loan_amount: 5_000_000, notes: "Top 5 SBA 7(a) lender by units — high approval volume, lends nationally.", national: true },
  { name: "Celtic Bank", city: "Salt Lake City", state: "UT", phone: "801-363-6500", website: "https://www.celticbank.com", loan_types: ["7a", "504", "sba_express"], max_loan_amount: 5_000_000, notes: "Top 10 national SBA 7(a) lender — non-bank-affiliated, fast approval cycles.", national: true },
  { name: "Readycap Lending", city: "New York", state: "NY", phone: "646-595-7470", website: "https://www.readycapital.com/sba-loans/", loan_types: ["7a", "504"], max_loan_amount: 5_000_000, notes: "Non-bank SBA lender — flexible, especially for franchise and lower-doc deals.", national: true },
  { name: "Accion Opportunity Fund", city: "San Jose", state: "CA", phone: "888-720-3215", website: "https://aofund.org", loan_types: ["microloan"], min_loan_amount: 5_000, max_loan_amount: 250_000, notes: "Largest national CDFI microlender — minority/women-friendly, flexible credit.", national: true, serves_minority_focused: true },
  { name: "Kiva U.S.", city: "San Francisco", state: "CA", phone: "415-359-0974", website: "https://www.kiva.org/borrow", loan_types: ["microloan"], min_loan_amount: 1_000, max_loan_amount: 15_000, notes: "0% interest crowdfunded microloans — accepts borrowers with limited credit history.", national: true, serves_minority_focused: true },
  { name: "LiftFund", city: "San Antonio", state: "TX", phone: "888-215-2373", website: "https://www.liftfund.com", loan_types: ["microloan", "community_advantage", "7a"], min_loan_amount: 500, max_loan_amount: 350_000, notes: "Top SBA Microloan and Community Advantage lender — serves 15 states across the South and West.", national: false, serves_minority_focused: true },
];

// State-specific SBA lenders (community banks, CDFIs, microloan intermediaries)
// Keyed by 2-letter state code.
export const STATE_SBA_LENDERS: Record<string, SbaLender[]> = {
  GA: [
    { name: "Access to Capital for Entrepreneurs (ACE)", city: "Cleveland", state: "GA", phone: "678-335-5600", website: "https://aceloans.org", loan_types: ["microloan", "community_advantage"], min_loan_amount: 500, max_loan_amount: 250_000, notes: "Georgia's top SBA Microloan + Community Advantage CDFI — serves North & Metro Atlanta, minority-friendly.", national: false, serves_minority_focused: true },
    { name: "Atlanta Micro Fund", city: "Atlanta", state: "GA", phone: "404-477-3232", website: "https://atlantamicrofund.com", loan_types: ["microloan"], min_loan_amount: 500, max_loan_amount: 50_000, notes: "Atlanta-area microloan intermediary — focuses on Black-owned and underbanked businesses.", national: false, serves_minority_focused: true },
    { name: "Synovus Bank", city: "Columbus", state: "GA", phone: "888-796-6887", website: "https://www.synovus.com/business/lending/sba-loans/", loan_types: ["7a", "504", "sba_express"], max_loan_amount: 5_000_000, notes: "Top GA-based SBA 7(a) lender — strong community bank presence statewide.", national: false },
    { name: "United Community Bank", city: "Greenville", state: "SC", phone: "800-822-2651", website: "https://www.ucbi.com/business/loans/sba-loans/", loan_types: ["7a", "504"], max_loan_amount: 5_000_000, notes: "Active SBA lender across GA, SC, NC, TN — community-bank underwriting.", national: false },
    { name: "Ameris Bank", city: "Atlanta", state: "GA", phone: "866-616-6020", website: "https://www.amerisbank.com/business/sba-loans", loan_types: ["7a", "504"], max_loan_amount: 5_000_000, notes: "GA-headquartered SBA Preferred Lender — strong on owner-occupied real estate (504).", national: false },
  ],
  CA: [
    { name: "California Coastal Rural Development Corp (Cal Coastal)", city: "Salinas", state: "CA", phone: "831-424-1099", website: "https://www.calcoastal.org", loan_types: ["microloan", "504"], min_loan_amount: 5_000, max_loan_amount: 350_000, notes: "Microloan + 504 intermediary — Central/Coastal CA, agriculture-friendly.", national: false, serves_minority_focused: true },
    { name: "Pacific Western Bank", city: "Los Angeles", state: "CA", phone: "800-350-3557", website: "https://www.pacwest.com", loan_types: ["7a", "504"], max_loan_amount: 5_000_000, notes: "Active CA SBA lender across Southern California.", national: false },
    { name: "TMC Financing", city: "San Francisco", state: "CA", phone: "415-989-8855", website: "https://www.tmcfinancing.com", loan_types: ["504"], max_loan_amount: 5_500_000, notes: "Top national 504 CDC — based in CA, lends in CA/NV/AZ/OR.", national: false },
    { name: "Working Solutions CDFI", city: "San Francisco", state: "CA", phone: "415-655-5473", website: "https://www.workingsolutions.org", loan_types: ["microloan"], min_loan_amount: 5_000, max_loan_amount: 100_000, notes: "Bay Area CDFI microlender — serves women, minority, immigrant entrepreneurs.", national: false, serves_minority_focused: true },
  ],
  TX: [
    { name: "PeopleFund", city: "Austin", state: "TX", phone: "888-222-3863", website: "https://peoplefund.org", loan_types: ["microloan", "community_advantage", "7a"], min_loan_amount: 500, max_loan_amount: 350_000, notes: "Statewide TX CDFI — microloans + Community Advantage, mission-focused on underserved.", national: false, serves_minority_focused: true },
    { name: "BCL of Texas (Business and Community Lenders)", city: "Austin", state: "TX", phone: "512-912-9884", website: "https://bcloftexas.org", loan_types: ["microloan", "504"], min_loan_amount: 5_000, max_loan_amount: 5_500_000, notes: "TX Certified Development Company — strong 504 + microloan footprint.", national: false, serves_minority_focused: true },
    { name: "Frost Bank", city: "San Antonio", state: "TX", phone: "800-513-7678", website: "https://www.frostbank.com/business/business-loans/sba-loans", loan_types: ["7a", "504"], max_loan_amount: 5_000_000, notes: "TX-based SBA Preferred Lender — relationship-driven community bank.", national: false },
  ],
  FL: [
    { name: "BBIF Florida (Black Business Investment Fund)", city: "Orlando", state: "FL", phone: "407-649-4780", website: "https://www.bbif.com", loan_types: ["microloan", "community_advantage"], min_loan_amount: 5_000, max_loan_amount: 250_000, notes: "FL CDFI focused on Black-owned businesses — SBA Microloan + Community Advantage.", national: false, serves_minority_focused: true },
    { name: "Florida First Capital Finance Corp", city: "Tallahassee", state: "FL", phone: "888-320-5504", website: "https://www.ffcfc.com", loan_types: ["504"], max_loan_amount: 5_500_000, notes: "Top FL 504 CDC — owner-occupied real estate financing statewide.", national: false },
    { name: "Seacoast National Bank", city: "Stuart", state: "FL", phone: "866-710-5778", website: "https://www.seacoastbank.com/business/sba-loans", loan_types: ["7a", "504"], max_loan_amount: 5_000_000, notes: "FL community bank with active SBA program.", national: false },
  ],
  NY: [
    { name: "Pursuit (formerly NYBDC)", city: "Albany", state: "NY", phone: "800-923-2504", website: "https://pursuitlending.com", loan_types: ["7a", "504", "community_advantage"], max_loan_amount: 5_500_000, notes: "Largest non-bank SBA lender in the Northeast — NY/NJ/PA/CT/VT, fast approvals.", national: false },
    { name: "TruFund Financial Services", city: "New York", state: "NY", phone: "646-664-1183", website: "https://trufund.org", loan_types: ["microloan", "community_advantage"], min_loan_amount: 5_000, max_loan_amount: 350_000, notes: "Multi-state CDFI — NY, AL, LA, NJ — focused on minority entrepreneurs.", national: false, serves_minority_focused: true },
    { name: "Empire State Certified Development Corp", city: "Albany", state: "NY", phone: "800-923-2504", website: "https://pursuitlending.com/504-loan", loan_types: ["504"], max_loan_amount: 5_500_000, notes: "NY-state CDC for 504 owner-occupied real estate.", national: false },
  ],
  IL: [
    { name: "Accion Illinois (now Allies for Community Business / A4CB)", city: "Chicago", state: "IL", phone: "312-275-3000", website: "https://www.a4cb.org", loan_types: ["microloan", "community_advantage"], min_loan_amount: 500, max_loan_amount: 250_000, notes: "Chicago-area CDFI — minority/women-focused microloans + CA.", national: false, serves_minority_focused: true },
    { name: "Wintrust Bank", city: "Rosemont", state: "IL", phone: "847-939-9000", website: "https://www.wintrust.com/business/lending/sba.html", loan_types: ["7a", "504"], max_loan_amount: 5_000_000, notes: "Active IL SBA lender — community bank network across Chicago metro.", national: false },
  ],
  PA: [
    { name: "Pursuit (formerly NYBDC)", city: "Albany", state: "NY", phone: "800-923-2504", website: "https://pursuitlending.com", loan_types: ["7a", "504", "community_advantage"], max_loan_amount: 5_500_000, notes: "Active in PA — top non-bank SBA lender in the Northeast.", national: false },
    { name: "Community First Fund", city: "Lancaster", state: "PA", phone: "717-393-2351", website: "https://commfirstfund.org", loan_types: ["microloan", "community_advantage"], min_loan_amount: 5_000, max_loan_amount: 250_000, notes: "Eastern PA CDFI — strong microloan + CA program.", national: false, serves_minority_focused: true },
  ],
  OH: [
    { name: "Economic and Community Development Institute (ECDI)", city: "Columbus", state: "OH", phone: "614-559-0115", website: "https://www.ecdi.org", loan_types: ["microloan", "community_advantage"], min_loan_amount: 750, max_loan_amount: 350_000, notes: "Largest SBA Microloan intermediary in OH — minority/immigrant focus.", national: false, serves_minority_focused: true },
  ],
  NC: [
    { name: "Carolina Small Business Development Fund", city: "Raleigh", state: "NC", phone: "919-803-1437", website: "https://carolinasmallbusiness.org", loan_types: ["microloan", "community_advantage"], min_loan_amount: 5_000, max_loan_amount: 250_000, notes: "Statewide NC CDFI — microloan + CA, minority-focused.", national: false, serves_minority_focused: true },
    { name: "Self-Help Credit Union", city: "Durham", state: "NC", phone: "800-476-7428", website: "https://www.self-help.org/business", loan_types: ["7a", "504", "microloan", "community_advantage"], max_loan_amount: 5_000_000, notes: "National CDFI based in NC — full SBA suite, MDI partner.", national: false, serves_minority_focused: true },
  ],
  MI: [
    { name: "Michigan Women Forward", city: "Detroit", state: "MI", phone: "313-962-1920", website: "https://www.miwf.org", loan_types: ["microloan"], min_loan_amount: 2_500, max_loan_amount: 50_000, notes: "Women-owned business microloan intermediary — statewide MI.", national: false, serves_minority_focused: true },
    { name: "Northern Initiatives", city: "Marquette", state: "MI", phone: "906-228-5571", website: "https://northerninitiatives.org", loan_types: ["microloan", "community_advantage"], min_loan_amount: 1_000, max_loan_amount: 250_000, notes: "Upper Peninsula + Northern MI/WI/MN CDFI — rural focus.", national: false, serves_minority_focused: true },
  ],
  AZ: [
    { name: "Prestamos CDFI", city: "Phoenix", state: "AZ", phone: "602-258-3338", website: "https://www.prestamosloans.org", loan_types: ["microloan", "community_advantage"], min_loan_amount: 1_000, max_loan_amount: 250_000, notes: "AZ Hispanic/Latino-focused CDFI — top SBA Microloan intermediary.", national: false, serves_minority_focused: true },
  ],
  WA: [
    { name: "Business Impact NW", city: "Seattle", state: "WA", phone: "206-324-4330", website: "https://businessimpactnw.org", loan_types: ["microloan", "community_advantage"], min_loan_amount: 500, max_loan_amount: 250_000, notes: "Pacific Northwest CDFI — WA/OR/ID/AK, women & minority focused.", national: false, serves_minority_focused: true },
  ],
};

// Helper: get all SBA lenders for a state (national + state-specific)
export function getLendersForState(stateCode: string): SbaLender[] {
  const upper = stateCode.toUpperCase();
  const stateSpecific = STATE_SBA_LENDERS[upper] || [];
  return [...stateSpecific, ...NATIONAL_SBA_LENDERS];
}
