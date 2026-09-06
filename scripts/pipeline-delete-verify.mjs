// Reproducible local release checks. Never connects to a production database.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'outputs/pipeline-delete-verification');
mkdirSync(out, { recursive: true });
const manifest=JSON.parse(readFileSync(path.join(root,'BUILD_VERIFICATION.json'),'utf8'));
const checks=manifest.commands;
const runStarted=Date.now();
const files = ['src/solo/PipelineDelete.tsx','src/solo/pipeline-delete.css','src/solo/useSoloCampaigns.ts','src/solo/growth2.tsx','supabase/migrations/20260904005101_solo_pipeline_empty_delete.sql'];
const hashes = Object.fromEntries(files.map(file => [file,createHash('sha256').update(readFileSync(path.join(root,file))).digest('hex')]));
const transcript = [];
for (const {name,argv:declared,definition_file} of checks) {
  if(declared[0]!=='node'||!readFileSync(path.join(root,definition_file),'utf8').trim())throw Error('Invalid command definition');
  const argv=declared.slice(1);
  const startedAt = new Date().toISOString();
  const result = await new Promise(resolve => {
    const p = spawn(process.execPath, argv, {cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let output=''; p.stdout.on('data',d=>output+=d);p.stderr.on('data',d=>output+=d);
    p.on('error',e=>resolve({exitCode:-1,output:String(e)}));
    p.on('close',exitCode=>resolve({exitCode,output}));
  });
  writeFileSync(path.join(out,`${name}.log`),result.output);
  transcript.push({name,argv:declared,definition_file,startedAt,finishedAt:new Date().toISOString(),...result,log:`${name}.log`});
  console.log(`${result.exitCode===0?'PASS':'FAIL'} ${name}`);
}
const evidence=manifest.evidence.map(item=>{try{const stat=statSync(path.join(root,item.path));return {...item,fresh:stat.mtimeMs>=runStarted&&Date.now()-stat.mtimeMs<item.max_age_hours*3600000};}catch{return {...item,fresh:false};}});
const git=args=>spawnSync('git',args,{cwd:root,windowsHide:true,encoding:'utf8'}).stdout?.trim();
const packet={generatedAt:new Date().toISOString(),revision:git(['rev-parse','HEAD']),workingTree:git(['status','--short']),hashes,commands:transcript,evidence};
writeFileSync(path.join(out,'command-transcript.json'),JSON.stringify(packet,null,2));
mkdirSync(path.join(root,'evidence/verification'),{recursive:true});
writeFileSync(path.join(root,'evidence/verification/command-transcript.json'),JSON.stringify(packet,null,2));
let migrationState;try{migrationState=JSON.parse(readFileSync(path.join(root,'outputs/pipeline-delete-db-proof/migration-state.json'),'utf8'));}catch{migrationState={status:'UNVERIFIED'};}
const passed=transcript.every(x=>x.exitCode===0)&&evidence.every(x=>x.fresh);
const state={...packet,commands:transcript.map(({output,...rest})=>rest),automated:passed?'PASS':'FAIL',migrationState,authenticatedProduction:'UNVERIFIED',openFindings:['Authenticated production unavailable; no owner-data deletion allowed for proof.']};
writeFileSync(path.join(out,'BUILD_STATE.json'),JSON.stringify(state,null,2));
writeFileSync(path.join(root,'BUILD_STATE.json'),JSON.stringify(state,null,2));
if(!passed)process.exitCode=1;
