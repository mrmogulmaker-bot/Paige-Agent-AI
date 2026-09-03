import Stripe from 'https://esm.sh/stripe@18.5.0';
import { assertEquals, assertRejects, assertThrows } from 'https://deno.land/std@0.190.0/testing/asserts.ts';
import { verifyStripeWebhook } from './stripe-webhook-signature.ts';
const stripe = new Stripe('sk_test_fixture_not_a_credential', { apiVersion:'2025-08-27.basil' });
const cryptoProvider = Stripe.createSubtleCryptoProvider();
const payload = JSON.stringify({id:'evt_fixture',type:'checkout.session.completed',data:{object:{mode:'setup'}}});
async function sign(body: string, secret: string, timestamp = Math.floor(Date.now()/1000)) {
 const encoder = new TextEncoder();
 const key = await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const digest = await crypto.subtle.sign('HMAC',key,encoder.encode(`${timestamp}.${body}`));
 return `t=${timestamp},v1=${Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')}`;
}
Deno.test('baseline: synchronous Stripe verifier cannot use Deno SubtleCrypto',async()=>{
 const signature=await sign(payload,'fixture-legacy');
 assertThrows(()=>stripe.webhooks.constructEvent(payload,signature,'fixture-legacy',undefined,cryptoProvider));
});
Deno.test('real HMAC: legacy accepted after V2 miss',async()=>{
 const r=await verifyStripeWebhook(payload,await sign(payload,'fixture-legacy'),stripe,stripe,'fixture-legacy','fixture-v2',cryptoProvider);
 assertEquals(r?.account,'legacy');assertEquals(r?.event.type,'checkout.session.completed');
});
Deno.test('real HMAC: V2 accepted',async()=>{
 const r=await verifyStripeWebhook(payload,await sign(payload,'fixture-v2'),stripe,stripe,'fixture-legacy','fixture-v2',cryptoProvider);
 assertEquals(r?.account,'v2');
});
Deno.test('wrong signing secret, tamper, stale timestamp and missing signature refuse',async()=>{
 assertEquals(await verifyStripeWebhook(payload,await sign(payload,'fixture-wrong'),stripe,stripe,'fixture-legacy','fixture-v2',cryptoProvider),null);
 assertEquals(await verifyStripeWebhook(payload+' ',await sign(payload,'fixture-legacy'),stripe,stripe,'fixture-legacy','fixture-v2',cryptoProvider),null);
 assertEquals(await verifyStripeWebhook(payload,await sign(payload,'fixture-legacy',1),stripe,stripe,'fixture-legacy','fixture-v2',cryptoProvider),null);
 assertEquals(await verifyStripeWebhook(payload,'',stripe,stripe,'fixture-legacy','fixture-v2',cryptoProvider),null);
});
