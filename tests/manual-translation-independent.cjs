// Independent manual-first translation review. All transport responses are synthetic.
// JSDOM loads local assets only; fetch records and rejects every would-be network call.
// Existing entitlement requests may be attempted and are blocked; legacy AI requests
// are asserted absent. No browser, database, provider, Stripe, or live API is used.
// Run: node tests/manual-translation-independent.cjs
const assert=require('node:assert/strict');
const { open, tick, ROOT } = (() => {
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, ResourceLoader, VirtualConsole } = require('jsdom');
const ROOT = path.resolve(__dirname, '..');
const tick = (ms = 10) => new Promise(resolve => setTimeout(resolve, ms));
async function open(root = ROOT, options = {}) {
  const errors = [], network = [], vc = new VirtualConsole();
  vc.on('jsdomError', error => errors.push(error.message));
  class Local extends ResourceLoader {
    fetch(url) {
      const u = new URL(url);
      if (u.hostname !== 'labels.test' || !u.pathname.endsWith('.js')) return null;
      if (options.skipCreditAsset && u.pathname.endsWith('/translation-credit-controls.js')) return Promise.resolve(Buffer.from(''));
      return Promise.resolve(fs.readFileSync(path.join(root, u.pathname)));
    }
  }
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), {
    url: 'https://labels.test/', pretendToBeVisual: true, runScripts: 'dangerously', resources: new Local(), virtualConsole: vc,
    beforeParse(w) {
      w.fetch = async (url, options) => { network.push({ url, options }); throw Error('Independent review blocks all network'); };
      w.Headers = Headers; w.Response = Response; w.Request = Request; w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
      w.scrollTo = () => {}; w.alert = () => {}; w.confirm = () => true;
      w.Image = class { constructor() { this.naturalWidth = 1; this.naturalHeight = 1; } set src(value) { queueMicrotask(() => this.onload?.()); } };
      w.HTMLCanvasElement.prototype.getContext = () => ({ fillRect() {}, drawImage() {} });
      w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,c3ludGhldGlj';
      if (options.storage) for (const [key, value] of options.storage) w.sessionStorage.setItem(key, value);
      options.beforeParse?.(w);
    }
  });
  const w = dom.window;
  await new Promise(resolve => w.addEventListener('load', resolve));
  await tick();
  const $ = id => w.document.getElementById(id);
  const click = id => { if (!$(id)) throw Error('Missing control ' + id); $(id).click(); };
  const input = (id, value) => { $(id).value = value; $(id).dispatchEvent(new w.Event('input', { bubbles: true })); };
  const owner = id => { w.eval(`currentUser = ${JSON.stringify(id ? { id, is_anonymous: false, email: id + '@example.invalid' } : null)}; cloudSession = ${JSON.stringify(id ? { access_token: 'synthetic-' + id } : null)}; cloudReady = false; observeCloudSession();`); w.document.dispatchEvent(new w.Event('little-label-account-changed')); };
  const language = code => { const settings = w.LittleLabelSettings.get(); w.localStorage.setItem('littleLabelsSettingsV3', JSON.stringify({ ...settings, language: code })); w.dispatchEvent(new w.CustomEvent('little-label-settings-changed')); };
  return { dom, w, $, click, input, owner, language, errors, network, close: () => w.close() };
}
return { open, tick, ROOT };

})();
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}}
function fixture(options={}){
 const calls={balance:[],quote:[],execute:[],status:[]},results=new Map();
 const funds=(id)=>({accountId:id,available_credits:options.balance??10,reserved_credits:0});
 const settled=req=>({...funds(req.ownerAccountId),accountId:req.ownerAccountId,operationId:req.operationId,state:'settled',action:'translation',units:1,credits:1,result:{english:req.labels[0],language:req.language,translation:'Traducido '+req.labels[0]}});
 const api={kind:'synthetic-test',
 balance:async req=>{calls.balance.push(req);return funds(req.ownerAccountId)},
 quote:async req=>{calls.quote.push(req);const response={...funds(req.ownerAccountId),action:'translation',units:1,credits:1,language:req.language,english:req.labels[0],catalogVersion:'independent-synthetic-v1'};return options.quote?options.quote(req,response):response},
 execute:async req=>{calls.execute.push(req);const response=settled(req);results.set(req.operationId,response);return options.execute?options.execute(req,response):response},
 status:async req=>{calls.status.push(req);const response=results.get(req.operationId);return options.status?options.status(req,response):response}
 };
 return {api,calls,results,settled};
}
async function withApp(fn,options={}){const f=fixture(options),h=await open(ROOT,{beforeParse:w=>{w.LittleLabelsCreditTestTransport=f.api;options.beforeParse?.(w)}});try{h.owner('review-A');await fn(h,f);assert.deepEqual(h.errors,[],'runtime errors');assert.equal(h.network.filter(x=>/\/(translate-label|identify-material|batch-labels|batch-wording|label-picture)(?:[?]|$)/.test(String(x.url))).length,0,'no legacy AI network even attempted')}finally{await tick(20);h.close()}}
const tests=[];function test(name,fn){tests.push({name,fn})}const buttons=h=>({typed:h.$('tlTranslationTools').querySelector('button'),review:h.$('singleTranslationTools').querySelector('button')});
async function start(h,text='Blocks'){h.click('homeTypeBtn');h.input('tlEnglish',text);await tick();}
test('Manual typing/review/settings create no AI and preserve bilingual work',()=>withApp(async(h,f)=>{await start(h);h.input('tlSecond','Manual Spanish');h.input('tlEnglish','Edited blocks');h.language('fr');assert.equal(h.$('tlSecond').value,'Manual Spanish');await tick(1000);h.click('tlNext');await tick();h.input('englishInput','Further edit');h.input('spanishInput','Manual French');h.language('de');await tick(1000);assert.equal(h.$('spanishInput').value,'Manual French');assert.equal(f.calls.execute.length,0);assert.equal(f.calls.quote.length,0);assert.equal(h.$('labelSpanish').textContent,'Manual French')}));
test('Blank second line can review and save manually',()=>withApp(async(h,f)=>{await start(h);h.click('tlNext');await tick();assert.ok(!h.$('preview').classList.contains('hidden'));h.click('chooseSetBtn');await tick();h.click('addToQueue');await tick(100);assert.equal(h.w.eval('library.length'),1);assert.equal(h.w.eval('library[0].spanish'),'');assert.equal(f.calls.execute.length,0)}));
test('Double click dispatches once',()=>withApp(async(h,f)=>{await start(h);buttons(h).typed.click();buttons(h).typed.click();await tick();assert.equal(f.calls.quote.length,1);assert.equal(f.calls.execute.length,1);assert.equal(h.$('tlSecond').value,'Traducido Blocks')}));
test('Lost execute response status recovers same operation without regeneration',()=>withApp(async(h,f)=>{await start(h);buttons(h).typed.click();await tick();const req=f.calls.execute[0];assert.ok(req.operationId);assert.match(buttons(h).typed.textContent,/Check/);buttons(h).typed.click();await tick();assert.equal(f.calls.execute.length,1);assert.equal(f.calls.status.length,1);assert.equal(f.calls.status[0].operationId,req.operationId);assert.equal(h.$('tlSecond').value,'Traducido Blocks')},{execute:async()=>{throw Error('Synthetic lost response')}}));
test('Manual second edits cannot be overwritten by late result',async()=>{const gate=deferred();await withApp(async(h,f)=>{await start(h);buttons(h).typed.click();await tick();h.input('tlSecond','My correction');gate.resolve();await tick();assert.equal(h.$('tlSecond').value,'My correction');assert.match(h.$('tlTranslationTools').textContent,/Recovered translation/);assert.equal(f.calls.execute.length,1)},{execute:async(req,result)=>{await gate.promise;return result}})});
test('Typed-to-review navigation retains a discoverable paid result',async()=>{const gate=deferred();await withApp(async(h,f)=>{await start(h);buttons(h).typed.click();await tick();h.click('tlNext');await tick();gate.resolve();await tick();assert.equal(h.$('spanishInput').value,'');const visible=h.$('singleTranslationTools').textContent;h.click('previewBack');await tick();const returned=h.$('tlTranslationTools').textContent;const pending=Object.entries(h.w.sessionStorage).filter(([key])=>key.includes('pending-translation'));assert.ok(visible.includes('Traducido Blocks')||returned.includes('Traducido Blocks')||pending.length>0,'Paid result disappears: no visible or returned-panel result and no recovery pointer')} ,{execute:async(req,result)=>{await gate.promise;return result}})});
test('Insufficient balance never executes and manual review remains available',()=>withApp(async(h,f)=>{await start(h);assert.equal(buttons(h).typed.disabled,true);h.click('tlNext');await tick();assert.ok(!h.$('preview').classList.contains('hidden'));assert.equal(f.calls.execute.length,0)},{balance:0}));
test('Changed quote does not dispatch',()=>withApp(async(h,f)=>{await start(h);buttons(h).typed.click();await tick();assert.equal(f.calls.execute.length,0);assert.match(h.$('tlTranslationTools').textContent,/quote changed/)},{quote:async(req,result)=>({...result,credits:2})}));
test('Delayed quote after edits never dispatches',async()=>{const gate=deferred();await withApp(async(h,f)=>{await start(h);buttons(h).typed.click();await tick();h.input('tlEnglish','New wording');gate.resolve();await tick();assert.equal(f.calls.execute.length,0)},{quote:async(req,result)=>{await gate.promise;return result}})});
test('Malformed success keeps pending handle and never overwrites manual input',()=>withApp(async(h,f)=>{await start(h);h.input('tlSecond','Manual');buttons(h).typed.click();await tick();assert.equal(h.$('tlSecond').value,'Manual');assert.match(buttons(h).typed.textContent,/Check/);assert.ok(Object.keys(h.w.sessionStorage).some(k=>k.includes('pending-translation')));buttons(h).typed.click();await tick();assert.equal(f.calls.execute.length,1)},{execute:async(req,result)=>({...result,result:{...result.result,translation:{invalid:true}}})}));
test('Account switch cannot apply or expose A response to B',async()=>{const gate=deferred();await withApp(async(h,f)=>{await start(h,'Private A wording');buttons(h).typed.click();await tick();h.owner('review-B');await start(h,'B wording');gate.resolve();await tick();assert.equal(h.$('tlSecond').value,'');assert.ok(!h.$('tlTranslationTools').textContent.includes('Private A wording'));h.owner('review-A');await start(h,'A replacement draft');buttons(h).typed.click();await tick();assert.equal(f.calls.execute.length,1);assert.equal(f.calls.status[0].ownerAccountId,'review-A')},{execute:async(req,result)=>{await gate.promise;return result}})});
test('Review result does not overwrite a captured save payload',async()=>{const gate=deferred();await withApp(async(h,f)=>{await start(h);h.click('tlNext');await tick();buttons(h).review.click();await tick();h.click('chooseSetBtn');await tick();h.click('addToQueue');await tick();gate.resolve();await tick();assert.equal(h.w.eval('library[0].spanish'),'');assert.equal(h.$('spanishInput').value,'');assert.equal(f.calls.execute.length,1)},{execute:async(req,result)=>{await gate.promise;return result}})});
test('English-only toggle preserves same-review manual text and saves no hidden line',()=>withApp(async(h)=>{await start(h);h.input('tlSecond','Manual');h.click('tlNext');await tick();h.language('none');assert.equal(h.$('spanishInput').value,'');h.language('es');assert.equal(h.$('spanishInput').value,'Manual');h.language('none');h.click('chooseSetBtn');await tick();h.click('addToQueue');await tick(100);assert.equal(h.w.eval('library[0].spanish'),'')}));
test('Typed English-only roundtrip preserves unfinished bilingual wording',()=>withApp(async(h)=>{await start(h);h.input('tlSecond','Manual');h.language('none');h.click('tlNext');await tick();h.click('previewBack');await tick();h.language('es');assert.equal(h.$('tlSecond').value,'Manual','English-only Review+Back destroys typed second line')}));
test('Storage failure prevents provider dispatch, leaves manual input usable',()=>withApp(async(h,f)=>{await start(h);h.w.Storage.prototype.setItem=function(){throw Error('Storage denied')};buttons(h).typed.click();await tick();assert.equal(f.calls.execute.length,0);h.click('tlNext');await tick();assert.ok(!h.$('preview').classList.contains('hidden'))}));
test('Without synthetic transport production path stays unavailable and manual usable',async()=>{const h=await open();try{h.owner('review-A');await start(h);assert.equal(buttons(h).typed.disabled,true);assert.match(h.$('tlTranslationTools').textContent,/not connected/);h.click('tlNext');await tick();assert.ok(!h.$('preview').classList.contains('hidden'));assert.equal(h.network.filter(x=>/translate-label/.test(String(x.url))).length,0)}finally{await tick();h.close()}});
test('Recovered result is account-bound and applies only matching language and wording',async()=>{const gate=deferred();await withApp(async(h,f)=>{await start(h);buttons(h).typed.click();await tick();h.click('tlNext');await tick();gate.resolve();await tick();const use=h.$('singleTranslationTools').querySelector('.ll-ai-use');assert.equal(use.hidden,false);h.input('englishInput','Other wording');assert.equal(use.disabled,true);h.input('englishInput','Blocks');h.language('fr');assert.equal(use.disabled,true);h.language('es');assert.equal(use.disabled,false);use.click();assert.equal(h.$('spanishInput').value,'Traducido Blocks');assert.equal(f.calls.execute.length,1);assert.equal(Object.keys(h.w.sessionStorage).filter(k=>k.includes('pending-translation')).length,0)},{execute:async(req,result)=>{await gate.promise;return result}})});
test('Corrupt operation journal blocks AI but never manual review',()=>withApp(async(h,f)=>{h.w.sessionStorage.setItem('little-labels-pending-translation-v1:review-A','not json');await start(h);assert.equal(buttons(h).typed.disabled,true);h.click('tlNext');await tick();assert.ok(!h.$('preview').classList.contains('hidden'));assert.equal(f.calls.execute.length,0)}));
test('Reload recovery reuses operation and stores no label wording',async()=>{const f=fixture({execute:async()=>{throw Error('Lost')}});let h=await open(ROOT,{beforeParse:w=>{w.LittleLabelsCreditTestTransport=f.api}});try{h.owner('review-A');await start(h,'Private wording');buttons(h).typed.click();await tick();const saved=Object.entries(h.w.sessionStorage),req=f.calls.execute[0];assert.ok(saved.length);assert.ok(!JSON.stringify(saved).includes('Private wording'));await tick();h.close();h=await open(ROOT,{storage:saved,beforeParse:w=>{w.LittleLabelsCreditTestTransport=f.api}});h.owner('review-A');await start(h,'Private wording');buttons(h).typed.click();await tick();assert.equal(f.calls.execute.length,1);assert.equal(f.calls.status[0].operationId,req.operationId);const use=h.$('tlTranslationTools').querySelector('.ll-ai-use');assert.equal(use.disabled,false);use.click();assert.equal(h.$('tlSecond').value,'Traducido Private wording')}finally{await tick();h.close()}});
test('Confirmed unusable/refunded result returns credit and enables a new explicit action',()=>withApp(async(h,f)=>{await start(h);buttons(h).typed.click();await tick();assert.match(h.$('tlTranslationTools').textContent,/credit was returned/);assert.equal(h.$('tlSecond').value,'');buttons(h).typed.click();await tick();assert.equal(f.calls.execute.length,2);assert.notEqual(f.calls.execute[0].operationId,f.calls.execute[1].operationId)},{execute:async(req,result)=>({...result,state:'refunded',credits:0,result:undefined})}));
test('Timed-out execute retains its ID and can only status-check',()=>withApp(async(h,f)=>{await start(h);buttons(h).typed.click();await tick(40);assert.equal(f.calls.execute.length,1);assert.match(buttons(h).typed.textContent,/Check translation/);buttons(h).typed.click();await tick();assert.equal(f.calls.execute.length,1);assert.equal(f.calls.status.length,1);assert.equal(f.calls.status[0].operationId,f.calls.execute[0].operationId)},{beforeParse:w=>{const later=w.setTimeout.bind(w);w.setTimeout=(fn,ms,...args)=>later(fn,ms===45000?20:ms,...args)},execute:async()=>new Promise(()=>{})}));
test('Missing optional credit script preserves manual creation and review',async()=>{const h=await open(ROOT,{skipCreditAsset:true});try{h.owner('review-A');await start(h);h.click('tlNext');await tick();assert.ok(!h.$('preview').classList.contains('hidden'),'Manual Review must work when the optional credit script is absent');h.input('englishInput','Manual survives missing credit script');h.input('spanishInput','Manual second');assert.equal(h.$('labelEnglish').textContent,'Manual survives missing credit script');h.language('none');assert.equal(h.$('spanishInput').value,'');h.click('chooseSetBtn');await tick();h.click('addToQueue');await tick(100);assert.equal(h.w.eval('library.length'),1);assert.equal(h.w.eval('library[0].english'),'Manual survives missing credit script');assert.equal(h.w.eval('library[0].spanish'),'');assert.deepEqual(h.errors,[])}finally{await tick();h.close()}});
(async()=>{let failures=0;for(const{name,fn}of tests){try{await fn();console.log('PASS '+name)}catch(error){failures++;console.error('FAIL '+name+'\n'+error.stack)}}console.log(JSON.stringify({tests:tests.length,failures,mode:'synthetic DOM; no live network/DB/browser/API/Stripe'},null,2));process.exitCode=failures?1:0})()
