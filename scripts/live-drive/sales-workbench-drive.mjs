import fs from 'node:fs';
import assert from 'node:assert/strict';
import {resolvePlaywright,buildLaunchOptions} from './live-drive.mjs';
const {chromium}=await resolvePlaywright();const browser=await chromium.launch(buildLaunchOptions());
const out='scripts/live-drive/artifacts/sales-workbench';fs.mkdirSync(out,{recursive:true});const evidence=[];
const catalog=(page,detail)=>page.evaluate(detail=>window.dispatchEvent(new CustomEvent('sales-catalog-harness',{detail})),detail);
try{
for(const [width,height]of[[1536,770],[1366,768],[1024,768],[900,1000]])for(const theme of ['light','dark']){
 const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});const page=await context.newPage();await page.route('https://fonts.googleapis.com/**',r=>r.abort());await page.goto('http://127.0.0.1:5213',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Quick offer',exact:true}).waitFor();if(theme==='dark')await page.locator('[data-theme-toggle]').click();
 for(const size of [1,80,80000]){
  await catalog(page,{reset:true,size});const search=page.getByRole('searchbox',{name:'Search Catalog offers'});await search.fill('');assert.equal(await page.locator('[aria-label="Offers"] .so-row').count(),Math.min(size,5));
  if(size>5){await page.getByRole('button',{name:'Next offers',exact:true}).click();await page.getByText('Page 2 · up to 5 offers',{exact:true}).waitFor();assert.equal(await page.locator('[aria-label="Offers"] .so-row').count(),5);await search.fill('Catalog item '+size);await page.locator('[aria-label="Offers"]').getByText('Catalog item '+size,{exact:true}).waitFor();assert.equal(await page.locator('[aria-label="Offers"] .so-row').count(),1);}
  await search.fill('no such literal offer');assert.equal(await page.locator('[aria-label="Offers"] .so-row').count(),0);await search.fill('');
  evidence.push({width,height,theme,simulatedCatalog:size,boundedRows:'PASS',searchAndPaging:'PASS'});
 }
 await page.getByRole('button',{name:'Record terms',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('Search offers by name').fill('Catalog item 80000');await dialog.getByLabel('Offer',{exact:true}).selectOption('offer-80000');await dialog.getByLabel('Search offers by name').fill('Onboarding');assert.equal(await dialog.getByLabel('Offer',{exact:true}).inputValue(),'offer-80000');await page.keyboard.press('Escape');await page.getByRole('button',{name:'Discard changes'}).click();
 await catalog(page,{mode:'error'});await page.getByRole('button',{name:'Retry offers'}).click();await page.locator('[aria-label="Offers"]').waitFor();
 await catalog(page,{mode:'loading'});await page.getByText('Loading Catalog offers…',{exact:true}).waitFor();assert.equal(await page.locator('[aria-label="Offers"] .so-row').count(),0);await catalog(page,{mode:'ready'});
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('sales-agreements-harness',{detail:{mode:'populated',reset:true}})));
 await page.getByRole('searchbox',{name:'Find client terms'}).fill('Jordan');assert.equal(await page.locator('[aria-label="Commercial terms and retainers"] .so-row').count(),1);
 await page.getByLabel('Terms status',{exact:true}).selectOption('draft');assert.equal(await page.locator('[aria-label="Commercial terms and retainers"] .so-row').count(),0);
 await page.getByRole('searchbox',{name:'Find client terms'}).fill('');assert.equal(await page.locator('[aria-label="Commercial terms and retainers"] .so-row').count(),1);
 await page.getByLabel('Terms status',{exact:true}).selectOption('all');
 const bounds=await page.locator('.so-offers').boundingBox();assert(bounds.x>=0 && bounds.x+bounds.width<=width+1);
 for(const tab of await page.getByRole('tab').all()){const b=await tab.boundingBox();assert(b.x>=0&&b.x+b.width<=width+1);}
 await page.getByRole('searchbox',{name:'Search Catalog offers'}).focus();assert.equal(await page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle),'solid');
 await page.screenshot({path:out+'/'+width+'x'+height+'-'+theme+'.png',fullPage:true});
 evidence.push({width,height,theme,selectionSurvivesSearch:'PASS',errorRetryLoading:'PASS',focus:'PASS',tabsFit:'PASS'});await context.close();
}
}finally{await browser.close();fs.writeFileSync(out+'/evidence.json',JSON.stringify({environment:'Local real Chromium and mounted UI; simulated source datasets, not production load or authenticated proof',evidence},null,2));}
console.log('PASS',evidence.length,'workbench scenarios');
