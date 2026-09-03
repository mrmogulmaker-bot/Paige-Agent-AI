import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reconcilePaymentSetup } from './payment-setup-reconciliation.ts';
const tenant = '11111111-1111-4111-8111-111111111111';
const actor = '22222222-2222-4222-8222-222222222222';
const metadata = { platform_billing_connect_tenant_id: tenant, actor_user_id: actor, setup_attempt: 'attempt-123' };
function fixture() {
 const event: any = {id:'evt_fixture',type:'checkout.session.completed',created:1234,livemode:false,data:{object:{id:'cs_fixture',mode:'setup',status:'complete',customer:'cus_fixture',setup_intent:'seti_fixture',livemode:false,metadata}}};
 const si: any = {status:'succeeded',customer:'cus_fixture',payment_method:'pm_fixture',livemode:false,metadata};
 const pm: any = {type:'card',customer:'cus_fixture',livemode:false};
 const calls: any[] = [];
 const provider = {setupIntents:{retrieve:async()=>si},paymentMethods:{retrieve:async()=>pm}};
 const admin = {rpc:async(name:string,args:any)=>{if(name==='platform_payment_setup_is_complete')return {data:false,error:null};calls.push({name,args});return {data:'completed',error:null};}};
 return {event,si,pm,calls,provider,admin};
}
test('setup persists through one atomic seam with no sensitive response',async()=>{
 const f=fixture();const r=await reconcilePaymentSetup(f.event,'legacy',f.provider,f.admin);
 assert.deepEqual(r,{status:200,body:{received:true}});assert.equal(f.calls.length,1);
 assert.equal(f.calls[0].name,'complete_platform_payment_setup');
 assert.equal(f.calls[0].args.p_setup_attempt,'attempt-123');
 assert.equal(JSON.stringify(r).includes('fixture'),false);
});
test('transient database failure remains retryable; later delivery can succeed',async()=>{
 const f=fixture(); let fails=true;
 f.admin.rpc=async(name:string)=>name==='platform_payment_setup_is_complete'?{data:false,error:null}:fails?{data:null,error:{message:'SENSITIVE raw database payload'}}:{data:'completed',error:null};
 assert.deepEqual(await reconcilePaymentSetup(f.event,'legacy',f.provider,f.admin),{status:503,body:{error:'setup_persistence_retryable'}});
 fails=false;assert.equal((await reconcilePaymentSetup(f.event,'legacy',f.provider,f.admin)).status,200);
});
test('duplicate completed transaction acknowledges safely',async()=>{
 const f=fixture();f.admin.rpc=async(name:string)=>({data:name==='platform_payment_setup_is_complete'?false:'duplicate',error:null});
 assert.equal((await reconcilePaymentSetup(f.event,'legacy',f.provider,f.admin)).status,200);
});
for(const field of ['mode','status','account','si-customer','pm-customer','si-status','type','mode-mismatch','attempt']) test('refuses invalid binding '+field,async()=>{
 const f=fixture();
 if(field==='mode')f.event.data.object.mode='payment';
 if(field==='status')f.event.data.object.status='open';
 if(field==='account')f.event.account='acct_other';
 if(field==='si-customer')f.si.customer='cus_other';
 if(field==='pm-customer')f.pm.customer='cus_other';
 if(field==='si-status')f.si.status='requires_action';
 if(field==='type')f.pm.type='us_bank_account';
 if(field==='mode-mismatch')f.pm.livemode=true;
 if(field==='attempt')f.si.metadata={...metadata,setup_attempt:'other'};
 assert.notEqual((await reconcilePaymentSetup(f.event,'legacy',f.provider,f.admin)).status,200);assert.equal(f.calls.length,0);
});
test('provider exception returns only safe retry classification',async()=>{
 const f=fixture();f.provider.setupIntents.retrieve=async()=>{throw new Error('sk_secret cus_private card1234')};
 assert.deepEqual(await reconcilePaymentSetup(f.event,'legacy',f.provider,f.admin),{status:503,body:{error:'setup_provider_retryable'}});
});
test('database transaction rollback status is retryable, never acknowledged',async()=>{
 const f=fixture();f.admin.rpc=async(name:string)=>({data:name==='platform_payment_setup_is_complete'?false:'persistence_retryable',error:null});
 assert.deepEqual(await reconcilePaymentSetup(f.event,'legacy',f.provider,f.admin),{status:503,body:{error:'setup_persistence_retryable'}});
});
test('database canonical mapping conflict is refused without acknowledgement',async()=>{
 const f=fixture();f.admin.rpc=async(name:string)=>({data:name==='platform_payment_setup_is_complete'?false:'binding_refused',error:null});
 assert.deepEqual(await reconcilePaymentSetup(f.event,'legacy',f.provider,f.admin),{status:409,body:{error:'setup_binding_refused'}});
});
test('committed duplicate acknowledges without provider lookup even during outage',async()=>{
 const f=fixture();f.admin.rpc=async()=>({data:true,error:null});
 f.provider.setupIntents.retrieve=async()=>{throw new Error('Provider must not be read')};
 assert.deepEqual(await reconcilePaymentSetup(f.event,'legacy',f.provider,f.admin),{status:200,body:{received:true}});
});
