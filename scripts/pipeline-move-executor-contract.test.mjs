import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20260904052832_solo_pipeline_governed_move_executor.sql',import.meta.url),'utf8');
test('private executor exists without a second approval store',()=>{
  assert.match(sql,/create or replace function public\.execute_pipeline_deal_move_as_paige/i);
  assert.match(sql,/revoke all.*from public,anon,authenticated/is);
  assert.doesNotMatch(sql,/insert into public\.pipeline_move_approvals/i);
});
