-- Seed lender products database with 50+ products
INSERT INTO lender_products (lender_name, product_name, product_type, min_fico_score, max_inquiries_6mo, max_inquiries_12mo, min_account_age_months, min_open_accounts, max_derogatory_items, max_utilization_pct, min_annual_revenue, min_business_age_months, requires_pg, ein_only, min_amount, max_amount, apr_range_low, apr_range_high, term_months, is_active) VALUES
-- Business Credit Cards (No PG / EIN-Only)
('Brex', 'Brex Card', 'business_credit_card', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 50000, 6, false, true, 1000, 500000, 0, 0, NULL, true),
('Ramp', 'Ramp Corporate Card', 'business_credit_card', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 100000, 6, false, true, 5000, 500000, 0, 0, NULL, true),
('Divvy (Bill.com)', 'Divvy Business Card', 'business_credit_card', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 25000, 3, false, true, 500, 100000, 0, 0, NULL, true),
('Mercury IO', 'Mercury IO Card', 'business_credit_card', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 10000, 1, false, true, 500, 50000, 0, 0, NULL, true),

-- Business Credit Cards (With PG)
('Chase', 'Ink Business Unlimited', 'business_credit_card', 680, 3, 6, 12, 3, 0, 50, NULL, NULL, true, false, 3000, 50000, 15.49, 21.49, NULL, true),
('Chase', 'Ink Business Preferred', 'business_credit_card', 700, 2, 5, 24, 4, 0, 40, NULL, NULL, true, false, 5000, 75000, 18.49, 23.49, NULL, true),
('American Express', 'Blue Business Plus', 'business_credit_card', 670, 3, 7, 12, 3, 1, 50, NULL, NULL, true, false, 5000, 50000, 15.49, 23.49, NULL, true),
('American Express', 'Business Gold Card', 'business_credit_card', 690, 3, 6, 18, 3, 0, 45, NULL, NULL, true, false, 5000, 75000, 19.49, 27.49, NULL, true),
('Capital One', 'Spark Cash Plus', 'business_credit_card', 700, 2, 5, 24, 4, 0, 40, NULL, NULL, true, false, 5000, 50000, 0, 0, NULL, true),
('US Bank', 'Business Cash Rewards', 'business_credit_card', 680, 3, 6, 12, 3, 0, 50, NULL, NULL, true, false, 3000, 35000, 14.49, 23.49, NULL, true),
('Wells Fargo', 'Business Platinum', 'business_credit_card', 680, 3, 6, 12, 3, 0, 50, NULL, NULL, true, false, 3000, 25000, 14.49, 22.49, NULL, true),
('Bank of America', 'Business Advantage Cash', 'business_credit_card', 670, 4, 7, 12, 3, 1, 55, NULL, NULL, true, false, 3000, 35000, 14.49, 24.49, NULL, true),
('Citi', 'Costco Anywhere Visa Business', 'business_credit_card', 700, 2, 5, 24, 4, 0, 40, NULL, NULL, true, false, 5000, 50000, 16.49, 22.49, NULL, true),

-- Personal Credit Cards (Score Building)
('Discover', 'Discover It Secured', 'personal_credit_card', 300, NULL, NULL, 0, 0, NULL, NULL, NULL, NULL, false, false, 200, 2500, 28.24, 28.24, NULL, true),
('Capital One', 'Platinum Secured', 'personal_credit_card', 300, NULL, NULL, 0, 0, NULL, NULL, NULL, NULL, false, false, 200, 1000, 30.49, 30.49, NULL, true),
('OpenSky', 'OpenSky Secured Visa', 'personal_credit_card', 0, NULL, NULL, 0, 0, NULL, NULL, NULL, NULL, false, false, 200, 3000, 22.14, 22.14, NULL, true),
('Chime', 'Credit Builder Card', 'personal_credit_card', 0, NULL, NULL, 0, 0, NULL, NULL, NULL, NULL, false, false, 200, 10000, 0, 0, NULL, true),
('Capital One', 'Quicksilver', 'personal_credit_card', 670, 3, 6, 12, 3, 0, 50, NULL, NULL, false, false, 1000, 20000, 19.99, 29.99, NULL, true),
('Chase', 'Freedom Unlimited', 'personal_credit_card', 680, 3, 6, 12, 3, 0, 50, NULL, NULL, false, false, 1000, 25000, 20.49, 29.24, NULL, true),
('Citi', 'Double Cash', 'personal_credit_card', 680, 3, 6, 18, 3, 0, 45, NULL, NULL, false, false, 2000, 25000, 18.49, 28.49, NULL, true),
('American Express', 'Blue Cash Everyday', 'personal_credit_card', 670, 3, 7, 12, 3, 1, 50, NULL, NULL, false, false, 1000, 20000, 19.24, 29.99, NULL, true),

-- Business Lines of Credit
('Fundbox', 'Fundbox Line of Credit', 'business_line_of_credit', 600, NULL, NULL, 6, NULL, NULL, NULL, 50000, 6, false, false, 1000, 150000, 4.66, 8.99, 12, true),
('BlueVine', 'BlueVine Business LOC', 'business_line_of_credit', 625, NULL, NULL, 6, NULL, NULL, NULL, 40000, 6, false, false, 5000, 250000, 6.20, 78, 12, true),
('Kabbage (AmEx)', 'Kabbage Business Line', 'business_line_of_credit', 640, NULL, NULL, 12, NULL, 2, NULL, 36000, 12, false, false, 2000, 250000, 9, 36, 12, true),
('OnDeck', 'OnDeck Line of Credit', 'business_line_of_credit', 625, NULL, NULL, 12, NULL, NULL, NULL, 100000, 12, false, false, 6000, 100000, 29.9, 97.3, 12, true),
('Headway Capital', 'Headway LOC', 'business_line_of_credit', 600, NULL, NULL, 6, NULL, NULL, NULL, 50000, 6, false, false, 5000, 100000, 25, 90, 12, true),

