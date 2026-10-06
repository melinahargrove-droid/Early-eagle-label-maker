// Production DOM handlers, synthetic identities/credentials only. All network is intercepted.
const {JSDOM,ResourceLoader,VirtualConsole}=require('jsdom');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),tick=()=>new Promise(r=>setTimeout(r,15));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
const user=id=>({id,email:id+'@example.invalid',is_anonymous:false,identities:[{provider:'email'}]});
const session=id=>({access_token:'synthetic-'+id,refresh_token:'synthetic-refresh-'+id,expires_in:3600,user:user(id)});
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
class Local extends ResourceLoader{fetch(url){const u=new URL(url);return u.origin==='https://labels.test'&&u.pathname.endsWith('.js')?Promise.resolve(fs.readFileSync(path.join(root,u.pathname))):null}}
async function fixture({fragment='',purchased=true,authUser,captureTimeouts=false}={}){
 const timeouts=new Map();let timerId=100000;
 const errors=[],calls=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));let hook=null;
 const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'https://labels.test/?appv=116'+fragment,runScripts:'dangerously',resources:new Local(),pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  if(captureTimeouts){const set=w.setTimeout.bind(w),clear=w.clearTimeout.bind(w);w.setTimeout=(fn,ms,...args)=>{if(ms===15000||ms===30000){const id=++timerId;timeouts.set(id,()=>fn(...args));return id}return set(fn,ms,...args)};w.clearTimeout=id=>{if(timeouts.has(id))timeouts.delete(id);else clear(id)}}
  w.localStorage.setItem('littleLabelsWelcomeSeenV1','1');w.localStorage.setItem('eea_label_maker_supabase_session_v1',JSON.stringify(session('A')));
  w.fetch=async(url,o={})=>{const record={url:String(url),...o};calls.push(record);if(hook){const result=await hook(record);if(result!==undefined)return result}
   if(String(url).includes('/auth/v1/user'))return authUser?authUser(record):response(user('A'));
   if(String(url).includes('/auth/'))return response(session('A'));
   if(String(url).includes('/rpc/'))return response({active:purchased,is_admin:false});
   if(String(url).includes('/rest/'))return response([]);
   throw Error('Unexpected synthetic endpoint '+url);
  };
  w.scrollTo=()=>{};w.confirm=()=>true;w.alert=()=>{};w.TextEncoder=TextEncoder;w.Headers=Headers;w.Response=Response;w.AbortController=AbortController;
  w.Image=class{constructor(){this.naturalWidth=this.naturalHeight=2;}set src(v){queueMicrotask(()=>this.onload?.())}};
  w.HTMLCanvasElement.prototype.getContext=()=>({fillRect(){},drawImage(){}});w.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/jpeg;base64,U1lOVEhFVElD';
 }});
 const w=dom.window;await new Promise(r=>w.addEventListener('load',r));await tick();
 const $=id=>w.document.getElementById(id),click=id=>$(id).click();
 return {w,$,click,calls,errors,fireTimeouts:()=>{const pending=[...timeouts.values()];timeouts.clear();pending.forEach(fn=>fn())},setHook:f=>hook=f,close:()=>w.close(),input:(id,v)=>{$(id).value=v;$(id).dispatchEvent(new w.Event('input',{bubbles:true}))},switchAccount:id=>w.eval(`saveCloudSession(${JSON.stringify(session(id))});cloudReady=true;updateAccountUI();`)};
}
let count=0;
async function run(name,fn,options){const f=await fixture(options);try{await fn(f);await tick();assert.deepEqual(f.errors,[]);console.log('PASS '+name);count++}finally{f.close()}}
const recovery='#type=recovery&access_token=synthetic-A&refresh_token=synthetic-refresh-A';
(async()=>{
 await run('password request validates email, sends generic response, and blocks duplicate clicks',async f=>{
  f.w.show('account');f.click('forgotPasswordBtn');f.input('passwordRequestEmail','invalid');f.click('requestPasswordBtn');assert.match(f.$('passwordRequestStatus').textContent,/valid email/);
  const delay=deferred();f.setHook(r=>r.url.includes('/recover')?delay.promise:undefined);f.input('passwordRequestEmail','synthetic@example.invalid');f.click('requestPasswordBtn');f.click('requestPasswordBtn');await tick();
  const sent=f.calls.filter(r=>r.url.includes('/recover'));assert.equal(sent.length,1);assert.equal(f.$('requestPasswordBtn').disabled,true);assert.equal(JSON.parse(sent[0].body).email,'synthetic@example.invalid');assert.equal(new URL(sent[0].url).searchParams.get('redirect_to'),'https://labels.test/');
  delay.resolve(response({}));await tick();assert.match(f.$('passwordRequestStatus').textContent,/If an account exists/);assert.equal(f.$('requestPasswordBtn').disabled,false);f.click('requestPasswordBtn');assert.equal(f.calls.filter(r=>r.url.includes('/recover')).length,1);assert.match(f.$('passwordRequestStatus').textContent,/wait a minute/);
 });
 for(const status of [429,500])await run('password request handles '+status+' without leaking server details',async f=>{
  f.w.show('account');f.click('forgotPasswordBtn');f.input('passwordRequestEmail','synthetic@example.invalid');f.setHook(r=>r.url.includes('/recover')?response({msg:'PRIVATE SERVER DETAIL'},status):undefined);f.click('requestPasswordBtn');await tick();assert.equal(f.$('requestPasswordBtn').disabled,false);assert.doesNotMatch(f.$('passwordRequestStatus').textContent,/PRIVATE/);assert.match(f.$('passwordRequestStatus').textContent,status===429?/wait a minute/:/try again/);
 });
 for(const action of ['cancel','navigate','account'])await run('pending password request is cancelled by '+action,async f=>{
  f.w.show('account');f.click('forgotPasswordBtn');f.input('passwordRequestEmail','synthetic@example.invalid');const delay=deferred();f.setHook(r=>r.url.includes('/recover')?delay.promise:undefined);f.click('requestPasswordBtn');await tick();
  if(action==='cancel')f.click('cancelPasswordRequestBtn');else if(action==='navigate')f.w.show('home');else f.switchAccount('B');
  const text=f.$('passwordRequestStatus').textContent;delay.resolve(response({}));await tick();assert.equal(f.$('passwordRequestStatus').textContent,text);assert.equal(f.$('requestPasswordBtn').disabled,false);assert.equal(f.$('passwordRequestPane').classList.contains('hidden'),true);
 });
 await run('recovery validates its token before storing session and supports mismatch, busy, and successful completion',async f=>{
  assert.equal(f.w.location.hash,'');assert.equal(f.$('recoveryPassword').disabled,false);assert.equal(f.$('llAccessGate').classList.contains('lla-hidden'),true);
  f.input('recoveryPassword','synthetic-password');f.input('recoveryPassword2','different');f.click('saveRecoveryPasswordBtn');assert.match(f.$('recoveryStatus').textContent,/don't match/);
  f.input('recoveryPassword2','synthetic-password');const delay=deferred();f.setHook(r=>r.url.includes('/auth/v1/user')&&r.method==='PUT'?delay.promise:undefined);f.click('saveRecoveryPasswordBtn');f.click('saveRecoveryPasswordBtn');await tick();assert.equal(f.calls.filter(r=>r.method==='PUT').length,1);
  delay.resolve(response(user('A')));await tick();assert.match(f.$('recoveryStatus').textContent,/Password updated/);assert.equal(f.$('recoveryPassword').value,'');assert.equal(f.$('saveRecoveryPasswordBtn').disabled,true);
 },{fragment:recovery});
 for(const fragment of ['#error=access_denied&error_code=otp_expired','#type=recovery'])await run('expired or missing recovery token exposes new-link path and disables password writes',async f=>{
  assert.match(f.$('recoveryStatus').textContent,/expired or unavailable/);assert.equal(f.$('saveRecoveryPasswordBtn').disabled,true);assert.equal(f.w.location.hash,'');assert.equal(f.calls.filter(r=>r.method==='PUT').length,0);f.click('newRecoveryLinkBtn');assert.equal(f.$('passwordRequestPane').classList.contains('hidden'),false);assert.equal(f.w.document.activeElement,f.$('passwordRequestEmail'));
 },{fragment});
 await run('rejected token never replaces an existing stored account',async f=>{assert.equal(JSON.parse(f.w.localStorage.getItem('eea_label_maker_supabase_session_v1')).access_token,'synthetic-A');assert.match(f.$('recoveryStatus').textContent,/expired/);assert.equal(f.$('saveRecoveryPasswordBtn').disabled,true)}, {fragment:'#type=recovery&access_token=synthetic-invalid',authUser:()=>response({msg:'PRIVATE ERROR'},401)});
 for(const action of ['account','navigate'])await run('pending recovery save cannot overwrite or navigate after '+action,async f=>{
  const delay=deferred();f.setHook(r=>r.url.includes('/auth/v1/user')&&r.method==='PUT'?delay.promise:undefined);f.input('recoveryPassword','synthetic-password');f.input('recoveryPassword2','synthetic-password');f.click('saveRecoveryPasswordBtn');await tick();
  if(action==='account')f.switchAccount('B');else f.click('recoveryBackBtn');delay.resolve(response(user('A')));await tick();assert.equal(f.$('recoveryPassword').value,'');assert.doesNotMatch(f.$('recoveryStatus').textContent,/Password updated/);if(action==='account')assert.equal(f.w.eval('currentUser.id'),'B');else assert.equal(f.$('account').classList.contains('hidden'),false);
 },{fragment:recovery});
 for(const status of [401,429,500])await run('recovery save '+status+' is safe and retryable only with a valid session',async f=>{
  f.setHook(r=>r.url.includes('/auth/v1/user')&&r.method==='PUT'?response({msg:'PRIVATE DETAIL'},status):undefined);f.input('recoveryPassword','synthetic-password');f.input('recoveryPassword2','synthetic-password');f.click('saveRecoveryPasswordBtn');await tick();assert.doesNotMatch(f.$('recoveryStatus').textContent,/PRIVATE/);assert.equal(f.$('saveRecoveryPasswordBtn').disabled,status===401);
 },{fragment:recovery});
 for(const inputId of ['homeGalleryInput','homeCameraInput','galleryInput','cameraInput'])await run(inputId+' opens manual review with zero AI calls',async f=>{
  const file=new f.w.File(['synthetic'],'photo.png',{type:'image/png'});Object.defineProperty(f.$(inputId),'files',{value:[file]});f.$(inputId).dispatchEvent(new f.w.Event('change'));await tick();await tick();
  assert.equal(f.$('preview').classList.contains('hidden'),false);assert.equal(f.$('englishInput').value,'');assert.equal(f.$('spanishInput').value,'');assert.ok(f.$('labelPhoto').src.startsWith('data:image/'));
  assert.equal(f.$('identifyPhotoBtn').disabled,true);assert.match(f.$('photoAIStatus').textContent,/paid AI access and credits/);
  assert.equal(f.calls.filter(r=>r.url.includes('/functions/')).length,0);
  f.input('englishInput','Manual blocks');f.input('spanishInput','Teacher wording');f.click('previewBack');f.click('editIdentification');
  assert.equal(f.$('englishInput').value,'Manual blocks');assert.equal(f.$('spanishInput').value,'Teacher wording');await f.w.identify();f.click('identifyPhotoBtn');
  assert.equal(f.calls.filter(r=>r.url.includes('/functions/')).length,0);
 });
 for(const action of ['navigate','account','newer','cancel-to-manual'])await run('delayed local photo preparation is cancelled by '+action,async f=>{
  f.w.compressImage=async()=> 'data:image/jpeg;base64,ORIGINAL';await f.w.handlePhoto({name:'original.png'});f.input('englishInput','Keep my wording');
  const delay=deferred();f.w.compressImage=()=>delay.promise;const pending=f.w.handlePhoto({name:'delayed.png'});await tick();
  if(action==='navigate')f.w.show('home');else if(action==='account')f.switchAccount('B');else if(action==='cancel-to-manual')f.click('returnToPhotoLabel');else {f.w.compressImage=async()=> 'data:image/jpeg;base64,NEWEST';await f.w.handlePhoto({name:'new.png'});f.input('englishInput','Newest teacher edit');}
  delay.resolve('data:image/jpeg;base64,STALE');await pending;
  assert.notEqual(f.w.eval('photoDataUrl'),'data:image/jpeg;base64,STALE');
  if(action==='newer')assert.equal(f.$('englishInput').value,'Newest teacher edit');
  if(action==='cancel-to-manual')assert.equal(f.$('englishInput').value,'Keep my wording');
  assert.equal(f.calls.filter(r=>r.url.includes('/functions/')).length,0);
 });
 await run('cancelled picker and unreadable replacement preserve a usable manual label',async f=>{
  f.w.compressImage=async()=> 'data:image/jpeg;base64,ORIGINAL';await f.w.handlePhoto({name:'original.png'});f.input('englishInput','My photo label');f.input('spanishInput','Mi etiqueta');
  await f.w.handlePhoto(undefined);assert.equal(f.$('englishInput').value,'My photo label');assert.equal(f.$('preview').classList.contains('hidden'),false);
  f.w.compressImage=async()=>{throw Error('Synthetic bad photo')};await f.w.handlePhoto({name:'bad.png'});assert.match(f.$('identifyStatus').textContent,/read that photo/);f.click('returnToPhotoLabel');
  assert.equal(f.$('preview').classList.contains('hidden'),false);assert.equal(f.$('englishInput').value,'My photo label');assert.equal(f.$('spanishInput').value,'Mi etiqueta');assert.equal(f.w.eval('photoDataUrl'),'data:image/jpeg;base64,ORIGINAL');
 });
 await run('activation dialog traps Tab/Escape, makes background inert, and restores focus',async f=>{
  assert.equal(f.$('llAccessGate').getAttribute('role'),'dialog');assert.equal(f.w.document.querySelector('.app').inert,true);f.$('llaCode').focus();f.w.document.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));assert.equal(f.w.document.activeElement,f.$('llaManageAccount'));
  f.w.document.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));assert.equal(f.w.document.activeElement,f.$('llaCode'));
  f.w.document.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal(f.$('llAccessGate').classList.contains('lla-hidden'),false);
  f.click('llaManageAccount');assert.equal(!!f.w.document.querySelector('.app').inert,false);assert.equal(f.w.document.activeElement,f.$('accountBack'));f.click('accountBack');await tick();assert.equal(f.w.document.querySelector('.app').inert,true);
 },{purchased:false});
 await run('list and name fields have associated labels and selected state updates',async f=>{
  f.w.show('makeList');f.input('makeListInput','Synthetic Blocks');f.click('makeListCreateBtn');assert.equal(f.w.document.querySelector('.mli-en').labels.length,1);assert.equal(f.w.document.querySelector('.mli-tr').labels.length,1);assert.match(f.w.document.querySelector('.mli-remove').getAttribute('aria-label'),/Remove label 1/);assert.ok(f.$('nlNames').getAttribute('aria-label'));assert.ok(f.$('nlCopies').getAttribute('aria-label'));
  f.w.document.querySelector('[data-style="photo"]').click();assert.equal(f.w.document.querySelector('[data-style="photo"]').getAttribute('aria-pressed'),'true');assert.equal(f.w.document.querySelector('[data-style="name"]').getAttribute('aria-pressed'),'false');
 });
 await run('password success survives unavailable label sync',async f=>{
  f.setHook(r=>r.url.includes('/rest/v1/labels')||r.url.includes('/rest/v1/print_queue')?response({message:'Synthetic unavailable'},500):undefined);
  f.input('recoveryPassword','synthetic-password');f.input('recoveryPassword2','synthetic-password');f.click('saveRecoveryPasswordBtn');await tick();assert.match(f.$('recoveryStatus').textContent,/Password updated/);assert.equal(f.$('saveRecoveryPasswordBtn').disabled,true);
 },{fragment:recovery});
 {
  const delay=deferred();const f=await fixture({fragment:recovery,authUser:()=>delay.promise});
  try{f.w.show('account');delay.resolve(response(user('B')));await tick();assert.equal(f.w.eval('currentUser'),null);assert.equal(JSON.parse(f.w.localStorage.getItem('eea_label_maker_supabase_session_v1')).user.id,'A');assert.notEqual(f.w.document.activeElement,f.$('recoveryPassword'));assert.equal(f.$('recoveryPassword').disabled,true);assert.deepEqual(f.errors,[]);console.log('PASS pending token verification is cancelled before navigation');count++}finally{f.close()}
 }
 await run('network failure does not replay a photo request invisibly',async f=>{
  // Reinstall the production language adapter around an isolated counting transport.
  let calls=0;f.w.fetch=async()=>{calls++;throw Error('Synthetic connection failure')};f.w.eval(fs.readFileSync(path.join(root,'identification-language.js'),'utf8'));
  await assert.rejects(f.w.fetch(f.w.eval('FUNCTION_URL'),{method:'POST',body:JSON.stringify({imageDataUrl:'synthetic'})}));assert.equal(calls,1);
 });
 const untilAbort=r=>new Promise((resolve,reject)=>{r.signal.addEventListener('abort',()=>reject(new DOMException('Synthetic timed out','AbortError')),{once:true})});
 await run('recovery verification timeout disables passwords and offers a new link',async f=>{
  f.fireTimeouts();await tick();assert.match(f.$('recoveryStatus').textContent,/expired or unavailable/);assert.equal(f.$('saveRecoveryPasswordBtn').disabled,true);assert.equal(f.w.document.activeElement,f.$('newRecoveryLinkBtn'));
 },{fragment:recovery,authUser:untilAbort,captureTimeouts:true});
 await run('password PUT timeout leaves safe retry and clears its busy guard',async f=>{
  f.setHook(r=>r.url.includes('/auth/v1/user')&&r.method==='PUT'?untilAbort(r):undefined);f.input('recoveryPassword','synthetic-password');f.input('recoveryPassword2','synthetic-password');f.click('saveRecoveryPasswordBtn');await tick();f.fireTimeouts();await tick();assert.match(f.$('recoveryStatus').textContent,/try again/);assert.equal(f.$('saveRecoveryPasswordBtn').disabled,false);assert.equal(f.w.eval('recoveryBusy'),false);
 },{fragment:recovery,captureTimeouts:true});
 await run('password email timeout leaves safe retry and clears its busy guard',async f=>{
  f.w.show('account');f.click('forgotPasswordBtn');f.input('passwordRequestEmail','synthetic@example.invalid');f.setHook(r=>r.url.includes('/recover')?untilAbort(r):undefined);f.click('requestPasswordBtn');await tick();f.fireTimeouts();await tick();assert.match(f.$('passwordRequestStatus').textContent,/try again/);assert.equal(f.$('requestPasswordBtn').disabled,false);assert.equal(f.w.eval('passwordRequest'),null);
 },{captureTimeouts:true});
 await run('photo identification fails closed even if the disabled control is tampered with',async f=>{
  f.w.compressImage=async()=> 'data:image/jpeg;base64,SYNTHETIC';await f.w.handlePhoto({name:'photo.png'});f.$('identifyPhotoBtn').disabled=false;f.click('identifyPhotoBtn');await f.w.identify();
  assert.equal(f.calls.filter(r=>r.url.includes('/functions/')).length,0);assert.equal(f.$('preview').classList.contains('hidden'),false);
 });
 await run('activation renders only known public failures and generic server errors',async f=>{
  f.input('llaCode','SYNTHETIC');f.setHook(r=>r.url.includes('/activate_little_labels')?response({success:false,error:'PRIVATE DATABASE DETAIL'}):undefined);f.click('llaActivate');await tick();assert.doesNotMatch(f.$('llaStatus').textContent,/PRIVATE/);assert.match(f.$('llaStatus').textContent,/could not be activated/);assert.equal(f.$('llaActivate').disabled,false);
  f.setHook(r=>r.url.includes('/activate_little_labels')?response({message:'PRIVATE DATABASE DETAIL'},500):undefined);f.click('llaActivate');await tick();assert.doesNotMatch(f.$('llaStatus').textContent,/PRIVATE/);assert.match(f.$('llaStatus').textContent,/Check your connection/);
 },{purchased:false});
 console.log('PASS '+count+' customer-access scenarios');
})().catch(error=>{console.error(error);process.exitCode=1});
