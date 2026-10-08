// Delay genuine local raster work to reproduce overlapping UI requests. All
// accounts, queue records and photos come from the intercepted parent fixture.
const fs=require('node:fs'),path=require('node:path');
module.exports=async({page,expect,assert,engine,width,out,photo,db,writes})=>{
 const original=await page.evaluate(()=>queue),dbBefore=JSON.stringify([...db.print_queue]),writesBefore=writes.length;
 await page.evaluate(image=>{
  queue=[{id:'synthetic-race-sheet',english:'QA Print race',spanish:'Manual',photo:image,size:'Business Card · 3.375 × 2 in'}];show('queue');refreshQueue();
  document.getElementById('cutLinesToggle').checked=true;
  const base=window.rasterizeFinishedLabel;window.__printRaceJobs=[];
  window.__restorePrintRace=()=>{window.rasterizeFinishedLabel=base;};
  window.rasterizeFinishedLabel=async item=>{
   const job={settled:false};const gate=new Promise((resolve,reject)=>Object.assign(job,{resolve,reject}));__printRaceJobs.push(job);
   try{await gate;return await base(item);}finally{job.settled=true;}
  };
 },photo);
 const jobs=n=>page.waitForFunction(n=>__printRaceJobs.length===n,n);
 const resolve=async index=>{await page.evaluate(i=>__printRaceJobs[i].resolve(),index);await page.waitForFunction(i=>__printRaceJobs[i].settled,index);};
 const ready=cuts=>page.waitForFunction(cuts=>document.querySelectorAll('#printRoot .print-page').length===1&&document.querySelectorAll('#printRoot .raster-print-label').length===1&&document.querySelector('#printRoot .raster-print-label').classList.contains('cut-lines')===cuts&&[...document.querySelectorAll('#printRoot img')].every(x=>x.complete&&x.naturalWidth)&&!document.getElementById('printNowBtn').disabled,cuts);
 try{
  await page.locator('#mockSheets').click();await jobs(1);await expect(page.locator('#printNowBtn')).toBeDisabled();
  await page.locator('#cutLinesToggle').uncheck();await jobs(2);await page.locator('#cutLinesToggle').check();await jobs(3);
  await resolve(2);await ready(true);await resolve(0);await resolve(1);await ready(true);
  assert.equal(await page.locator('#printRoot .raster-print-label').count(),1,'Late cut-line renders cannot append duplicate labels');
  const printBefore=await page.evaluate(()=>__printed);
  await page.evaluate(()=>{const img=document.querySelector('#printRoot img');window.__printDecodeHeld=false;img.decode=()=>new Promise(resolve=>{window.__releasePrintDecode=resolve;window.__printDecodeHeld=true;});});
  await page.locator('#printNowBtn').click();await page.waitForFunction(()=>__printDecodeHeld);
  await page.locator('#cutLinesToggle').uncheck();await jobs(4);await page.evaluate(()=>__releasePrintDecode());await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await page.evaluate(()=>__printed),printBefore,'An old Print click cannot print while replacement sheets are pending');await expect(page.locator('#printNowBtn')).toBeDisabled();
  await resolve(3);await ready(false);await expect(page.locator('#printNowBtn')).toHaveText('Print Labels');await page.locator('#printNowBtn').click();await page.waitForFunction(n=>__printed===n+1,printBefore);
  await page.locator('#cutLinesToggle').check();await jobs(5);await page.locator('#printPreviewBack').click();await expect(page.locator('#queue')).toBeVisible();
  await resolve(4);assert.equal(await page.locator('#printRoot .raster-print-label').count(),0,'A closed preview cannot be repainted by late output');
  await page.locator('#mockSheets').click();await jobs(6);await resolve(5);await ready(true);
  await page.locator('#cutLinesToggle').uncheck();await jobs(7);await page.evaluate(()=>__printRaceJobs[6].reject(new Error('Synthetic raster failure')));await page.waitForFunction(()=>__printRaceJobs[6].settled);await expect(page.locator('#printNowBtn')).toBeDisabled();
  await page.locator('#printPreviewBack').click();await page.locator('#mockSheets').click();await jobs(8);await resolve(7);await ready(false);
  assert.equal(await page.evaluate(()=>queue.length),1);assert.equal(JSON.stringify([...db.print_queue]),dbBefore);assert.equal(writes.length,writesBefore);
  fs.writeFileSync(path.join(out,`${width}-print-races.json`),JSON.stringify({engine,width,passed:true,cases:['rapid cut toggles with newest-first completion','native Print canceled after changed sheets during image decode','late output after close','reopen retains cut choice','failed current render retries'],labels:1,pages:1,queuePreserved:true,databaseWrites:0},null,2));
 }finally{
  await page.evaluate(rows=>{for(const job of __printRaceJobs)if(!job.settled)job.resolve();__restorePrintRace();queue=rows;},original);
 }
};
