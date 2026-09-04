// Real browser interaction against the mounted Sales components; sources are local fixtures.
// Start: node node_modules/vite/bin/vite.js --config scripts/live-drive/harness/sales-mount/vite.config.ts --port 5213
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { resolvePlaywright, buildLaunchOptions } from "./live-drive.mjs";
const {chromium}=await resolvePlaywright();
const browser=await chromium.launch(buildLaunchOptions());
const out=path.resolve('scripts/live-drive/artifacts/sales-usability');fs.mkdirSync(out,{recursive:true});
const evidence=[];
const url=process.env.SALES_DRIVE_URL || 'http://127.0.0.1:5213';
const open=async(page)=>{await page.goto(url,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Quick offer',exact:true}).waitFor();};
const control=(page,detail)=>page.evaluate(detail=>window.dispatchEvent(new CustomEvent('sales-agreements-harness',{detail})),detail);
try {
for(const [width,height] of [[1536,770],[1366,768],[1024,768],[900,1000]])for(const theme of ['light','dark']){
 const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});const page=await context.newPage();
 await page.route('https://fonts.googleapis.com/**',route=>route.abort());await open(page);
 if(theme==='dark')await page.locator('[data-theme-toggle]').click();
 for(const name of ['Record it','Quick offer','Record terms']){
  console.log('Checking',width,height,theme,name); const opener=page.getByRole('button',{name,exact:true});await opener.click();const dialog=page.getByRole('dialog');
  assert.equal(await dialog.evaluate(e=>!!e.closest('[inert]')),false);
  const box=await dialog.boundingBox();assert(box.x>=0 && box.x+box.width<=width+1 && box.height<=height+1);
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await page.getByRole('dialog').count(),0);
  await opener.click();await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
  await opener.click();await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);
 }
 await page.getByRole('button',{name:'Quick offer',exact:true}).click();
 await page.getByRole('textbox',{name:'Name',exact:true}).click();await page.keyboard.type('Unsaved draft');
 await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.getByRole('alertdialog').waitFor();
 await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Discard changes');
 await page.getByRole('button',{name:'Continue editing'}).click();assert.equal(await page.getByRole('textbox',{name:'Name',exact:true}).inputValue(),'Unsaved draft');
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'Discard changes'}).click();
 const tabs=page.getByRole('tab');assert.equal(await tabs.count(),6);
 for(const tab of await tabs.all()){const b=await tab.boundingBox();assert(b && b.x>=0 && b.x+b.width<=width+1);}
 await page.screenshot({path:path.join(out,`${width}x${height}-${theme}.png`)});
 evidence.push({viewport:`${width}x${height}`,theme,drawerCancelXEscape:'PASS',dirtyDiscardContinue:'PASS',keyboard:'PASS',tabReachability:'PASS',drawerFit:'PASS',reducedMotion:'emulated'});
 await context.close();
}
const context=await browser.newContext({viewport:{width:1366,height:768}});const page=await context.newPage();await page.route('https://fonts.googleapis.com/**',r=>r.abort());await open(page);
await control(page,{mode:'none',reset:true});
await page.getByRole('button',{name:'Quick offer',exact:true}).click();await page.getByRole('textbox',{name:'Name',exact:true}).fill('Browser proof draft');await page.getByRole('button',{name:'Create offer',exact:true}).click();await page.getByRole('button',{name:'Continue setup in Catalog'}).click();await page.getByText('Browser proof draft',{exact:true}).first().waitFor();await page.getByRole('button',{name:'Return to Sales',exact:true}).click();
evidence.push({flow:'Quick Offer -> canonical fixture Catalog -> Sales',result:'PASS'});
await page.getByRole('button',{name:'Record terms',exact:true}).click();await page.getByLabel('Client',{exact:true}).selectOption('c1');await page.getByLabel('Offer',{exact:true}).selectOption('offer-1');await page.getByPlaceholder('Amount',{exact:true}).fill('125');await page.getByRole('dialog').getByRole('button',{name:'Record terms',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});
await page.reload({waitUntil:'domcontentloaded'});await page.locator('[aria-label="Commercial terms and retainers"] .so-row').first().click();await page.getByRole('button',{name:'Edit commercial terms'}).click();await page.getByPlaceholder('Anything you want to remember about this arrangement').fill('Edited in real Chromium');await page.getByRole('button',{name:'Save changes'}).click();await page.getByRole('dialog').waitFor({state:'detached'});await page.reload({waitUntil:'domcontentloaded'});await page.locator('[aria-label="Commercial terms and retainers"] .so-row').first().click();await page.getByText('Edited in real Chromium',{exact:true}).waitFor();await page.getByRole('dialog').getByRole('button',{name:'Close details',exact:true}).click();
evidence.push({flow:'Create commercial terms -> reload -> edit -> reload',result:'PASS',persistence:'local fixture only'});
await control(page,{mode:'save-error'});await page.getByRole('button',{name:'Record terms',exact:true}).click();await page.getByLabel('Client',{exact:true}).selectOption('c2');await page.getByLabel('Offer',{exact:true}).selectOption('offer-1');await page.getByPlaceholder('Amount',{exact:true}).fill('50');await page.getByRole('dialog').getByRole('button',{name:'Record terms',exact:true}).click();await page.getByRole('alert').waitFor();await control(page,{mode:'none'});await page.getByRole('dialog').getByRole('button',{name:'Record terms',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});
evidence.push({flow:'Rejected commercial save -> retry same draft',result:'PASS'});
await page.getByRole('button',{name:'Record terms',exact:true}).click();await page.getByLabel('Client',{exact:true}).selectOption('c1');await control(page,{tenant:'harness-tenant-2',mode:'loading',reset:true});await page.getByRole('dialog').waitFor({state:'detached'});assert.equal(await page.getByRole('alertdialog').count(),0);await control(page,{mode:'none'});assert.equal(await page.locator('[aria-label="Commercial terms and retainers"] .so-row').count(),0);
evidence.push({flow:'Workspace switch clears open draft and old records',result:'PASS',scope:'agreement fixture epoch'});
await context.close();
} catch(error){evidence.push({result:'FAIL',message:error.message});throw error;}
finally{fs.writeFileSync(path.join(out,'evidence.json'),JSON.stringify({environment:'Real Chromium; real mounted UI; local fixture sources; no authenticated production proof',evidence},null,2));await browser.close();console.log(JSON.stringify(evidence,null,2));}