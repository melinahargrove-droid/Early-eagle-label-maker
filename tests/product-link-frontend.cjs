// Synthetic Product Link UI contracts. No live AI, retailer, or account traffic.
const {JSDOM,ResourceLoader,VirtualConsole}=require('jsdom');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const tick=(ms=8)=>new Promise(resolve=>setTimeout(resolve,ms));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};};
const response=(data,status=200)=>({ok:status<400,status,json:async()=>data});
const photo='data:image/jpeg;base64,U1lOVEhFVElD';
const result=(overrides={})=>({success:true,items:[{english:'Blocks',spanish:'Bloques',translation:'Bloques',target_language:'es',photo_data:photo,image_source:'product',needs_product_image:false,...overrides}]});
class Local extends ResourceLoader{fetch(url){const u=new URL(url);return u.hostname==='labels.test'&&u.pathname.endsWith('.js')?Promise.resolve(fs.readFileSync(path.join(root,u.pathname))):null;}}
async function fixture(){
  const errors=[],alerts=[],vc=new VirtualConsole();vc.on('jsdomError',error=>errors.push(error.message));
  const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{
    url:'https://labels.test/',runScripts:'dangerously',pretendToBeVisual:true,resources:new Local(),virtualConsole:vc,
    beforeParse(w){
      w.fetch=async()=>{throw Error('Synthetic offline');};w.scrollTo=()=>{};w.alert=message=>alerts.push(String(message));w.confirm=()=>true;w.TextEncoder=TextEncoder;
      w.localStorage.setItem('littleLabelsWelcomeSeenV1','1');
      w.Image=class{constructor(){this.naturalWidth=this.naturalHeight=10;}set src(value){queueMicrotask(()=>this.onload?.());}};
      w.FileReader=class{readAsDataURL(){this.result=photo;queueMicrotask(()=>this.onload?.());}};
      w.HTMLCanvasElement.prototype.getContext=()=>({fillRect(){},drawImage(){}});w.HTMLCanvasElement.prototype.toDataURL=()=>photo;
    }
  });
  const w=dom.window;await new Promise(resolve=>w.addEventListener('load',resolve));await tick();
  const $=id=>w.document.getElementById(id),input=(element,value)=>{if(typeof element==='string')element=$(element);element.value=value;element.dispatchEvent(new w.Event('input',{bubbles:true}));};
  const settings=w.LittleLabelSettings.get;let language='es';w.LittleLabelSettings.get=()=>({...settings(),language});
  const setLanguage=id=>{language=id;w.dispatchEvent(new w.Event('little-label-settings-changed'));};
  w.fetch=async()=>response({active:true,is_admin:true});
  const setAccount=(id,suffix='')=>w.eval(`saveCloudSession({access_token:${JSON.stringify('synthetic-'+id+suffix)},refresh_token:'synthetic-r',user:{id:${JSON.stringify(id)},is_anonymous:false,email:'synthetic@example.invalid'}});cloudReady=false;updateAccountUI();`);
  setAccount('A');await w.LittleLabelsOwnerAI.check(true);
  const requests=[];let handler=()=>Promise.resolve(response(result()));
  w.littleLabelsAIFetch=(url,options)=>{const request={url,payload:JSON.parse(options.body)};requests.push(request);return handler(request);};
  const fields=()=>({english:$('batchEnglish-0'),second:$('batchSecond-0'),status:$('batchReviewItems').querySelector('.batch-status'),img:$('batchReviewItems').querySelector('img'),retry:[...$('batchReviewItems').querySelectorAll('button')].find(button=>/Try Product Photo/.test(button.textContent))});
  const create=async({url='https://retailer.example/item',data=result()}={})=>{handler=()=>Promise.resolve(response(data));w.openDedicatedBatch('link');input('productLinkInput',url);await w.createProductLinkDraft();return fields();};
  const draft=()=>w.eval('batchDrafts[0]'),visible=id=>!$(id).classList.contains('hidden');
  return {w,$,input,requests,fields,create,draft,visible,setLanguage,setAccount,alerts,errors,setHandler:fn=>handler=fn};
}
let count=0;
async function run(name,test){if(process.env.PRODUCT_LINK_FILTER&&!new RegExp(process.env.PRODUCT_LINK_FILTER).test(name))return;const f=await fixture();try{await test(f);await tick();assert.deepEqual(f.errors,[]);console.log('PASS '+name);count++;}finally{f.w.close();}}
(async()=>{
  await run('public HTTPS input validation and broad retailer support',async f=>{
    for(const url of ['http://retailer.example/item','not a url','javascript:alert(1)','https://name:password@retailer.example/item']){f.input('productLinkInput',url);await f.w.createProductLinkDraft();}
    assert.equal(f.requests.length,0);assert.match(f.$('batchProgress').textContent,/public HTTPS/);
    await f.create({url:'https://shop.other-retailer.example/product?id=123'});assert.equal(f.requests[0].payload.url,'https://shop.other-retailer.example/product?id=123');
    assert.match(f.$('batchLinkPane').textContent,/retry or upload your own product photo/);
  });
  await run('French create, review headings, and English-edit retranslation',async f=>{
    f.setLanguage('fr');const fields=await f.create({data:result({translation:'Cubes',spanish:'Cubes',target_language:'fr'})});
    assert.equal(f.requests[0].payload.target_language,'fr');assert.equal(fields.second.value,'Cubes');
    assert.equal(f.$('batchReviewItems').querySelectorAll('label')[1].textContent,'French');assert.equal(fields.second.hidden,false);
    f.input(fields.english,'Counting blocks');f.setHandler(()=>Promise.resolve(response({success:true,translation:'Cubes à compter',language:'fr'})));
    await f.w.translateBatchItem(0,fields.english,fields.second,fields.status);
    assert.deepEqual(f.requests.at(-1).payload,{english:'Counting blocks',target_language:'fr'});assert.equal(fields.second.value,'Cubes à compter');assert.match(fields.status.textContent,/French updated/);
  });
  await run('selected-language legacy response is accepted but Spanish cannot masquerade as French',async f=>{
    f.setLanguage('fr');let fields=await f.create({data:result({translation:undefined,spanish:'Cubes',target_language:'fr'})});assert.equal(fields.second.value,'Cubes');
    fields=await f.create({data:result({translation:undefined,spanish:'Bloques',target_language:'es'})});assert.equal(fields.second.value,'');
    f.input(fields.english,'Blocks');f.setHandler(()=>Promise.resolve(response({success:true,spanish:'Bloques'})));await f.w.translateBatchItem(0,fields.english,fields.second,fields.status);assert.equal(fields.second.value,'');assert.match(fields.status.textContent,/request could not finish/);
  });
  await run('English Only remains empty through create, edits, retry, and save',async f=>{
    f.setLanguage('none');const fields=await f.create({data:result({photo_data:'',image_source:'missing',needs_product_image:true})});
    assert.equal(f.requests[0].payload.target_language,'none');assert.equal(f.draft().spanish,'');assert.equal(fields.second.value,'');assert.equal(fields.second.hidden,true);
    f.input(fields.english,'Teacher wording');await f.w.translateBatchItem(0,fields.english,fields.second,fields.status);assert.equal(f.requests.length,1);
    f.setHandler(()=>Promise.resolve(response(result({english:'Server replacement',spanish:'Bloques',translation:'Bloques'}))));await f.w.retryProductPhoto(0,fields.retry,fields.img,fields.status);
    assert.equal(f.requests.at(-1).payload.target_language,'none');assert.equal(f.requests.at(-1).payload.mode,'url_photo');assert.equal(f.draft().english,'Teacher wording');assert.equal(f.draft().spanish,'');
    f.w.prepareCloudPhoto=async value=>value;await f.w.saveAllBatch();assert.equal(f.w.eval('library.length'),1);assert.equal(f.w.eval('library[0].spanish'),'');assert.equal(f.w.eval('queue.length'),2);assert.equal(f.alerts.length,0);
  });
  for(const interruption of ['home','back and reopen','account','same-owner replacement','language and back','new flow'])await run('pending create ignores '+interruption,async f=>{
    const wait=deferred();f.setHandler(()=>wait.promise);f.w.openDedicatedBatch('link');f.input('productLinkInput','https://retailer.example/old');const pending=f.w.createProductLinkDraft();await tick();
    if(interruption==='home')f.w.show('home');
    if(interruption==='back and reopen'){f.w.show('home');f.w.openDedicatedBatch('link');}
    if(interruption==='account')f.setAccount('B');
    if(interruption==='same-owner replacement'){f.setAccount('A');f.setAccount('A','-replacement');}
    if(interruption==='language and back'){f.setLanguage('fr');f.setLanguage('es');}
    if(interruption==='new flow'){f.w.eval('beginBatchDraft();');f.w.show('makeList');}
    wait.resolve(response(result({english:'Stale secret'})));await pending;
    assert.equal(f.w.eval('batchDrafts.length'),0);assert.equal(f.visible('batchReview'),false);assert.equal(f.$('createLinkDraftBtn').disabled,false);
  });
  await run('overlapping creates keep newest result and its pending control',async f=>{
    const old=deferred(),fresh=deferred();let count=0;f.setHandler(()=>++count===1?old.promise:fresh.promise);f.w.openDedicatedBatch('link');f.input('productLinkInput','https://retailer.example/old');const first=f.w.createProductLinkDraft();await tick();
    // A repeated invocation for the same pending URL is idempotent.
    await f.w.createProductLinkDraft();assert.equal(f.requests.length,1);
    f.input('productLinkInput','https://retailer.example/new');const second=f.w.createProductLinkDraft();await tick();old.resolve(response(result({english:'Old'})));await first;assert.equal(f.$('createLinkDraftBtn').disabled,true);assert.equal(f.w.eval('batchDrafts.length'),0);
    fresh.resolve(response(result({english:'New'})));await second;assert.equal(f.draft().english,'New');assert.equal(f.$('createLinkDraftBtn').disabled,false);
  });
  await run('editing URL cancels old create without error or stale review',async f=>{
    const wait=deferred();f.setHandler(()=>wait.promise);f.w.openDedicatedBatch('link');f.input('productLinkInput','https://retailer.example/old');const pending=f.w.createProductLinkDraft();await tick();f.input('productLinkInput','https://retailer.example/new');assert.equal(f.$('createLinkDraftBtn').disabled,false);wait.reject(Error('Old failure'));await pending;assert.equal(f.visible('batchReview'),false);assert.equal(f.$('batchProgress').classList.contains('hidden'),true);
  });
  await run('photo retry preserves edits made before and during request',async f=>{
    f.setLanguage('fr');const fields=await f.create({data:result({translation:'Cubes',target_language:'fr',photo_data:'',needs_product_image:true})});
    f.input(fields.english,'My classroom blocks');f.input(fields.second,'Mes cubes');const wait=deferred();f.setHandler(()=>wait.promise);const retry=f.w.retryProductPhoto(0,fields.retry,fields.img,fields.status);await tick();
    f.input(fields.english,'Final wording');f.input(fields.second,'Mes cubes finaux');wait.resolve(response(result({english:'Server title',translation:'Titre serveur',target_language:'fr'})));await retry;
    assert.equal(f.requests.at(-1).payload.target_language,'fr');assert.equal(f.draft().english,'Final wording');assert.equal(f.draft().spanish,'Mes cubes finaux');assert.equal(f.draft().photo,photo);assert.equal(f.draft().needs_product_image,false);
  });
  for(const interruption of ['navigation','account','language','new flow'])await run('pending photo retry ignores '+interruption,async f=>{
    const fields=await f.create({data:result({photo_data:'',needs_product_image:true})}),wait=deferred();f.setHandler(()=>wait.promise);const retry=f.w.retryProductPhoto(0,fields.retry,fields.img,fields.status),old=f.draft();await tick();
    if(interruption==='navigation'){f.w.show('home');f.w.show('batchReview');}
    if(interruption==='account')f.setAccount('B');
    if(interruption==='language')f.setLanguage('none');
    if(interruption==='new flow')await f.create({data:result({english:'Fresh',photo_data:'',needs_product_image:true})});
    wait.resolve(response(result({english:'Stale'})));await retry;assert.equal(old.photo,'');assert.equal(f.draft()?.photo||'','');assert.equal(f.alerts.length,0);
  });
  await run('latest overlapping photo request wins',async f=>{
    const fields=await f.create({data:result({photo_data:'',needs_product_image:true})}),old=deferred(),fresh=deferred();let count=0;f.setHandler(()=>++count===1?old.promise:fresh.promise);
    const first=f.w.retryProductPhoto(0,fields.retry,fields.img,fields.status);await tick();const second=f.w.retryProductPhoto(0,fields.retry,fields.img,fields.status);await tick();
    fresh.resolve(response(result({photo_data:photo+'NEW'})));await second;old.resolve(response(result({photo_data:photo+'OLD'})));await first;assert.equal(f.draft().photo,photo+'NEW');assert.equal(f.draft().image_source,'product');
  });
  await run('missing image stays reviewable and unsaveable until explicit manual upload',async f=>{
    const fields=await f.create({data:result({photo_data:'',image_source:'missing',needs_product_image:false})});assert.equal(f.draft().needs_product_image,true);assert.equal(fields.img.hasAttribute('src'),false);assert.match(fields.status.textContent,/photo wasn't available/);
    await f.w.saveAllBatch();assert.equal(f.w.eval('library.length'),0);assert.match(f.alerts[0],/still needs a product photo/);
    f.w.chooseProductPhotoUpload(0,fields.img,fields.status);const file=f.w.document.querySelector('body > input[type=file]');Object.defineProperty(file,'files',{value:[{type:'image/png'}]});file.dispatchEvent(new f.w.Event('change'));await tick();
    assert.equal(f.draft().photo,photo);assert.equal(f.draft().image_source,'uploaded');assert.equal(f.draft().needs_product_image,false);assert.equal(file.isConnected,false);assert.match(f.fields().status.textContent,/uploaded product photo/);assert.equal(f.requests.length,1,'Upload never silently generates a representative picture');
    f.w.prepareCloudPhoto=async value=>value;await f.w.saveAllBatch();assert.equal(f.w.eval('library.length'),1);assert.equal(f.w.eval('queue.length'),2);
  });
  await run('manual upload supersedes pending photo retry',async f=>{
    const fields=await f.create({data:result({photo_data:'',needs_product_image:true})}),wait=deferred();f.setHandler(()=>wait.promise);const retry=f.w.retryProductPhoto(0,fields.retry,fields.img,fields.status);await tick();
    f.w.chooseProductPhotoUpload(0,fields.img,fields.status);const file=f.w.document.querySelector('body > input[type=file]');Object.defineProperty(file,'files',{value:[{type:'image/png'}]});file.dispatchEvent(new f.w.Event('change'));await tick();wait.resolve(response(result({photo_data:photo+'OLD'})));await retry;assert.equal(f.draft().photo,photo);assert.equal(f.draft().image_source,'uploaded');
  });
  await run('upload finishing after navigation cannot publish an image',async f=>{
    const fields=await f.create({data:result({photo_data:'',needs_product_image:true})}),wait=deferred();f.w.dataUrlFromFile=()=>wait.promise;f.w.chooseProductPhotoUpload(0,fields.img,fields.status);const file=f.w.document.querySelector('body > input[type=file]');Object.defineProperty(file,'files',{value:[{type:'image/png'}]});file.dispatchEvent(new f.w.Event('change'));f.w.show('home');wait.resolve(photo);await tick();assert.equal(f.draft().photo,'');assert.equal(file.isConnected,false);assert.equal(f.alerts.length,0);
  });
  for(const interruption of ['navigation','account','language and back','manual second-language edit','new English edit','new flow'])await run('pending translation ignores '+interruption,async f=>{
    const fields=await f.create(),wait=deferred();f.setHandler(()=>wait.promise);f.input(fields.english,'Old english');const pending=f.w.translateBatchItem(0,fields.english,fields.second,fields.status),old=f.draft();await tick();
    if(interruption==='navigation'){f.w.show('home');f.w.show('batchReview');}
    if(interruption==='account')f.setAccount('B');
    if(interruption==='language and back'){f.setLanguage('none');f.setLanguage('es');}
    if(interruption==='manual second-language edit')f.input(fields.second,'Teacher translation');
    if(interruption==='new English edit')f.input(fields.english,'New english');
    if(interruption==='new flow')await f.create({data:result({english:'Fresh'})});
    wait.resolve(response({success:true,translation:'Stale translation',language:'es'}));await pending;assert.notEqual(old.spanish,'Stale translation');assert.notEqual(f.draft()?.spanish,'Stale translation');if(interruption==='manual second-language edit')assert.equal(old.spanish,'Teacher translation');
  });
  await run('translation overlap resolves newest and typing cancels delayed work',async f=>{
    const fields=await f.create(),old=deferred(),fresh=deferred();let count=0;f.setHandler(()=>++count===1?old.promise:fresh.promise);f.input(fields.english,'Old english');const first=f.w.translateBatchItem(0,fields.english,fields.second,fields.status);await tick();f.input(fields.english,'New english');const second=f.w.translateBatchItem(0,fields.english,fields.second,fields.status);await tick();fresh.resolve(response({success:true,translation:'New translation',language:'es'}));await second;old.resolve(response({success:true,translation:'Old translation',language:'es'}));await first;assert.equal(f.draft().spanish,'New translation');
    const before=f.requests.length;f.input(fields.english,'Pending debounce');f.input(fields.second,'Manual override');await tick(940);assert.equal(f.requests.length,before);assert.equal(f.draft().spanish,'Manual override');
  });
  await run('language settings keep manual wording and never translate until chosen',async f=>{
    await f.create();const count=f.requests.length;f.setHandler(()=>Promise.resolve(response({success:true,translation:'Cubes français',language:'fr'})));f.setLanguage('fr');assert.equal(f.fields().second.value,'Bloques');assert.equal(f.$('batchReviewItems').querySelectorAll('label')[1].textContent,'French');await tick(940);assert.equal(f.requests.length,count);const fields=f.fields();await f.w.translateBatchItem(0,fields.english,fields.second,fields.status);assert.equal(f.draft().spanish,'Cubes français');assert.equal(f.requests.at(-1).payload.target_language,'fr');f.setLanguage('none');assert.equal(f.draft().spanish,'');assert.equal(f.fields().second.hidden,true);
  });
  await run('missing image shows review notes without offering paused generation',async f=>{
    await f.create({data:result({photo_data:'',image_source:'missing',needs_product_image:true,needs_product_review:true,notes:'Check and edit the product wording. Upload a product photo.'})});
    assert.match(f.$('batchReviewItems').querySelector('.product-import-notes').textContent,/Check and edit/);
    assert.ok(![...f.$('batchReviewItems').querySelectorAll('button')].some(b=>/Representative/.test(b.textContent)));
  });
  await run('unexpected HTML image data is rejected for manual photo fallback',async f=>{
    await f.create({data:result({photo_data:'data:text/html;base64,PGgxPmh0bWw8L2gxPg=='})});
    assert.equal(f.draft().photo,'');assert.equal(f.draft().needs_product_image,true);
  });
  await run('browser image decode failure returns to manual photo fallback',async f=>{
    await f.create();f.fields().img.dispatchEvent(new f.w.Event('error'));
    assert.equal(f.draft().photo,'');assert.equal(f.draft().needs_product_image,true);assert.match(f.$('batchReviewItems').textContent,/could not be displayed/);
  });
  await run('manual English edits keep teacher wording and remain saveable without translation',async f=>{
    f.setLanguage('fr');const fields=await f.create({data:result({translation:'Cubes',target_language:'fr'})});
    f.input(fields.english,'Paint brushes');assert.equal(f.draft().spanish,'Cubes');await tick(940);assert.equal(f.requests.length,1);
    f.input(fields.second,'Pinceaux');f.w.prepareCloudPhoto=async value=>value;await f.w.saveAllBatch();assert.equal(f.w.eval('library[0].spanish'),'Pinceaux');
  });
  await run('failed explicit translation preserves the previous manually reviewable line',async f=>{
    const fields=await f.create();f.input(fields.english,'Paint brushes');f.setHandler(()=>Promise.resolve(response({error:'Synthetic failure'},500)));
    await f.w.translateBatchItem(0,fields.english,fields.second,fields.status);assert.equal(f.draft().spanish,'Bloques');
    f.input(fields.second,'Teacher translation');f.w.prepareCloudPhoto=async value=>value;await f.w.saveAllBatch();assert.equal(f.w.eval('library[0].spanish'),'Teacher translation');
  });
  await run('detached image decode error cannot clear a newer photo or draft',async f=>{
    await f.create();const old=f.fields().img;f.draft().photo=photo+'NEW';f.w.renderBatchReview();old.dispatchEvent(new f.w.Event('error'));assert.equal(f.draft().photo,photo+'NEW');
    const current=f.fields().img;f.w.show('home');current.dispatchEvent(new f.w.Event('error'));assert.equal(f.draft().photo,photo+'NEW');
  });
  await run('undecodable imported image is rejected before a save snapshot can exist',async f=>{
    f.w.Image=class{set src(value){queueMicrotask(()=>this.onerror?.());}};
    await f.create();assert.equal(f.draft().photo,'');assert.equal(f.draft().needs_product_image,true);
    await f.w.saveAllBatch();assert.equal(f.w.eval('library.length'),0);assert.match(f.alerts.at(-1),/still needs a product photo/);
  });
  await run('photo decode finishing after navigation cannot publish a stale draft',async f=>{
    let decode;f.w.Image=class{constructor(){this.naturalWidth=this.naturalHeight=1;decode=this;}set src(value){}};
    const pending=f.create();await tick();assert.ok(decode);f.w.show('home');decode.onload();await pending;
    assert.equal(f.visible('home'),true);assert.equal(f.w.eval('batchDrafts.length'),0);
  });
  console.log(`PASS ${count} synthetic Product Link frontend scenarios`);
})().catch(error=>{console.error(error);process.exitCode=1;});
