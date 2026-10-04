// Real Chromium controls with synthetic responses only. No production email or password writes.
const {chromium,expect}=require('@playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..'),out=process.env.CUSTOMER_ACCESS_SCREENSHOTS;
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP88OEDAwMDEwMDAwMDAwAh6gLUcoFD3wAAAABJRU5ErkJggg==','base64');
const user=id=>({id,email:id+'@example.invalid',is_anonymous:false,identities:[{provider:'email'}]});
const session=id=>({access_token:'synthetic-'+id,refresh_token:'synthetic-refresh-'+id,user:user(id),expires_in:3600});
(async()=>{
 const server=http.createServer((req,res)=>{try{let file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(file===root)file=path.join(root,'index.html');if(!file.startsWith(root+path.sep))return res.writeHead(403).end();res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.png')?'image/png':'text/html');res.end(fs.readFileSync(file))}catch{res.writeHead(404).end()}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  async function fixture({purchased=false,fragment=''}={}){
   const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),model={calls:[],errors:[],held:[],holdPhoto:false,holdReset:false,photoStatus:429,recoverStatus:200};
   page.setDefaultTimeout(7000);page.on('pageerror',e=>model.errors.push(e.message));
   await context.addInitScript(s=>{localStorage.setItem('littleLabelsWelcomeSeenV1','1');localStorage.setItem('eea_label_maker_supabase_session_v1',JSON.stringify(s))},session('A'));
   await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());if(url.origin===origin)return route.continue();if(!url.hostname.endsWith('.supabase.co'))return route.abort();
    const record={path:url.pathname,method:req.method(),body:req.postDataJSON()};model.calls.push(record);
    const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    if(url.pathname.endsWith('/recover')){if(model.holdReset){model.held.push(()=>json({}));return;}return json(model.recoverStatus===200?{}:{msg:'PRIVATE SERVER DETAIL'},model.recoverStatus)}
    if(url.pathname.includes('/identify-material')){if(model.holdPhoto){model.held.push(()=>json({success:true,identification:{english:'STALE',spanish:'STALE'}}));return;}return json({error:'PRIVATE SERVER DETAIL'},model.photoStatus)}
    if(url.pathname.endsWith('/auth/v1/user'))return json(user('A'));
    if(url.pathname.includes('/auth/'))return json(session('A'));
    if(url.pathname.endsWith('little_labels_access_status'))return json({active:purchased});
    if(url.pathname.endsWith('activate_little_labels')){purchased=true;return json({success:true})}
    if(url.pathname.includes('/rpc/'))return json({is_admin:false});
    if(url.pathname.includes('/rest/'))return json([]);
    throw Error('Unexpected synthetic endpoint '+url.pathname);
   });
   await page.goto(origin+'/?appv=116'+fragment);await page.waitForFunction(()=>!!window.LittleLabelsAccess);
   if(!fragment)await page.waitForFunction(()=>cloudReady&&cloudLoaded);
   return {page,model,close:async()=>{assert.deepEqual(model.errors,[]);await context.close()}};
  }
  async function shot(page,name){if(out){fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,name+'.png'),fullPage:true})}}
  {
   const {page,model,close}=await fixture();await expect(page.locator('#llaCode')).toBeFocused();
   const dialog=page.getByRole('dialog',{name:'Activate Little Labels'});await expect(dialog).toBeVisible();
   for(let i=0;i<12;i++){await page.keyboard.press(i%2?'Tab':'Shift+Tab');assert.equal(await page.evaluate(()=>!!document.activeElement.closest('#llAccessGate')),true)}
   await page.keyboard.press('Escape');await expect(dialog).toBeVisible();assert.equal(await page.locator('.app').evaluate(el=>el.inert),true);
   await shot(page,'activation-keyboard');await page.locator('#llaManageAccount').click();await expect(page.locator('#accountBack')).toBeFocused();assert.equal(await page.locator('.app').evaluate(el=>el.inert),false);
   await page.locator('#accountBack').click();await expect(page.locator('#llaCode')).toBeFocused();await page.locator('#llaCode').fill('SYNTHETIC-CODE');await page.locator('#llaCode').press('Enter');await expect(dialog).toBeHidden();await expect(page.locator('#accountBack')).not.toBeFocused();assert.equal(await page.locator('.app').evaluate(el=>el.inert),false);await close();
   console.log('PASS keyboard activation dialog, Tab wrapping, Escape containment, account focus, and successful unlock');
  }
  {
   const {page,model,close}=await fixture();await page.locator('#llaManageAccount').click();await page.locator('#forgotPasswordBtn').click();await expect(page.getByLabel('Account email',{exact:true})).toBeFocused();
   await page.getByLabel('Account email',{exact:true}).fill('synthetic@example.invalid');model.holdReset=true;await page.locator('#requestPasswordBtn').click();await expect(page.locator('#requestPasswordBtn')).toBeDisabled();await page.getByLabel('Account email',{exact:true}).press('Enter');assert.equal(model.calls.filter(c=>c.path.endsWith('/recover')).length,1);
   await expect.poll(()=>model.held.length).toBe(1);await model.held.shift()();await expect(page.locator('#passwordRequestStatus')).toContainText('If an account exists');await shot(page,'password-reset-request');assert.equal(model.calls.filter(c=>c.method==='PUT').length,0);await close();
   console.log('PASS password-reset request through real controls; generic message and duplicate prevention');
  }
  {
   const {page,model,close}=await fixture();await page.locator('#llaManageAccount').click();await page.locator('#forgotPasswordBtn').click();await page.getByLabel('Account email',{exact:true}).fill('synthetic@example.invalid');model.recoverStatus=429;await page.locator('#requestPasswordBtn').click();await expect(page.locator('#passwordRequestStatus')).toContainText('Too many requests');await expect(page.locator('#requestPasswordBtn')).toBeEnabled();await shot(page,'password-rate-limit');await close();console.log('PASS visible password email rate-limit and safe retry guidance');
  }
  {
   const {page,model,close}=await fixture({fragment:'#error=access_denied&error_code=otp_expired'});await expect(page.locator('#recoveryStatus')).toContainText('expired or unavailable');await expect(page.locator('#saveRecoveryPasswordBtn')).toBeDisabled();await expect(page.locator('#newRecoveryLinkBtn')).toBeFocused();await shot(page,'expired-password-link');await page.locator('#newRecoveryLinkBtn').click();await expect(page.getByLabel('Account email',{exact:true})).toBeFocused();assert.equal(model.calls.filter(c=>c.method==='PUT').length,0);await close();console.log('PASS expired recovery link offers a keyboard-accessible new-link path');
  }
  {
   const {page,model,close}=await fixture({purchased:true});await expect(page.locator('#llAccessGate')).toBeHidden();
   const choose=page.waitForEvent('filechooser');await page.locator('#homeGalleryBtn').click();await (await choose).setFiles({name:'synthetic.png',mimeType:'image/png',buffer:png});
   await expect(page.locator('#capture')).toBeVisible();await expect(page.locator('#identifyStatus')).toContainText('limit');await expect(page.locator('#retryIdentify')).toBeVisible();await shot(page,'photo-rate-limit');
   model.photoStatus=500;await page.locator('#retryIdentify').click();await expect(page.locator('#identifyStatus')).toContainText("Couldn't identify");await shot(page,'photo-service-error');
   model.holdPhoto=true;await page.locator('#retryIdentify').click();await expect.poll(()=>model.held.length).toBe(1);await page.locator('#captureBack').click();await expect(page.locator('#home')).toBeVisible();await model.held.shift()().catch(()=>{});await page.waitForTimeout(100);await expect(page.locator('#home')).toBeVisible();assert.notEqual(await page.evaluate(()=>identification?.english),'STALE');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await close();console.log('PASS actual Home upload shows 429/service failures, retains retry, cancels stale response after Back, and fits mobile');
  }
 }finally{await browser?.close();await new Promise(r=>server.close(r))}
})().catch(error=>{console.error(error);process.exitCode=1});
