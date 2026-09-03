/** Rendered proof of the real Solo n8n UI with the isolated local transport only. */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const base = process.argv[2] || 'http://127.0.0.1:5203/';
const url = new URL(base);
if (url.hostname !== '127.0.0.1' || url.port !== '5203') throw new Error('This mutating fixture drive is restricted to the local Integration harness.');
const out = path.resolve(process.argv[3] || 'evidence/n8n-connections');mkdirSync(out,{recursive:true});
const checks=[];const errors=[];let browser;
function check(pass,label){checks.push({label,pass:!!pass});if(!pass)throw new Error(label);}
async function open(page,data='broken',theme='dark'){
 await page.goto(`${base}?theme=${theme}&data=${data}`);await page.locator('.ig-card[data-provider="n8n"]').click();await page.getByRole('dialog').waitFor();await page.locator('.ig-panel').evaluate(async e=>Promise.all(e.getAnimations().map(a=>a.finished)));
}
try{
 browser=await chromium.launch({headless:true});
 for(const theme of ['dark','light'])for(const [width,height] of [[1536,770],[1366,768],[1024,768],[900,1000]]){
  const page=await browser.newPage({viewport:{width,height}});page.on('pageerror',e=>errors.push(e.message));await open(page,'broken',theme);const tag=`${theme}-${width}x${height}`;
  const geometry=await page.evaluate(()=>{const r=document.querySelector('.ig-panel').getBoundingClientRect();return {sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight,left:r.left,right:r.right,bottom:r.bottom,overflow:[...document.querySelectorAll('.ig-panel *')].filter(e=>e.clientWidth>0&&e.scrollWidth>e.clientWidth+2&&getComputedStyle(e).overflowX==='visible').length};});
  check(geometry.sw<=width&&geometry.sh<=height&&geometry.left>=0&&geometry.right<=width&&geometry.bottom<=height,tag+' viewport fit');check(geometry.overflow===0,tag+' no visible overflow');
  check(await page.locator('.ig-n8n-summary').innerText().then(t=>t.includes('API connection')&&t.includes('Paige tools (MCP)')&&t.includes('OAuth setup unavailable')),tag+' independent overview');
  check(await page.getByRole('dialog').locator('input').count()===0,tag+' no idle API form');check(await page.getByRole('dialog').innerText().then(t=>!t.includes('0 workflows')),tag+' stale zero not claimed');
  const styling=await page.evaluate(()=>{const b=getComputedStyle(document.querySelector('.ig-panel .ig-btn'));const t=getComputedStyle(document.querySelector('.ig-n8n-tabs button'));return {border:b.borderTopWidth,font:parseFloat(b.fontSize),tabFont:parseFloat(t.fontSize),nowrap:t.whiteSpace};});
  check(styling.border==='1px'&&styling.font<=12&&styling.tabFont<=12&&styling.nowrap==='nowrap',tag+' approved compact button and tab styling');
  await page.screenshot({path:path.join(out,tag+'-api.png')});
  await page.getByRole('tab',{name:'API connection',exact:true}).focus();await page.keyboard.press('ArrowRight');check(await page.getByRole('tab',{name:'Paige tools (MCP)',exact:true}).getAttribute('aria-selected')==='true',tag+' arrow tabs');
  check(await page.getByRole('dialog').locator('input').count()===0,tag+' no MCP credential form');check(await page.getByRole('button',{name:'Connect n8n with OAuth',exact:true}).count()===0,tag+' no blocked OAuth action');await page.screenshot({path:path.join(out,tag+'-mcp.png')});
  await page.getByRole('tab',{name:'API connection',exact:true}).click();await page.getByRole('button',{name:'Reconnect API',exact:true}).click();await page.locator('.ig-form input[type=url]').fill('https://fixture.example');await page.locator('.ig-form input[type=password]').fill('fixture-only');check(await page.locator('.ig-form input[type=password]').count()===1,tag+' masked API field');
  await page.getByRole('tab',{name:'Paige tools (MCP)',exact:true}).click();await page.getByRole('alertdialog').waitFor();await page.getByRole('button',{name:'Keep editing',exact:true}).click();check(await page.locator('.ig-form input[type=url]').inputValue()==='https://fixture.example',tag+' retain draft');await page.getByRole('button',{name:'Close n8n',exact:true}).click();await page.getByRole('button',{name:/^Discard/}).click();check(await page.getByRole('dialog').count()===0,tag+' discard close');check(await page.locator('.ig-card[data-provider="n8n"]').evaluate(e=>e===document.activeElement),tag+' restored focus');await page.close();
 }
 const page=await browser.newPage({viewport:{width:1366,height:768}});page.on('pageerror',e=>errors.push(e.message));
 for(const data of ['api-error','mcp-error','error','empty','readonly','connected']){
  await open(page,data);check(await page.getByRole('dialog').count()===1,data+' drawer reachable');
  if(data==='api-error')check(await page.locator('.ig-n8n-summary').innerText().then(t=>t.includes('OAuth setup unavailable')),data+' MCP retained');
  if(data==='mcp-error')check(await page.locator('.ig-n8n-summary').innerText().then(t=>t.includes('Needs attention')),data+' API retained');
  if(data==='readonly')check(await page.getByRole('button',{name:'Disconnect API',exact:true}).count()===0,'viewer cannot mutate');
  if(data==='connected')check(await page.getByRole('dialog').innerText().then(t=>t.includes('health has not been verified')),'saved connected flag not health proof');
 }
 await open(page,'broken');await page.getByRole('button',{name:'Disconnect API',exact:true}).click();await page.getByRole('button',{name:'Keep connection',exact:true}).click();check(await page.getByRole('button',{name:'Disconnect API',exact:true}).count()===1,'API disconnect cancel');await page.getByRole('button',{name:'Disconnect API',exact:true}).click();await page.getByRole('button',{name:'Confirm disconnect',exact:true}).click();await page.getByRole('button',{name:'Connect API',exact:true}).waitFor();check(await page.locator('.ig-n8n-summary').innerText().then(t=>t.includes('OAuth setup unavailable')),'API disconnect preserves MCP');
 await open(page,'pending');await page.getByRole('button',{name:'Edit API connection',exact:true}).click();await page.locator('.ig-form input[type=password]').fill('fixture-only');await page.getByRole('button',{name:'Save API connection',exact:true}).click();await page.evaluate(()=>window.dispatchEvent(new Event('n8n-harness-switch')));check(await page.getByRole('dialog').count()===0,'workspace closes pending drawer');await page.evaluate(()=>window.dispatchEvent(new Event('n8n-harness-finish')));await page.locator('.ig-card[data-provider="n8n"]').click();check(await page.getByRole('button',{name:'Connect API',exact:true}).count()===1,'late save cannot populate new workspace');check(await page.getByRole('dialog').locator('input[type=password]').count()===0,'workspace clears secret draft');
 await page.emulateMedia({reducedMotion:'reduce'});check(await page.locator('.ig-panel').evaluate(e=>getComputedStyle(e).animationName)==='none','reduced motion');
 check(errors.length===0,'no browser errors');console.log(JSON.stringify({passed:checks.length,errors}));
}finally{if(browser)await browser.close();writeFileSync(path.join(out,'proof.json'),JSON.stringify({scope:'Real UI and hooks, synthetic local transport only. No authenticated production proof.',checks,errors},null,2));}