-- Personal Lines of Credit
('SoFi', 'SoFi Personal LOC', 'personal_line_of_credit', 680, 3, 6, 24, 3, 0, 40, NULL, NULL, false, false, 5000, 100000, 12.99, 24.74, 60, true),
('LightStream', 'LightStream Personal Loan', 'personal_line_of_credit', 660, 4, 7, 18, 3, 1, 50, NULL, NULL, false, false, 5000, 100000, 7.49, 25.49, 60, true),
('Marcus by Goldman', 'Marcus Personal Loan', 'personal_line_of_credit', 660, 4, 7, 18, 3, 0, 50, NULL, NULL, false, false, 3500, 40000, 7.49, 28.99, 72, true),
('Upgrade', 'Upgrade Personal LOC', 'personal_line_of_credit', 580, NULL, NULL, 12, 2, 2, 60, NULL, NULL, false, false, 1000, 50000, 9.99, 35.97, 60, true),

-- Term Loans
('Lendio', 'Lendio Term Loan', 'term_loan', 600, NULL, NULL, NULL, NULL, NULL, NULL, 50000, 6, true, false, 5000, 500000, 6, 30, 60, true),
('Biz2Credit', 'Biz2Credit Term Loan', 'term_loan', 575, NULL, NULL, NULL, NULL, NULL, NULL, 100000, 18, true, false, 25000, 500000, 10, 25, 36, true),
('National Funding', 'National Funding Term', 'term_loan', 600, NULL, NULL, NULL, NULL, NULL, NULL, 100000, 12, true, false, 5000, 500000, 8, 22, 60, true),
('Credibly', 'Credibly Working Capital', 'term_loan', 500, NULL, NULL, NULL, NULL, NULL, NULL, 120000, 6, true, false, 5000, 400000, 15, 45, 24, true),

-- SBA Loans
('SBA', 'SBA 7(a) Loan', 'sba_loan', 680, NULL, NULL, NULL, NULL, 0, NULL, 100000, 24, true, false, 25000, 5000000, 5.5, 8, 300, true),
('SBA', 'SBA Microloan', 'sba_loan', 620, NULL, NULL, NULL, NULL, 2, NULL, 25000, 6, true, false, 500, 50000, 8, 13, 72, true),
('SBA', 'SBA Express', 'sba_loan', 660, NULL, NULL, NULL, NULL, 0, NULL, 75000, 24, true, false, 25000, 500000, 6.5, 9.5, 120, true),
('CDC/504', 'SBA 504 Loan', 'sba_loan', 680, NULL, NULL, NULL, NULL, 0, NULL, 200000, 24, true, false, 125000, 5000000, 5.5, 6.5, 300, true),

-- Equipment Financing
('Balboa Capital', 'Equipment Financing', 'equipment_financing', 600, NULL, NULL, NULL, NULL, NULL, NULL, 50000, 12, true, false, 5000, 500000, 6, 25, 84, true),
('LEAF Commercial', 'LEAF Equipment Loan', 'equipment_financing', 550, NULL, NULL, NULL, NULL, NULL, NULL, 75000, 12, true, false, 2000, 250000, 7, 30, 60, true),
('Beacon Funding', 'Beacon Equipment Finance', 'equipment_financing', 580, NULL, NULL, NULL, NULL, NULL, NULL, 50000, 6, true, false, 10000, 1000000, 5, 20, 84, true),

-- Revenue-Based Financing
('Shopify', 'Shopify Capital', 'revenue_based_financing', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 50000, 6, false, false, 200, 2000000, NULL, NULL, NULL, true),
('Square', 'Square Loans', 'revenue_based_financing', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 10000, 3, false, false, 300, 250000, NULL, NULL, NULL, true),
('PayPal', 'PayPal Working Capital', 'revenue_based_financing', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 15000, 3, false, false, 1000, 300000, NULL, NULL, NULL, true),
('Clearco', 'Clearco Revenue-Based', 'revenue_based_financing', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 120000, 12, false, false, 10000, 10000000, 6, 12, NULL, true),

-- Invoice Factoring
('Fundbox', 'Fundbox Invoice Financing', 'invoice_factoring', 500, NULL, NULL, NULL, NULL, NULL, NULL, 25000, 3, false, false, 1000, 100000, 4.66, 8.99, 3, true),
('BlueVine', 'BlueVine Invoice Factoring', 'invoice_factoring', 530, NULL, NULL, NULL, NULL, NULL, NULL, 10000, 3, false, false, 5000, 5000000, 0.25, 1.35, 3, true),
('AltLINE', 'AltLINE Factoring', 'invoice_factoring', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 50000, 6, false, false, 30000, 5000000, 0.5, 3, 3, true),

-- Merchant Cash Advance
('Rapid Finance', 'Rapid Finance MCA', 'merchant_cash_advance', 500, NULL, NULL, NULL, NULL, NULL, NULL, 50000, 4, false, false, 5000, 500000, NULL, NULL, NULL, true),
('Can Capital', 'Can Capital MCA', 'merchant_cash_advance', 500, NULL, NULL, NULL, NULL, NULL, NULL, 75000, 6, false, false, 2500, 250000, NULL, NULL, NULL, true)
ON CONFLICT DO NOTHING;