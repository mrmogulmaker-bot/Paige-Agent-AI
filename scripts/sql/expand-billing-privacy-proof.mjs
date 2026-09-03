import {readFileSync} from 'node:fs';
const migration=readFileSync('supabase/migrations/20261200000100_billing_status_private_setup.sql','utf8').replace(/^BEGIN;\r?$/gm,'').replace(/^COMMIT;\r?$/gm,'');
const proof=readFileSync('scripts/sql/billing-payment-privacy-proof.sql','utf8').replace('-- APPLY_BILLING_PRIVACY_MIGRATION',()=>process.argv.includes('--baseline')?'':migration);
if (/^COMMIT;/m.test(proof) || !proof.trimEnd().endsWith('ROLLBACK;')) throw new Error('rollback proof transaction boundary invalid');
process.stdout.write(proof);
