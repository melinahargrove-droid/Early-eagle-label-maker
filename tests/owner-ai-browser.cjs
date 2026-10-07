// Real Chromium/WebKit owner/nonowner workflows. All remote I/O is synthetic.
const playwright=require('playwright'),fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),engine=process.env.BROWSER_ENGINE||'chromium',out=path.join(root,'test-results/owner-ai',engine);fs.mkdirSync(out,{recursive:true});
(async()=>{
 const server=http.createServer((req,res)=>{try{let file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(root+path.sep)&&file!==root)throw Error();if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');res.setHeader('Content-Type',({'.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]||'text/html');res.end(fs.readFileSync(file))}catch{res.statusCode=404;res.end()}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;let browser;
 try{
  browser=await playwright[engine].launch({headless:true});
  for(const width of [390,1280]){
   const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'}),page=await context.newPage();page.setDefaultTimeout(20000);
   const errors=[],calls=[],blocked=[],prompts=[],held=[];let owner=true,holdIdentify=false,holdPicture=false,decline=false,photo;
   page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{prompts.push(d.message());if(d.type()==='confirm'){assert.doesNotMatch(d.message(),/Cost: 1|Uses 1 Credit|buy credits/i);if(decline){decline=false;void d.dismiss()}else void d.accept()}else void d.dismiss()});
   await page.addInitScript(()=>{localStorage.setItem('littleLabelsWelcomeSeenV1','1');window.__nativePrintCalls=0;window.print=()=>window.__nativePrintCalls++});
   await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());if(url.origin===origin)return route.continue();
    const json=(value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
    if(url.hostname!=='ctmqvbsjliinlddfolti.supabase.co'){blocked.push(url.href);return route.abort()}
    if(url.pathname.includes('/auth/'))return json({access_token:'synthetic-owner',refresh_token:'synthetic-refresh',expires_in:3600,user:{id:'synthetic-owner',is_anonymous:false,email:'synthetic@example.invalid',identities:[{}]}});
    if(url.pathname.endsWith('/little_labels_admin_status'))return json({is_admin:owner});
    if(url.pathname.includes('/rpc/'))return json({active:true,is_admin:owner});
    if(!url.pathname.includes('/functions/'))return json([]);
    const payload=req.postDataJSON(),slug=url.pathname.split('/').pop();calls.push({slug,payload,authorization:req.headers().authorization});
    if(!owner)return json({success:false,error:'Synthetic owner required'},403);
    if(slug==='identify-material'){
     const value={success:true,identification:{english:'Building blocks',translation:payload.target_language==='none'?'':'Bloques',language:payload.target_language}};
     if(holdIdentify){holdIdentify=false;held.push(()=>json(value));return;}return json(value);
    }
    if(slug==='translate-label')return json({success:true,translation:'Palabras traducidas',language:payload.target_language});
    if(slug==='batch-wording')return json({success:true,items:payload.items.map(english=>({english,translation:'Texto '+english}))});
    if(slug==='label-picture'){if(holdPicture){holdPicture=false;held.push(()=>json({success:true,photo_data:photo}));return;}return json({success:true,photo_data:photo});}
    if(slug==='batch-labels')return json({success:true,items:[payload.mode==='url_photo'?{photo_data:photo,image_source:'product',needs_product_image:false}:{english:'Product blocks',translation:'Bloques',spanish:'Bloques',target_language:payload.target_language,photo_data:'',image_source:'missing',needs_product_image:true}]});
    throw Error('Unmocked endpoint '+slug);
   });
   const shot=name=>page.screenshot({path:path.join(out,`${width}-${name}.png`),fullPage:true});
   const count=slug=>calls.filter(x=>x.slug===slug).length;
   async function upload(){const choose=page.waitForEvent('filechooser');await page.locator('#homeGalleryBtn').click();await(await choose).setFiles({name:'synthetic-blocks.png',mimeType:'image/png',buffer:Buffer.from(photo.split(',')[1],'base64')});await page.locator('#preview').waitFor({state:'visible'})}
   try{
    await page.goto(origin);await page.waitForFunction(()=>window.LittleLabelsOwnerAI&&cloudReady);assert.equal(await page.evaluate(()=>LittleLabelsOwnerAI.check(true)),true);await page.evaluate(()=>{cloudReady=false});
    photo=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=320;c.height=240;const x=c.getContext('2d');x.fillStyle='#fff8e9';x.fillRect(0,0,320,240);x.fillStyle='#669abe';x.fillRect(45,80,90,90);x.fillStyle='#c88660';x.fillRect(150,60,100,110);return c.toDataURL('image/png')});
    await upload();assert.equal(calls.length,0);assert.equal(await page.locator('#englishInput').inputValue(),'');assert.equal(await page.locator('#identifyPhotoBtn').isEnabled(),true);
    decline=true;await page.locator('#identifyPhotoBtn').click();assert.equal(calls.length,0);
    holdIdentify=true;await page.locator('#identifyPhotoBtn').dblclick({delay:10});await page.waitForFunction(()=>document.getElementById('photoAIStatus').textContent.includes('Finding'));while(!held.length)await page.waitForTimeout(10);assert.equal(count('identify-material'),1);
    await page.locator('#englishInput').fill('Teacher wording');await held.shift()().catch(()=>{});await page.waitForTimeout(100);assert.equal(await page.locator('#englishInput').inputValue(),'Teacher wording');
    await page.locator('#identifyPhotoBtn').click();await page.waitForFunction(()=>document.getElementById('englishInput').value==='Building blocks');assert.equal(count('identify-material'),2);assert.equal(await page.locator('#spanishInput').inputValue(),'Bloques');
    assert.doesNotMatch(await page.locator('#preview').innerText(),/\bcredits?\b|Unlock more/i);await shot('owner-photo');
    const before=calls.length;await page.locator('#englishInput').fill('Counting blocks');await page.locator('#spanishInput').fill('Teacher translation');await page.waitForTimeout(950);assert.equal(calls.length,before);await page.locator('#singleTranslationTools .ll-ai-translate').click();await page.waitForFunction(()=>document.getElementById('spanishInput').value==='Palabras traducidas');assert.equal(count('translate-label'),1);
    await page.locator('#chooseSetBtn').click();await page.locator('#addToQueue').click();await page.locator('#queue').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>queue.length),2);await page.locator('#queueBack').click();
    await page.locator('#homeTypeBtn').click();await page.locator('#tlEnglish').fill('Pencils');await page.locator('#tlTranslationTools .ll-ai-translate').click();await page.waitForFunction(()=>document.getElementById('tlSecond').value==='Palabras traducidas');assert.equal(count('translate-label'),2);assert.equal(await page.evaluate(()=>typeof LittleLabelsCreditTestTransport),'undefined');await shot('owner-typed');await page.locator('#tlBack').click();
    await page.locator('#homeProductBtn').click();await page.locator('#productLinkInput').fill('https://retailer.example/blocks');await page.locator('#createLinkDraftBtn').click();await page.locator('#batchReview').waitFor({state:'visible'});assert.equal(calls.at(-1).payload.mode,'url');
    await page.locator('#batchEnglish-0').fill('My product wording');await page.locator('#batchSecond-0').fill('My second line');const productBefore=calls.length;await page.waitForTimeout(950);assert.equal(calls.length,productBefore);await page.getByRole('button',{name:'↻ Try Product Photo Again'}).click();await page.waitForFunction(()=>batchDrafts[0].image_source==='product');assert.equal(calls.at(-1).payload.mode,'url_photo');assert.equal(await page.locator('#batchEnglish-0').inputValue(),'My product wording');assert.equal(await page.locator('#batchSecond-0').inputValue(),'My second line');
    await page.locator('#batchTranslate-0').click();await page.waitForFunction(()=>document.getElementById('batchSecond-0').value==='Palabras traducidas');await shot('owner-product');await page.locator('#batchReviewBack').click();await page.locator('#batchBack').click();
    await page.locator('#homeListBtn').click();await page.locator('#makeListInput').fill('Blocks\nPencils');await page.locator('#makeListCreateBtn').click();await page.locator('#mliTranslate').click();await page.waitForFunction(()=>document.querySelector('.mli-tr').value==='Texto Blocks');assert.equal(count('batch-wording'),1);
    holdPicture=true;await page.locator('#mliAllPics').click();while(!held.length)await page.waitForTimeout(10);assert.equal(count('label-picture'),1);await page.locator('#mliCancel').click();await held.shift()().catch(()=>{});await page.waitForTimeout(100);assert.equal(count('label-picture'),1);assert.equal(await page.locator('.mli-preview img').count(),0);
    await page.locator('#mliAllPics').click();await page.waitForFunction(()=>document.querySelectorAll('.mli-preview img').length===2);assert.equal(count('label-picture'),3);await shot('owner-list');await page.locator('#mliBack').click();await page.locator('#makeListBack').click();
    owner=false;assert.equal(await page.evaluate(()=>LittleLabelsOwnerAI.check(true)),false);const protectedCount=calls.length;await upload();assert.equal(await page.locator('#identifyPhotoBtn').isVisible(),false);assert.equal(await page.locator('#singleTranslationTools .ll-unlock-features').isVisible(),true);await page.locator('#englishInput').fill('Customer manual label');await page.locator('#spanishInput').fill('Texto manual');await page.waitForTimeout(950);assert.equal(calls.length,protectedCount);
    const denied=await page.evaluate(async()=>{try{await littleLabelsAIFetch(TRANSLATE_URL,{method:'POST',body:'{"english":"forged"}'});return false}catch{return true}});assert.equal(denied,true);assert.equal(calls.length,protectedCount);await shot('nonowner-manual');await page.locator('#chooseSetBtn').click();await page.locator('#addToQueue').click();await page.locator('#queue').waitFor({state:'visible'});await page.locator('#mockSheets').click();await page.locator('#printPreview').waitFor({state:'visible'});await page.waitForFunction(()=>[...document.querySelectorAll('#sheetPreviewPages img')].length>0&&[...document.querySelectorAll('#sheetPreviewPages img')].every(x=>x.complete&&x.naturalWidth));await page.locator('#printNowBtn').click();await page.waitForFunction(()=>__nativePrintCalls===1);assert.equal(calls.length,protectedCount);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);assert.deepEqual(errors,[]);assert.ok(calls.every(x=>x.authorization==='Bearer synthetic-owner'));fs.writeFileSync(path.join(out,`${width}-results.json`),JSON.stringify({engine,width,result:'passed',errors,calls,prompts,blocked},null,2));console.log(`PASS ${engine} ${width}px explicit owner AI, no customer credits, stale protection, list cancellation, product photo-only retry, customer manual save/print`);
   }catch(error){await shot('FAILURE').catch(()=>{});fs.writeFileSync(path.join(out,`${width}-failure.json`),JSON.stringify({error:error.stack,errors,calls,prompts,blocked},null,2));throw error}finally{await context.close()}
  }
 }finally{await browser?.close();await new Promise(r=>server.close(r))}
})().catch(error=>{console.error(error);process.exitCode=1});
