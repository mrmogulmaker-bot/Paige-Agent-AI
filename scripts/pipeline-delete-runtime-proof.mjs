import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import http from 'node:http';
const root=path.resolve(import.meta.dirname,'..'), commands=[];
async function run(script){
 const startedAt=new Date().toISOString();
 const result=await new Promise(resolve=>{const p=spawn(process.execPath,[script],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';p.stdout.on('data',d=>{stdout+=d;process.stdout.write(d);});p.stderr.on('data',d=>stderr+=d);p.on('error',e=>resolve({exitCode:-1,stdout,stderr:String(e)}));p.on('close',exitCode=>resolve({exitCode,stdout,stderr}));});
 commands.push({argv:['node',script],definition_file:script,startedAt,finishedAt:new Date().toISOString(),...result});
 if(result.exitCode!==0)throw Error(`Runtime proof failed: ${script}`);
}
try{
 await run('scripts/pipeline-delete-db-proof.mjs');
 await run('scripts/live-drive/pipeline-delete-drive.mjs');
 const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--config','scripts/live-drive/pipeline-delete/vite.config.ts'],{cwd:root,windowsHide:true,stdio:'ignore'});
 try {
  let ready=false;for(let i=0;i<40&&!ready;i++){ready=await new Promise(resolve=>{const req=http.get('http://127.0.0.1:5237/shell.html',r=>{r.resume();resolve(r.statusCode===200);});req.on('error',()=>resolve(false));req.setTimeout(1000,()=>req.destroy());});if(!ready)await new Promise(resolve=>setTimeout(resolve,500));}
  if(!ready)throw Error('Canonical local shell server did not start');
  await run('scripts/live-drive/pipeline-delete/shell-drive.mjs');
 }finally{server.kill();}
}catch(error){console.error(String(error));process.exitCode=1;}
finally{mkdirSync(path.join(root,'outputs/pipeline-delete-verification'),{recursive:true});writeFileSync(path.join(root,'outputs/pipeline-delete-verification/runtime-transcript.json'),JSON.stringify({generatedAt:new Date().toISOString(),commands},null,2));}
