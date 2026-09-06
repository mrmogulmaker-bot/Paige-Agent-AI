export async function concurrencyCases({ psql, asUser, json, assert, test, call, tid, pid, sid, uid }) {
  await test('workspace capability wrapper is true only for active Solo owner context',async()=>{
    assert((await json(asUser(1,`select public.get_pipeline_workspace('${tid(1)}')`))).can_delete===true,'Owner capability missing');
    assert((await json(asUser(2,`select public.get_pipeline_workspace('${tid(1)}')`))).can_delete===false,'Member capability leaked');
    assert((await json(asUser(1,`select public.get_pipeline_workspace('${tid(2)}')`))).can_delete===false,'Foreign context capability leaked');
  });
  await test('legacy foreign tenant dependents are refused without cascade',async()=>{
    await psql(`update public.pipeline_stages set tenant_id='${tid(2)}' where id='${sid(211)}'; insert into public.pipeline_archive_confirmations(tenant_id,pipeline_id) values ('${tid(2)}','${pid(22)}');`);
    for(const n of [21,22]) {
      assert((await json(asUser(1,call(n)))).ok===false,'Foreign dependent cascade permitted');
      assert(await json(`select count(*) from public.pipeline_stages where pipeline_id='${pid(n)}'`)===2,'Refusal removed dependent stages');
    }
  });
  await test('non-Solo and child tenant owner denied',async()=>{
    for(const change of ["account_type='agency'",`parent_tenant_id='${tid(2)}'`]) {
      await psql(`update public.tenants set ${change} where id='${tid(1)}'`);
      const result=await psql(asUser(1,call(23)),true);
      assert(result.code!==0 && result.stderr.includes('42501'),'Non-Solo owner accepted');
      await psql(`update public.tenants set account_type='standalone',parent_tenant_id=null where id='${tid(1)}'`);
    }
  });
  async function sleeping(name) {
    for (let n=0;n<40;n++) {
      if (await json(`select to_jsonb(exists(select 1 from pg_stat_activity where application_name='${name}' and wait_event='PgSleep'))`)) return;
      await new Promise(done=>setTimeout(done,50));
    }
    throw new Error(`Controlled transaction ${name} did not acquire its lock`);
  }
  await test('secondary active canonical owner allowed; role-name-only owner denied',async()=>{
    await psql(`update public.tenant_members set is_owner=true,role='member' where user_id='${uid(3)}'; update public.tenant_members set role='owner' where user_id='${uid(2)}';`);
    assert((await json(asUser(3,call(15)))).ok===true,'Canonical secondary owner denied');
    const denied=await psql(asUser(2,call(16)),true);
    assert(denied.code!==0 && denied.stderr.includes('42501'),'Role text alone granted deletion');
  });
  await test('noncanonical but valid UUID routing spelling still blocks deletion',async()=>{
    await psql(`insert into public.growth_form_automations(id,tenant_id,config_json) values ('70000000-0000-4000-8000-000000000099','${tid(1)}','{"pipeline_id":"{${pid(17).toUpperCase()}}"}')`);
    assert((await json(asUser(1,call(17)))).ok===false,'Braced UUID route missed');
  });
  for (const [label,n,insert] of [
    ['deal',18,`insert into public.deals(id,tenant_id,pipeline_id,stage_id) values ('60000000-0000-4000-8000-000000000098','${tid(1)}','${pid(18)}','${sid(181)}')`],
    ['scalar form route',24,`insert into public.growth_forms(id,tenant_id,pipeline_id,stage_id) values ('70000000-0000-4000-8000-000000000096','${tid(1)}','${pid(24)}','${sid(241)}')`],
    ['JSON route',19,`insert into public.growth_form_automations(id,tenant_id,config_json) values ('70000000-0000-4000-8000-000000000098','${tid(1)}','{"pipeline_id":"${pid(19)}"}')`],
  ]) await test(`delete wins race against new ${label}: writer fails without orphan`,async()=>{
    const name=`pipeline-proof-delete-${n}`;
    const deletion=psql(asUser(1,`set application_name='${name}'; begin; ${call(n)} select pg_sleep(6); commit;`),true);
    await sleeping(name);
    const writer=psql(insert,true);
    const [deleted,written]=await Promise.all([deletion,writer]);
    assert(JSON.parse(deleted.stdout.trim()).ok===true,'Deletion failed');
    assert(written.code!==0 && written.stderr.includes('23503'),'Concurrent writer was not refused');
    assert(await json(`select count(*) from public.pipelines where id='${pid(n)}'`)===0,'Deleted pipeline remains');
  });
  await test('committing route writer wins race: deletion rechecks and refuses',async()=>{
    const n=20,name='pipeline-proof-route-first';
    const writer=psql(`set application_name='${name}'; begin; insert into public.growth_form_automations(id,tenant_id,config_json) values ('70000000-0000-4000-8000-000000000097','${tid(1)}','{"pipeline_id":"${pid(n)}"}'); select pg_sleep(6); commit;`,true);
    await sleeping(name);
    const deletion=psql(asUser(1,call(n)));
    const [,deleted]=await Promise.all([writer,deletion]);
    assert(JSON.parse(deleted.stdout.trim()).ok===false,'Deletion ignored newly committed route');
    assert(await json(`select count(*) from public.pipeline_stages where pipeline_id='${pid(n)}'`)===2,'Refusal lost stages');
  });
}
