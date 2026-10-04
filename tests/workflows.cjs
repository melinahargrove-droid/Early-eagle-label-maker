const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
(async () => {
 const server=http.createServer((req,res)=>{const p=path.join(root,new URL(req.url,'http://localhost').pathname);try{res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.png')?'image/png':'text/html');res.end(fs.readFileSync(p.endsWith('/')?p+'index.html':p))}catch{res.statusCode=404;res.end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.on('listening',r));
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 try {
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack||e.message));page.on('dialog',d=>d.dismiss());
 await page.route('**/*',route=>{const url=route.request().url();if(url.startsWith('http://127.0.0.1:'))return route.continue();if(url.includes('.supabase.co/')){const body=url.includes('/auth/')?{access_token:'synthetic-test-token',refresh_token:'synthetic-refresh',expires_in:3600,user:{id:'synthetic-owner',email:'synthetic@example.invalid',is_anonymous:false,identities:[{}]}}:url.includes('/rpc/')?{active:true}:[];return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)})}return route.abort()});
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 await page.waitForFunction(()=>window.LittleLabelWorkflowSave&&window.NLStudents&&cloudReady);
 if(await page.locator('#llwStart').count())await page.locator('#llwStart').click();
 await page.evaluate(()=>LittleLabelsAccess.check());
 // Synthetic test state only: no real login, entitlement, or cloud requests.
 await page.evaluate(()=>{cloudReady=false;show('makeList')});
 await page.locator('#makeListInput').fill('Synthetic Blocks\nSynthetic Pencils');
 await page.locator('#makeListCreateBtn').dispatchEvent('click');
 await page.locator('.mli-en').first().fill('Synthetic Edited Blocks');
 await page.locator('#mliBack').click();
 await page.locator('#makeListCreateBtn').dispatchEvent('click');
 assert.equal(await page.locator('.mli-en').first().inputValue(),'Synthetic Edited Blocks');
 await page.locator('#mliPrint').click();
 await page.waitForFunction(()=>queue.length===2);
 assert.equal(await page.evaluate(()=>library.length),2);
 assert.equal(await page.evaluate(()=>queue[0].english),'Synthetic Edited Blocks');
 console.log('PASS list edit/back/reopen/save-to-library/add-to-print');
 // Name + photo via the real upload handler, with a generated synthetic solid square.
 await page.evaluate(()=>{show('home');document.getElementById('nameLabelsOverlay').classList.remove('hide')});
 await page.locator('#nlNames').fill('Synthetic Student');
 await page.locator('[data-style="photo"]').click();
 const chooser=page.waitForEvent('filechooser');await page.locator('#nlPhotos button').click();
 const file=await chooser;await file.setFiles({name:'synthetic.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlS8AAAAASUVORK5CYII=','base64')});
 await page.waitForFunction(()=>NLStudents()[0].photo.startsWith('data:'));
 await page.locator('#nlCopies').selectOption('2');await page.locator('#nlNext').click();
 await page.waitForFunction(()=>queue.length===4);
 assert.ok(await page.evaluate(()=>queue.slice(2).every(x=>x.photo.startsWith('data:'))));
 assert.equal(await page.evaluate(()=>library.length),3);
 console.log('PASS real name-photo upload, two queue copies, one library record');
 // Real phone-sized interactions for the clarified typed/review/save/print workflow.
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>show('home'));
 await page.locator('#homeTypeBtn').click();
 await page.locator('#tlEnglish').fill('Synthetic Typed Label');
 await page.locator('#tlSecond').fill('Synthetic Translation');
 await page.locator('#tlBack').click();
 await page.locator('#homeTypeBtn').click();
 assert.equal(await page.locator('#tlEnglish').inputValue(),'Synthetic Typed Label');
 await page.locator('#tlNext').click();
 await page.locator('#preview').waitFor({state:'visible'});
 assert.equal(await page.locator('#labelEnglish').textContent(),'Synthetic Typed Label');
 await page.locator('#englishInput').fill('Synthetic Reviewed Label');
 await page.locator('#spanishInput').fill('Teacher-reviewed Translation');
 await page.locator('#previewBack').click();
 assert.equal(await page.locator('#tlEnglish').inputValue(),'Synthetic Reviewed Label');
 assert.equal(await page.locator('#tlSecond').inputValue(),'Teacher-reviewed Translation');
 await page.locator('#tlNext').click();
 await page.locator('#chooseSetBtn').click();
 await page.locator('#addToQueue').click();
 await page.locator('#queue').waitFor({state:'visible'});
 assert.match(await page.locator('#queueSaveNotice').textContent(),/session only/i);
 const printBox=await page.locator('#mockSheets').boundingBox(),rowsBox=await page.locator('#queueItems').boundingBox();
 assert.ok(printBox.y<rowsBox.y,'Print preview should precede the queue rows');
 assert.equal(await page.locator('#mockSheets').textContent(),'Preview Print Sheets');
 assert.equal(await page.locator('#queueItems .queue-actions button').first().textContent(),'Mark printed');
 await page.locator('#mockSheets').click();
 await page.locator('#printPreview').waitFor({state:'visible'});
 await page.waitForFunction(()=>document.querySelectorAll('#sheetPreviewPages img').length>0);
 assert.match(await page.locator('#printNowBtn').textContent(),/Open Print PDF/);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
 console.log('PASS 390px typed Back/review/save/print-preview workflow without horizontal overflow');
 // Controlled cloud adapter verifies bodies/retry/session ownership, without networking.
 const result=await page.evaluate(async()=>{
  currentUser={id:'synthetic-owner'};cloudReady=true;let fail=true;const labels=new Map(),printed=new Map(),calls=[];
  restFetch=async(p,o)=>{calls.push(p);const store=p.startsWith('labels')?labels:printed;for(const r of JSON.parse(o.body))store.set(r.id,r);if(p.startsWith('print_queue')&&fail){fail=false;throw Error('Synthetic lost response')}return []};loadCloudData=async()=>{};
  const api=LittleLabelWorkflowSave,job=api.create([{english:'Synthetic Retry',photo:'',spanish:''}],['Business Card · 3.375 × 2 in']);
  let failed=false;try{await api.save(job,true)}catch{failed=true}await api.save(job,true);await api.save(job,true);
  const switched=api.create([{english:'Synthetic Private',photo:'',spanish:''}],['Business Card']);currentUser={id:'other-synthetic-owner'};let blocked=false;try{await api.save(switched,true)}catch{blocked=true}
  return {failed,blocked,labelCount:labels.size,queueCount:printed.size,calls:calls.length};
 });
 assert.deepEqual(result,{failed:true,blocked:true,labelCount:1,queueCount:1,calls:4});
 assert.deepEqual(errors,[]);console.log('PASS cloud retry deduplication and account-change write guard');
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exit(1)});
