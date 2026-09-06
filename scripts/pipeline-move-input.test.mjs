import test from 'node:test';
import assert from 'node:assert/strict';
import { preparePipelineMove } from '../supabase/functions/_shared/pipelineMoveRequest.ts';

const snapshot = {ok:true,canManage:true,pipeline:{id:'pipeline',shortRef:'PPL-ABCDE',name:'Work',lifecycleStatus:'active'},stages:[{id:'stage'}],deals:[{id:'deal'}]};
for (const selection of [null, undefined, [], 'deal', 42, true, {}, {dealId:[],targetStageId:'stage'}, {dealId:'deal',targetStageId:''}]) {
  test(`malformed move selection is refused without throwing: ${JSON.stringify(selection)}`, () => {
    assert.equal(preparePipelineMove(snapshot, selection).code, 'MOVE_NOT_AVAILABLE');
  });
}
