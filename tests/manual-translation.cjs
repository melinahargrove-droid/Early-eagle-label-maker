// Production DOM handlers, synthetic identities/credentials only. All network is intercepted.
const {JSDOM,ResourceLoader,VirtualConsole}=require('jsdom');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),tick=()=>new Promise(r=>setTimeout(r,15));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
const user=id=>({id,email:id+'@example.invalid',is_anonymous:false,identities:[{provider:'email'}]});
const session=id=>({access_token:'synthetic-'+id,refresh_token:'synthetic-refresh-'+id,expires_in:3600,user:user(id)});
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
class Local extends ResourceLoader{fetch(url){const u=new URL(url);return u.origin==='https://labels.test'&&u.pathname.endsWith('.js')?Promise.resolve(fs.readFileSync(path.join(root,u.pathname))):null}}
async function fixture({fragment='',purchased=true,authUser,captureTimeouts=false,creditTransport,journal}={}){
 const timeouts=new Map();let timerId=100000;
 const errors=[],calls=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));let hook=null;
 const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'https://labels.test/?appv=116'+fragment,runScripts:'dangerously',resources:new Local(),pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  if(creditTransport)w.LittleLabelsCreditTestTransport=creditTransport; if(journal)for(const [k,v] of Object.entries(journal))w.sessionStorage.setItem(k,v);
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
function creditFixture(available=10){
 const calls=[],operations=new Map();let credits=available;
 const balance=accountId=>({accountId,available_credits:credits,reserved_credits:0});
 const api={kind:'synthetic-test',calls,operations,get credits(){return credits},
  async balance(body){calls.push({method:'balance',body});return balance(body.ownerAccountId)},
  async quote(body){calls.push({method:'quote',body});return {...balance(body.ownerAccountId),action:'translation',units:1,credits:1,language:body.language,english:body.labels[0],catalogVersion:'approved-2026-10-06'}},
  async execute(body){calls.push({method:'execute',body});if(operations.has(body.operationId))return operations.get(body.operationId);credits--;const result={...balance(body.ownerAccountId),operationId:body.operationId,state:'settled',action:'translation',units:1,credits:1,result:{english:body.labels[0],language:body.language,translation:'Synthetic translated wording'}};operations.set(body.operationId,result);return result},
  async status(body){calls.push({method:'status',body});return operations.get(body.operationId)}
 };return api;
}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const ai=f=>f.calls.filter(r=>r.url.includes('/functions/v1/'));
const typedButton=f=>f.$('tlTranslationTools').querySelector('button');
const reviewButton=f=>f.$('singleTranslationTools').querySelector('button');
let count=0;
async function run(name,fn,options={}){const api=options.creditTransport===false?undefined:options.creditTransport||creditFixture();const f=await fixture({...options,creditTransport:api});try{await fn(f,api);await tick();assert.deepEqual(f.errors,[]);assert.equal(ai(f).length,0,'No legacy AI endpoint was called');console.log('PASS '+name);count++}finally{f.close()}}
(async()=>{
 await run('translation confirmation discloses processing and exact cost before any text is sent',async(f,api)=>{
  f.click('homeTypeBtn');f.input('tlEnglish','Private teacher wording');await tick();
  let prompt='';f.w.confirm=text=>{prompt=text;assert.equal(api.calls.filter(x=>['quote','execute'].includes(x.method)).length,0);return false};
  typedButton(f).click();await tick();assert.match(prompt,/Translate with AI/);assert.match(prompt,/English wording.*AI processing/);assert.match(prompt,/Cost: 1 credit/);assert.equal(api.calls.filter(x=>['quote','execute'].includes(x.method)).length,0);
  f.w.confirm=()=>true;typedButton(f).click();await tick();assert.equal(api.calls.filter(x=>x.method==='execute').length,1);
 });
 await run('unlock information has no purchase action, sends no data and restores keyboard focus',async(f)=>{
  f.click('homeTypeBtn');f.input('tlEnglish','My manual words');const unlock=f.$('tlTranslationTools').querySelector('.ll-unlock-features');assert.equal(unlock.hidden,false);assert.equal(typedButton(f).hidden,true);
  unlock.focus();unlock.click();const dialog=f.$('llFeatureInfo');assert.equal(dialog.hidden,false);assert.match(dialog.textContent,/tools use AI to process the text or photo/);assert.match(dialog.textContent,/exact credit cost/);assert.match(dialog.textContent,/not connected/);assert.equal(dialog.querySelectorAll('button').length,2);assert.equal(f.w.document.querySelector('.app').inert,true);
  const buttons=dialog.querySelectorAll('button');buttons[0].focus();f.w.document.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));assert.equal(f.w.document.activeElement,buttons[1]);
  f.w.document.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal(dialog.hidden,true);assert.equal(f.w.document.activeElement,unlock);assert.equal(!!f.w.document.querySelector('.app').inert,true,'The underlying Type dialog still keeps the background inert');assert.equal(ai(f).length,0);assert.equal(f.$('tlEnglish').value,'My manual words');
  unlock.click();buttons[1].click();assert.equal(dialog.hidden,true);assert.equal(f.w.document.activeElement,unlock);
 },{creditTransport:false});
 await run('a changed draft during consent cannot start a quote or charge',async(f,api)=>{
  f.click('homeTypeBtn');f.input('tlEnglish','Before');f.w.confirm=()=>{f.input('tlEnglish','After');return true};typedButton(f).click();await tick();assert.equal(api.calls.filter(x=>['quote','execute'].includes(x.method)).length,0);
 });
 await run('using the final credit keeps a clear success message beside the manual wording',async(f,api)=>{
  f.click('homeTypeBtn');f.input('tlEnglish','Blocks');await tick();typedButton(f).click();await tick();assert.equal(api.credits,0);const summary=f.$('tlTranslationTools').querySelector('.ll-translation-summary');assert.equal(summary.hidden,false);assert.match(summary.textContent,/Translation ready/);assert.equal(f.$('tlTranslationTools').querySelector('.ll-unlock-features').hidden,false);
 },{creditTransport:creditFixture(1)});
 await run('manual typing, Review, settings and review edits make no AI/credit execute calls',async(f,api)=>{
  f.click('homeTypeBtn');f.input('tlEnglish','Manual blocks');await pause(850);f.click('tlNext');await tick();assert.equal(f.$('preview').classList.contains('hidden'),false);assert.equal(f.$('spanishInput').value,'');
  f.input('englishInput','Edited blocks');f.input('spanishInput','Manual translation');f.w.dispatchEvent(new f.w.CustomEvent('little-label-settings-changed'));await pause(950);
  assert.equal(f.$('spanishInput').value,'Manual translation');assert.equal(api.calls.filter(x=>['quote','execute'].includes(x.method)).length,0);
 });
 await run('explicit typed button quotes and spends exactly 1 once; updates balance and second line',async(f,api)=>{
  f.click('homeTypeBtn');f.input('tlEnglish','Blocks');await tick();typedButton(f).click();typedButton(f).click();await tick();
  assert.equal(api.calls.filter(x=>x.method==='execute').length,1);const sent=api.calls.find(x=>x.method==='execute').body;assert.equal(sent.ownerAccountId,'A');assert.equal(sent.confirmedCredits,1);assert.equal(sent.explicitAction,true);assert.match(sent.operationId,/^[0-9a-f-]{36}$/);
  assert.equal(f.$('tlSecond').value,'Synthetic translated wording');assert.match(f.$('tlTranslationTools').textContent,/9 available/);
 });
 await run('manual second-language edit while execute pending is never overwritten',async(f,api)=>{
  const delay=deferred(),execute=api.execute.bind(api);api.execute=async body=>{const value=await execute(body);await delay.promise;return value};
  f.click('homeTypeBtn');f.input('tlEnglish','Blocks');typedButton(f).click();await tick();f.input('tlSecond','Teacher wording');delay.resolve();await tick();
  assert.equal(f.$('tlSecond').value,'Teacher wording');assert.match(f.$('tlTranslationTools').textContent,/current wording was kept/);assert.equal(api.credits,9);
 });
 await run('quote discarded without execute when English changes during quote',async(f,api)=>{
  const delay=deferred(),quote=api.quote.bind(api);api.quote=async body=>{const value=await quote(body);await delay.promise;return value};
  f.click('homeTypeBtn');f.input('tlEnglish','Blocks');typedButton(f).click();await tick();f.input('tlEnglish','New draft');delay.resolve();await tick();assert.equal(api.calls.filter(x=>x.method==='execute').length,0);
 });
 await run('lost committed response recovers same operation through status, no second execute',async(f,api)=>{
  const execute=api.execute.bind(api);api.execute=async body=>{await execute(body);throw Error('Lost response')};
  f.click('homeTypeBtn');f.input('tlEnglish','Blocks');typedButton(f).click();await tick();assert.match(typedButton(f).textContent,/Check/);typedButton(f).click();typedButton(f).click();await tick();
  assert.equal(api.calls.filter(x=>x.method==='execute').length,1);assert.equal(api.calls.filter(x=>x.method==='status').length,1);assert.equal(api.credits,9);assert.equal(f.$('tlSecond').value,'Synthetic translated wording');
 });
 await run('typed-to-review navigation retains recoverable result without overwriting manual draft',async(f,api)=>{
  const delay=deferred(),execute=api.execute.bind(api);api.execute=async body=>{const result=await execute(body);await delay.promise;return result};
  f.click('homeTypeBtn');f.input('tlEnglish','Blocks');typedButton(f).click();await tick();f.click('tlNext');await tick();assert.equal(f.$('preview').classList.contains('hidden'),false);assert.equal(reviewButton(f).disabled,true);
  delay.resolve();await tick();assert.equal(f.$('spanishInput').value,'');assert.match(f.$('singleTranslationTools').textContent,/Recovered translation/);assert.equal(api.calls.filter(x=>x.method==='execute').length,1);
  f.$('singleTranslationTools').querySelector('.ll-ai-use').click();assert.match(f.$('singleTranslationTools').querySelector('.ll-translation-summary').textContent,/Recovered translation added/);assert.equal(f.$('spanishInput').value,'Synthetic translated wording');assert.equal(api.calls.filter(x=>x.method==='execute').length,1);
 });
 await run('different account cannot receive an old result, balance or draft',async(f,api)=>{
  const delay=deferred(),execute=api.execute.bind(api);api.execute=async body=>{const result=await execute(body);await delay.promise;return result};
  f.click('homeTypeBtn');f.input('tlEnglish','Private A');typedButton(f).click();await tick();f.switchAccount('B');delay.resolve();await tick();assert.equal(f.$('tlEnglish').value,'');assert.equal(f.$('tlSecond').value,'');assert.doesNotMatch(f.$('tlTranslationTools').textContent,/Recovered translation/);
 });
 await run('zero balance leaves manual Review usable and gives a friendly explanation',async(f,api)=>{
  f.click('homeTypeBtn');f.input('tlEnglish','Blocks');await tick();assert.equal(typedButton(f).disabled,true);assert.match(f.$('tlTranslationTools').textContent,/0 AI credits/);f.click('tlNext');await tick();assert.equal(f.$('preview').classList.contains('hidden'),false);assert.equal(api.calls.filter(x=>x.method==='execute').length,0);
 },{creditTransport:creditFixture(0)});
 await run('unconnected bridge has no fallback and clearly explains manual availability',async f=>{
  f.click('homeTypeBtn');f.input('tlEnglish','Blocks');assert.equal(typedButton(f).disabled,true);assert.match(f.$('tlTranslationTools').textContent,/local test build/);f.click('tlNext');await tick();assert.equal(f.$('preview').classList.contains('hidden'),false);
 },{creditTransport:false});
 await run('changed credit quote rejected before dispatch',async(f,api)=>{
  const quote=api.quote.bind(api);api.quote=async body=>({...await quote(body),credits:2});f.click('homeTypeBtn');f.input('tlEnglish','Blocks');typedButton(f).click();await tick();assert.equal(api.calls.filter(x=>x.method==='execute').length,0);assert.match(f.$('tlTranslationTools').textContent,/quote changed/);
 });
 await run('pending pointer recovers after reload without storing label wording',async(f,api)=>{
  const execute=api.execute.bind(api);api.execute=async body=>{await execute(body);throw Error('Lost response')};f.click('homeTypeBtn');f.input('tlEnglish','Private label');typedButton(f).click();await tick();
  const journal=Object.fromEntries(Object.keys(f.w.sessionStorage).map(k=>[k,f.w.sessionStorage.getItem(k)]));assert.doesNotMatch(JSON.stringify(journal),/Private label|translated wording/);
  const next=await fixture({creditTransport:api,journal});try{next.click('homeTypeBtn');typedButton(next).click();await tick();assert.equal(api.calls.filter(x=>x.method==='execute').length,1);assert.equal(next.$('tlSecond').value,'');assert.match(next.$('tlTranslationTools').textContent,/Recovered translation/)}finally{next.close()}
 });
 await run('review translation works but save identity change prevents a late overwrite',async(f,api)=>{
  f.click('homeTypeBtn');f.input('tlEnglish','Blocks');f.click('tlNext');await tick();reviewButton(f).click();await tick();assert.equal(f.$('spanishInput').value,'Synthetic translated wording');
  const delay=deferred(),execute=api.execute.bind(api);api.execute=async body=>{const result=await execute(body);await delay.promise;return result};f.input('englishInput','New blocks');reviewButton(f).click();await tick();f.w.eval('singleSaveJob={complete:false}');delay.resolve();await tick();assert.equal(f.$('spanishInput').value,'Synthetic translated wording');assert.match(f.$('singleTranslationTools').textContent,/save is finishing/);
 });
 console.log('PASS '+count+' manual-first translation scenarios; synthetic transport only');
})().catch(error=>{console.error(error);process.exitCode=1});
