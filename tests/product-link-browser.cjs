// Real Chromium interactions with synthetic responses only; never calls retailer or AI services.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP88OEDAwMDEwMDAwMDAwAh6gLUcoFD3wAAAABJRU5ErkJggg==','base64');
const photo='data:image/png;base64,'+png.toString('base64');
const product=(language,extra={})=>({success:true,items:[{english:'Synthetic Blocks',translation:language==='none'?'':'Cubes',spanish:language==='none'?'':'Cubes',target_language:language,photo_data:'',image_source:'missing',needs_product_image:true,...extra}]});
(async()=>{
  const server=http.createServer((req,res)=>{try{const file=path.join(root,new URL(req.url,'http://localhost').pathname);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(file.endsWith('/')?file+'index.html':file));}catch{res.statusCode=404;res.end();}}).listen(0,'127.0.0.1');
  await new Promise(resolve=>server.on('listening',resolve));
  let browser;
  try{
    browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
    const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],requests=[],held=[];
    let holdNextProduct=false;
    page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.dismiss());
    await page.addInitScript(()=>localStorage.setItem('littleLabelsWelcomeSeenV1','1'));
    await page.route('**/*',async route=>{
      const request=route.request(),url=request.url();
      if(url.startsWith('http://127.0.0.1:'))return route.continue();
      const fulfill=body=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
      if(url.includes('/functions/v1/batch-labels')){
        const payload=request.postDataJSON();requests.push(payload);
        if(holdNextProduct){holdNextProduct=false;held.push({payload,fulfill});return;}
        return fulfill(product(payload.target_language));
      }
      if(url.includes('/functions/v1/translate-label')){const payload=request.postDataJSON();requests.push(payload);return fulfill({success:true,translation:'Cubes à compter',language:payload.target_language});}
      if(url.includes('.supabase.co/'))return fulfill(url.includes('/auth/')?{access_token:'synthetic-token',refresh_token:'synthetic-refresh',user:{id:'synthetic-owner',is_anonymous:false,email:'synthetic@example.invalid',identities:[{}]}}:url.includes('/rpc/')?{active:true}:[]);
      return route.abort();
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>window.LittleLabelSettings&&cloudReady);await page.evaluate(()=>LittleLabelsAccess.check());
    await page.locator('#littleLabelsSettingsBtn').click();await page.locator('#llsLanguage').selectOption('fr');await page.locator('#llsBack').click();
    await page.locator('#homeProductBtn').click();await page.locator('#productLinkInput').fill('https://retailer.example/item');await page.locator('#createLinkDraftBtn').click();await page.locator('#batchReview').waitFor({state:'visible'});
    assert.equal(requests[0].target_language,'fr');assert.equal(await page.locator('label[for="batchSecond-0"]').textContent(),'French');assert.equal(await page.locator('#batchSecond-0').inputValue(),'Cubes');
    await page.locator('#batchEnglish-0').fill('Counting blocks');await page.waitForFunction(()=>document.getElementById('batchSecond-0').value==='Cubes à compter');assert.equal(requests.at(-1).target_language,'fr');
    const screenshots=process.env.PRODUCT_LINK_SCREENSHOTS;
    if(screenshots){fs.mkdirSync(screenshots,{recursive:true});await page.screenshot({path:path.join(screenshots,'french-missing-photo.png'),fullPage:true});}
    assert.equal(await page.locator('#batchReviewItems img').getAttribute('src'),null);
    const choosing=page.waitForEvent('filechooser');await page.getByRole('button',{name:'📷 Upload Product Photo'}).click();await (await choosing).setFiles({name:'synthetic.png',mimeType:'image/png',buffer:png});await page.waitForFunction(()=>batchDrafts[0]?.image_source==='uploaded');
    assert.equal(await page.locator('#batchSecond-0').inputValue(),'Cubes à compter');assert.match(await page.locator('.batch-status').textContent(),/uploaded product photo/);
    if(screenshots)await page.screenshot({path:path.join(screenshots,'french-uploaded-photo.png'),fullPage:true});
    console.log('PASS Chromium mobile French creation, edit retranslation, missing photo, and real file upload');
    // Retry response arrives while wording is manually edited.
    await page.locator('#batchReviewBack').click();await page.locator('#createLinkDraftBtn').click();await page.locator('#batchReview').waitFor({state:'visible'});
    holdNextProduct=true;await page.getByRole('button',{name:'↻ Try Product Photo Again'}).click();await page.waitForFunction(()=>document.querySelector('#batchReviewItems button').textContent==='Trying…');
    await page.locator('#batchEnglish-0').fill('My blocks');await page.locator('#batchSecond-0').fill('Mes cubes');
    while(!held.length)await new Promise(resolve=>setTimeout(resolve,5));await held.shift().fulfill(product('fr',{english:'Unwanted title',translation:'Unwanted translation',spanish:'Unwanted translation',photo_data:photo,image_source:'product',needs_product_image:false}));
    await page.waitForFunction(()=>batchDrafts[0].image_source==='product');assert.equal(await page.locator('#batchEnglish-0').inputValue(),'My blocks');assert.equal(await page.locator('#batchSecond-0').inputValue(),'Mes cubes');
    console.log('PASS Chromium retry preserves edits typed during the pending request');
    // Cancel a pending create using the actual Home control, then resolve the stale response.
    await page.locator('#batchReviewBack').click();holdNextProduct=true;await page.locator('#createLinkDraftBtn').click();await page.locator('#batchBack').click();
    while(!held.length)await new Promise(resolve=>setTimeout(resolve,5));await held.shift().fulfill(product('fr',{english:'Stale result'}));await page.waitForTimeout(80);assert.equal(await page.locator('#home').isVisible(),true);assert.notEqual(await page.evaluate(()=>batchDrafts[0]?.english),'Stale result');
    console.log('PASS Chromium Home navigation cancels stale create result');
    // English Only has no translated input and makes no translation call after an edit.
    await page.locator('#littleLabelsSettingsBtn').click();await page.locator('#llsLanguage').selectOption('none');await page.locator('#llsBack').click();await page.locator('#homeProductBtn').click();await page.locator('#createLinkDraftBtn').click();await page.locator('#batchReview').waitFor({state:'visible'});
    assert.equal(requests.at(-1).target_language,'none');assert.equal(await page.locator('#batchSecond-0').isVisible(),false);assert.equal(await page.evaluate(()=>batchDrafts[0].spanish),'');
    const before=requests.length;await page.locator('#batchEnglish-0').fill('English only blocks');await page.waitForTimeout(950);assert.equal(requests.length,before);
    if(screenshots)await page.screenshot({path:path.join(screenshots,'english-only-missing-photo.png'),fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No horizontal overflow at 390 px');assert.deepEqual(errors,[]);
    console.log('PASS Chromium English Only omits translation and has no mobile overflow');
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
