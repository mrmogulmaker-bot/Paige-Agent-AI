// Reproducible local release checks. Never connects to a production database.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'outputs/pipeline-delete-verification');
mkdirSync(out, { recursive: true });
const checks = [
  ['tests', 'node_modules/vitest/vitest.mjs', 'run', 'src/solo/PipelineDelete.test.tsx', 'src/solo/useSoloCampaigns.delete.test.tsx', 'src/solo/growth2.render.test.tsx', 'src/solo/growth2.contract.test.tsx'],
  ['types', 'scripts/ci/tsc-ratchet.mjs'],
  ['lint', 'node_modules/eslint/bin/eslint.js', 'src/solo/PipelineDelete.tsx', 'src/solo/PipelineDelete.test.tsx', 'src/solo/useSoloCampaigns.delete.test.tsx', 'src/solo/useSoloCampaigns.ts', 'src/solo/growth2.tsx'],
  ['definer-security', 'scripts/ci/definer-fn-lint.mjs'],
  ['build', 'node_modules/vite/bin/vite.js', 'build'],
];
const files = ['src/solo/PipelineDelete.tsx','src/solo/pipeline-delete.css','src/solo/useSoloCampaigns.ts','src/solo/growth2.tsx','supabase/migrations/20260904005101_solo_pipeline_empty_delete.sql'];
const hashes = Object.fromEntries(files.map(file => [file,createHash('sha256').update(readFileSync(path.join(root,file))).digest('hex')]));
const transcript = [];
for (const [name,...argv] of checks) {
  const startedAt = new Date().toISOString();
  const result = await new Promise(resolve => {
    const p = spawn(process.execPath, argv, {cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let output=''; p.stdout.on('data',d=>output+=d);p.stderr.on('data',d=>output+=d);
    p.on('error',e=>resolve({exitCode:-1,output:String(e)}));
    p.on('close',exitCode=>resolve({exitCode,output}));
  });
  writeFileSync(path.join(out,`${name}.log`),result.output);
  transcript.push({name,argv,startedAt,finishedAt:new Date().toISOString(),exitCode:result.exitCode,log:`${name}.log`});
  console.log(`${result.exitCode===0?'PASS':'FAIL'} ${name}`);
}
writeFileSync(path.join(out,'command-transcript.json'),JSON.stringify({generatedAt:new Date().toISOString(),hashes,commands:transcript},null,2));
writeFileSync(path.join(out,'BUILD_STATE.json'),JSON.stringify({generatedAt:new Date().toISOString(),automated:transcript.every(x=>x.exitCode===0)?'PASS':'FAIL',hashes,authenticatedProduction:'UNVERIFIED',database:'SEPARATE_EVIDENCE',rendered:'SEPARATE_EVIDENCE'},null,2));
if(transcript.some(x=>x.exitCode!==0))process.exitCode=1;
