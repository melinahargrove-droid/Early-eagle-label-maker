// Production handlers with synthetic accounts, images and responses only.
const {JSDOM,ResourceLoader,VirtualConsole}=require('jsdom');
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),tick=()=>new Promise(r=>setTimeout(r,15));
const photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP88OEDAwMDEwMDAwMDAwAh6gLUcoFD3wAAAABJRU5ErkJggg==';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};
const reply=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'Content-Type':'application/json'}});
class Local extends ResourceLoader{fetch(url){const u=new URL(url);return u.hostname==='labels.test'&&u.pathname.endsWith('.js')?Promise.resolve(fs.readFileSync(path.join(root,u.pathname))):null}}
async function fixture(owner=true){
 const errors=[],calls=[],prompts=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));let hook=null,account='owner-A';
 const session=id=>({access_token:'synthetic-'+id,refresh_token:'synthetic-r-'+id,expires_in:3600,user:{id,is_anonymous:false,email:id+'@example.invalid',identities:[{}]}});
 const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'https://labels.test/',resources:new Local(),runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  w.Headers=Headers;w.Response=Response;w.AbortController=AbortController;w.TextEncoder=TextEncoder;w.scrollTo=()=>{};w.alert=()=>{};w.confirm=text=>{prompts.push(text);return true};w.localStorage.setItem('littleLabelsWelcomeSeenV1','1');w.localStorage.setItem('eea_label_maker_supabase_session_v1',JSON.stringify(session(account)));
  w.Image=class{constructor(){this.naturalWidth=this.naturalHeight=2}set src(v){queueMicrotask(()=>this.onload?.())}};
  w.HTMLCanvasElement.prototype.getContext=()=>({fillRect(){},drawImage(){}});w.HTMLCanvasElement.prototype.toDataURL=()=>photo;
  w.fetch=async(url,options={})=>{
   const p=new URL(url).pathname,record={path:p,options,body:options.body?JSON.parse(options.body):null};calls.push(record);
   if(hook){const value=await hook(record);if(value!==undefined)return value;}
   if(p.includes('/auth/'))return reply(session(account));
   if(p.endsWith('/little_labels_access_status'))return reply({active:true});
   if(p.endsWith('/little_labels_admin_status'))return reply({is_admin:owner&&account==='owner-A'});
   if(p.includes('/rpc/'))return reply({is_admin:false});
   if(p.endsWith('/identify-material'))return reply({success:true,identification:{english:'Blocks',translation:'Bloques',spanish:'Bloques',language:'es'}});
   if(p.endsWith('/translate-label'))return reply({success:true,translation:'Traducido',language:record.body.target_language});
   if(p.endsWith('/batch-wording'))return reply({success:true,items:record.body.items.map(english=>({english,translation:'Manual-ready '+english}))});
   if(p.endsWith('/label-picture'))return reply({success:true,photo_data:photo});
   if(p.endsWith('/batch-labels'))return reply({success:true,items:[{english:'Product blocks',translation:'Bloques',spanish:'Bloques',target_language:record.body.target_language,photo_data:photo,image_source:'product',needs_product_image:false}]});
   if(p.includes('/rest/'))return reply([]);
   throw Error('Unmocked request '+p);
  };
 }});
 const w=dom.window;await new Promise(r=>w.addEventListener('load',r));await tick();await w.LittleLabelsOwnerAI.check(true);w.eval('cloudReady=false;');
 const $=id=>w.document.getElementById(id),input=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new w.Event('input',{bubbles:true}))};
 return{w,$,input,calls,prompts,errors,ai:()=>calls.filter(x=>x.path.includes('/functions/')),setHook:fn=>hook=fn,setOwner:value=>owner=value,async switchAccount(id){account=id;w.eval(`saveCloudSession(${JSON.stringify(session(id))});cloudReady=false;updateAccountUI();`);await tick()},close:()=>w.close()};
}
let total=0;async function test(name,fn,owner=true){const f=await fixture(owner);try{await fn(f);await tick();assert.deepEqual(f.errors,[]);console.log('PASS '+name);total++}finally{f.close()}}
(async()=>{
 await test('owner photo choice remains manual; explicit identification runs once without customer credits',async f=>{
  f.w.compressImage=async()=>photo;await f.w.handlePhoto({});assert.equal(f.ai().length,0);assert.equal(f.$('englishInput').value,'');assert.equal(f.$('identifyPhotoBtn').disabled,false);
  f.$('identifyPhotoBtn').click();f.$('identifyPhotoBtn').click();await tick();await tick();assert.equal(f.ai().length,1);assert.equal(f.$('englishInput').value,'Blocks');assert.equal(f.$('spanishInput').value,'Bloques');assert.match(f.prompts[0],/photo.*AI processing/);assert.doesNotMatch(f.prompts[0],/Uses 1 Credit|buy credits/i);
 });
 await test('owner translation uses real guarded route with no quote, wallet or synthetic credit transport',async f=>{
  f.$('homeTypeBtn').click();f.input('tlEnglish','Counting blocks');assert.equal(f.w.LittleLabelsCreditTestTransport,undefined);const button=f.$('tlTranslationTools').querySelector('.ll-ai-translate');assert.equal(button.hidden,false);button.click();button.click();await tick();await tick();assert.equal(f.ai().length,1);assert.equal(f.ai()[0].path.endsWith('translate-label'),true);assert.equal(f.$('tlSecond').value,'Traducido');assert.match(f.prompts[0],/owner access/);assert.doesNotMatch(f.prompts[0],/Cost: 1|purchase credits/i);
 });
 await test('declining owner processing sends no text or photo payload',async f=>{
  f.w.confirm=()=>false;f.w.compressImage=async()=>photo;await f.w.handlePhoto({});await f.w.identify();assert.equal(f.ai().length,0);f.w.show('home');f.$('homeTypeBtn').click();f.input('tlEnglish','Private words');f.$('tlTranslationTools').querySelector('.ll-ai-translate').click();await tick();assert.equal(f.ai().length,0);
 });
 await test('owner photo and translation results cannot overwrite newer manual edits',async f=>{
  const hold=deferred();f.setHook(r=>r.path.endsWith('identify-material')?hold.promise:undefined);f.w.compressImage=async()=>photo;await f.w.handlePhoto({});const pending=f.w.identify();await tick();f.input('englishInput','Teacher kept this');hold.resolve(reply({success:true,identification:{english:'Stale',translation:'Old'}}));await pending;assert.equal(f.$('englishInput').value,'Teacher kept this');
  const tr=deferred();f.setHook(r=>r.path.endsWith('translate-label')?tr.promise:undefined);f.w.show('home');f.$('homeTypeBtn').click();f.input('tlEnglish','Blocks');f.$('tlTranslationTools').querySelector('.ll-ai-translate').click();await tick();f.input('tlSecond','My manual translation');tr.resolve(reply({success:true,translation:'Stale',language:'es'}));await tick();assert.equal(f.$('tlSecond').value,'My manual translation');
 });
 await test('nonowner manual flow remains usable and direct optional calls fail closed',async f=>{
  f.w.compressImage=async()=>photo;await f.w.handlePhoto({});assert.equal(f.$('identifyPhotoBtn').disabled,true);await f.w.identify();assert.equal(f.ai().length,0);f.w.LittleLabelsFeatureInfo.close();f.input('englishInput','Manual blocks');f.input('spanishInput','Teacher text');f.$('chooseSetBtn').click();f.$('addToQueue').click();await tick();assert.equal(f.w.eval('queue.length'),2);
  await assert.rejects(f.w.littleLabelsAIFetch(f.w.eval('TRANSLATE_URL'),{method:'POST',body:'{"english":"Forged"}'}),/not available/);assert.equal(f.ai().length,0);
 },false);
 await test('owner capability cannot be spoofed and old verification cannot cross accounts',async f=>{
  f.setOwner(false);f.w.eval("currentUser.email='owner@example.invalid';currentUser.user_metadata={is_admin:true,paidAI:true}");await assert.rejects(f.w.littleLabelsAIFetch(f.w.eval('TRANSLATE_URL'),{method:'POST',body:'{}'}),/not available/);assert.equal(f.ai().length,0);
  const hold=deferred();f.setHook(r=>r.path.endsWith('little_labels_admin_status')?hold.promise:undefined);const pending=f.w.LittleLabelsOwnerAI.check(true);await tick();await f.switchAccount('customer-B');hold.resolve(reply({is_admin:true}));await pending;assert.equal(f.w.LittleLabelsOwnerAI.isOwner(),false);assert.equal(f.ai().length,0);
 });
 await test('list translation is explicit and picture sequence stops after Back',async f=>{
  f.w.show('makeList');f.input('makeListInput','Blocks\nPencils');f.$('makeListCreateBtn').click();assert.equal(f.ai().length,0);f.$('mliTranslate').click();await tick();await tick();assert.equal(f.ai().length,1);assert.match(f.w.document.querySelector('.mli-tr').value,/Manual-ready/);
  const hold=deferred();f.setHook(r=>r.path.endsWith('label-picture')?hold.promise:undefined);f.$('mliAllPics').click();await tick();assert.equal(f.ai().filter(x=>x.path.endsWith('label-picture')).length,1);f.$('mliBack').click();hold.resolve(reply({success:true,photo_data:photo}));await tick();await tick();assert.equal(f.ai().filter(x=>x.path.endsWith('label-picture')).length,1);f.$('makeListCreateBtn').click();assert.equal(f.w.document.querySelectorAll('.mli-preview img').length,0);
 });
 await test('nonowner list has a single unlock entry and zero provider dispatch',async f=>{
  f.w.show('makeList');f.input('makeListInput','Blocks\nPencils');f.$('makeListCreateBtn').click();assert.equal(f.$('mliUnlock').hidden,false);assert.equal(f.$('mliTranslate').style.display,'none');assert.equal(f.$('mliAllPics').style.display,'none');f.$('mliTranslate').click();await tick();assert.equal(f.ai().length,0);
 },false);
 await test('cleanup switched off cannot apply a late local result',async f=>{
  f.w.compressImage=async()=>photo;await f.w.handlePhoto({});f.$('previewBack').click();const hold=deferred();f.w.getBackgroundRemover=async()=>async()=>hold.promise;f.w.blobToDataUrl=async()=>photo+'REMOVED';f.w.refineRemovedBackground=async()=>photo+'CLEANED';
  const toggle=f.$('llCleanupToggle');toggle.checked=true;toggle.dispatchEvent(new f.w.Event('change'));await tick();toggle.checked=false;toggle.dispatchEvent(new f.w.Event('change'));hold.resolve({});await tick();assert.equal(f.w.eval('activePhotoDataUrl'),photo);assert.equal(f.w.eval('cleanedPhotoDataUrl'),'');assert.equal(f.ai().length,0);
 });
 console.log(`PASS ${total} owner AI frontend scenarios; no real provider or credit usage`);
})().catch(error=>{console.error(error);process.exitCode=1});
