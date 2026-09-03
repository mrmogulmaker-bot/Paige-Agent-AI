import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('setup explicitly selects cards and never payment/subscription mode', () => {
  const source = readFileSync(new URL('../supabase/functions/platform-billing-connect/index.ts', import.meta.url), 'utf8');
  assert.match(source, /payment_method_types:\s*\["card"\]/);
  assert.match(source, /mode:\s*"setup"/);
  assert.doesNotMatch(source, /line_items:|subscription_data:|payment_intent_data:/);
});

const { classifySetupFailure, setupRequestMatches, hostedSetupUrl, setupReturnUrl } = await import('../supabase/functions/platform-billing-connect/safety.ts');
test('provider errors use closed classifications and preserve retryability without leaking content', () => {
  const secretFixture = 'sensitive-provider-fixture';
  for (const type of ['StripeAuthenticationError', 'StripePermissionError', 'StripeInvalidRequestError', 'StripeRateLimitError', 'StripeConnectionError', 'UnexpectedType']) {
    const result = classifySetupFailure({type, message:secretFixture, stack:secretFixture, raw:{token:secretFixture}});
    assert.equal(JSON.stringify(result).includes(secretFixture), false);
    assert.equal(result.retryable, !['StripeAuthenticationError','StripePermissionError','StripeInvalidRequestError'].includes(type));
  }
  assert.equal(classifySetupFailure({type:'StripeInvalidRequestError',param:'currency'}).classification,'setup_currency_required');
  assert.equal(classifySetupFailure({type:'StripeInvalidRequestError',code:'resource_missing'}).classification,'provider_resource_or_mode_mismatch');
  assert.equal(classifySetupFailure(null).retryable,true);
});
test('expected workspace is a comparison, malformed or cross-tenant requests fail closed', () => {
  const body={expected_tenant_id:'workspace-a',return_state:'22222222-2222-4222-8222-222222222222'};
  assert.equal(setupRequestMatches(body,'workspace-a'),true);
  assert.equal(setupRequestMatches(body,'workspace-b'),false);
  for (const invalid of [null,{},'workspace-a',{...body,return_state:'unsafe&payment_setup=success'}]) assert.equal(setupRequestMatches(invalid,'workspace-a'),false);
});
test('only an HTTPS Stripe hosted page can be opened', () => {
  assert.equal(hostedSetupUrl('https://checkout.stripe.com/c/setup/fixture'),true);
  for(const url of ['http://checkout.stripe.com/x','https://checkout.stripe.com.evil.test/x','https://evil.test/x','https://user:pass@checkout.stripe.com/x',null]) assert.equal(hostedSetupUrl(url),false);
});

test('callback preserves an approved initiating origin and rejects arbitrary destinations', () => {
 const canonical='https://paigeagent.ai/solo/123/settings/billing';
 for(const origin of ['https://paigeagent.ai','https://app.paigeagent.ai','https://paige-agent-ai.vercel.app']) assert.equal(setupReturnUrl(canonical,origin),origin+'/solo/123/settings/billing');
 for(const origin of [null,'https://evil.test','https://paigeagent.ai.evil.test','http://paigeagent.ai']) assert.equal(setupReturnUrl(canonical,origin),null);
});

test('unmapped legacy provider references refuse before new provider objects', () => {
 const source=readFileSync(new URL('../supabase/functions/platform-billing-connect/index.ts',import.meta.url),'utf8');
 assert.ok(source.indexOf('legacyIds.length > 0')<source.indexOf('stripe.customers.create('));
 assert.match(source,/unmapped_provider_relationship/);
});
