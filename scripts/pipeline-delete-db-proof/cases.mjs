export async function executeCases({ sql, psql, asUser, json, assert, test, denied, call, snapshot, tid, pid, sid }) {
  const unchanged = async (action) => { const before = await snapshot(); await action(); assert(JSON.stringify(before) === JSON.stringify(await snapshot()), 'Denied request changed state'); };
  await test('anonymous, admin-not-owner, removed owner and nonmember denied as actual database roles', async () => {
    await unchanged(async () => {
      await denied(`set role anon; ${call(1)}`);
      for (const actor of [2, 4, 5]) await denied(asUser(actor, call(1)));
      await denied(`set role authenticated; ${call(1)}`);
    });
  });
  await test('same owner across two tenants cannot tamper expected tenant or target pipeline', async () => {
    await unchanged(async () => {
      await denied(asUser(1, call(3, 'tamper-expected', 2)), '42501');
      const result = await psql(asUser(1, call(3, 'tamper-object', 1)), true);
      assert(result.code !== 0 || JSON.parse(result.stdout).ok === false, 'Cross-tenant target accepted');
    });
  });
  await test('exact reference and version and archived-inclusive stage count required', async () => {
    await unchanged(async () => {
      for (const query of [call(1,'bad-reference',1,'PPL-OTHER'), call(1,'bad-version',1,'PPL-TEST1',99), call(1,'bad-count',1,'PPL-TEST1',1,1)]) {
        const result = await psql(asUser(1,query),true);
        assert(result.code !== 0 || JSON.parse(result.stdout).ok === false, 'Stale or incorrect confirmation accepted');
      }
    });
  });
  await test('owner deletes exact empty duplicate and archived stages; surviving duplicate and Catalog untouched', async () => {
    const before = await snapshot();
    const result = await json(asUser(1, call(1)));
    assert(result.ok === true && result.pipeline_id === pid(1), 'Deletion did not return exact pipeline');
    const after = await snapshot();
    assert(!after.pipelines.some(p => p.id === pid(1)), 'Pipeline remained');
    assert(!after.stages.some(s => s.pipeline_id === pid(1)), 'Stage remained');
    assert(JSON.stringify(before.pipelines.filter(p => p.id !== pid(1))) === JSON.stringify(after.pipelines), 'Other pipeline changed');
    assert(JSON.stringify(before.catalog) === JSON.stringify(after.catalog), 'Catalog changed');
    assert(after.audit === before.audit + 1, 'Success not audited exactly once');
  });
  await test('successful retry returns same outcome and no duplicate audit', async () => {
    const before = await snapshot();
    const repeated = await json(asUser(1, call(1)));
    assert(repeated.ok === true, 'Durable retry did not return success');
    assert(JSON.stringify(before) === JSON.stringify(await snapshot()), 'Retry repeated mutation or audit');
  });
  await test('idempotency key cannot be used for another pipeline or another actor', async () => {
    await unchanged(async () => {
      const conflicting = await psql(asUser(1, call(2, 'delete-1')), true);
      assert(conflicting.code !== 0, 'Different command reused successful key');
      await denied(asUser(2, call(1)));
    });
  });
  await test('failure after deletes rolls back stages pipeline audit and retry cache', async () => {
    await psql(`create function public.fixture_fail_audit() returns trigger language plpgsql as $$ begin raise exception 'FIXTURE_AUDIT_FAILURE'; end $$; create trigger fixture_fail before insert on public.audit_logs for each row execute function public.fixture_fail_audit();`);
    await unchanged(async () => { const result = await psql(asUser(1, call(4)), true); assert(result.code !== 0 && result.stderr.includes('FIXTURE_AUDIT_FAILURE'), 'Injected audit failure not propagated'); });
    await psql('drop trigger fixture_fail on public.audit_logs;');
    const result = await json(asUser(1, call(4)));
    assert(result.ok === true, 'Retry after atomic rollback failed');
  });
  await test('existing deal count is exact and deletion never alters deals', async () => {
    await psql(`insert into public.deals(id,tenant_id,pipeline_id,stage_id,title) values ('60000000-0000-4000-8000-000000000001','${tid(1)}','${pid(5)}','${sid(51)}','Retained'),('60000000-0000-4000-8000-000000000002','${tid(1)}','${pid(5)}','${sid(52)}','Also retained');`);
    const before = await json('select jsonb_agg(to_jsonb(d) order by id) from public.deals d');
    const result = await json(asUser(1,call(5)));
    assert(result.ok === false && result.deal_count === 2, 'Deal refusal count wrong');
    assert(JSON.stringify(before) === JSON.stringify(await json('select jsonb_agg(to_jsonb(d) order by id) from public.deals d')), 'Refusal changed deals');
    assert(await json(`select count(*) from public.pipelines where id='${pid(5)}'`) === 1, 'Deal pipeline removed');
  });
  const dependencies = [
    [6, `insert into public.growth_forms(id,tenant_id,pipeline_id) values ('70000000-0000-4000-8000-000000000001','${tid(1)}','${pid(6)}')`],
    [7, `insert into public.growth_forms(id,tenant_id,stage_id) values ('70000000-0000-4000-8000-000000000002','${tid(1)}','${sid(72)}')`],
    [8, `insert into public.growth_form_automations(id,tenant_id,config_json) values ('70000000-0000-4000-8000-000000000003','${tid(1)}','{"pipeline_id":"${pid(8)}"}')`],
    [9, `insert into public.stage_automation_rules(id,tenant_id,from_stage_id) values ('80000000-0000-4000-8000-000000000001','${tid(1)}','${sid(91)}')`],
    [10, `insert into public.deal_activities(id,deal_id,payload) values ('90000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','{"from_stage_id":"${sid(101)}"}')`],
    [11, `insert into public.pipeline_move_approvals(id,tenant_id,deal_id,from_stage_id,to_stage_id) values ('a0000000-0000-4000-8000-000000000001','${tid(1)}','60000000-0000-4000-8000-000000000001','${sid(111)}','${sid(112)}')`],
  ];
  for (const [n, setup] of dependencies) await test(`dependent record ${n} prevents destructive FK action`, async () => {
    await psql(setup);
    const result = await json(asUser(1,call(n)));
    assert(result.ok === false, `Dependency ${n} not refused`);
    assert(await json(`select count(*) from public.pipeline_stages where pipeline_id='${pid(n)}'`) === 2, 'Refusal removed stages');
  });
  await test('direct authenticated table deletion denied', async () => { await denied(asUser(1,`delete from public.pipelines where id='${pid(2)}'`)); });
  await test('concurrent repeat submission yields one audited complete deletion', async () => {
    const before = await json('select count(*) from public.audit_logs');
    const responses = await Promise.all([psql(asUser(1,call(12))), psql(asUser(1,call(12)))]);
    assert(responses.every(r => JSON.parse(r.stdout).ok === true), 'Concurrent idempotent result mismatch');
    assert(await json('select count(*) from public.audit_logs') === before + 1, 'Concurrent retry double audited');
  });
  // Negative variants are applied only to this disposable cluster, never files.
  // Guard markers are explicit in the migration; missing/ambiguous mutation fails proof.
  const definition = await json("select to_jsonb(pg_get_functiondef('public.delete_empty_pipeline(uuid,uuid,text,bigint,text,integer)'::regprocedure))");
  const variants = [
    ['owner', /not public\.can_delete_solo_pipeline\(\)/g, 'false', asUser(2,call(13)), '42501'],
    ['tenant context', /_expected_tenant_id is distinct from _tenant/g, 'false', asUser(1,call(14,'bad-context',2)), '42501'],
    ['cross-tenant object', / and tenant_id=_tenant/g, '', asUser(1,call(3,'bad-object',1)), '42501', 2],
  ];
  for (const [name, pattern, replacement, probe, state, expectedMatches = 1] of variants) await test(`negative control ${name}: removing enforcement makes denial assertion fail`, async () => {
    const matches = [...definition.matchAll(pattern)];
    assert(matches.length === expectedMatches, `Expected ${expectedMatches} ${name} guards, found ${matches.length}`);
    await psql(definition.replace(pattern,replacement));
    let assertionFailed = false;
    try { await denied(probe,state); } catch { assertionFailed = true; }
    assert(assertionFailed, `Removing ${name} guard did not fail its denial assertion`);
    await psql(sql);
  });
}
