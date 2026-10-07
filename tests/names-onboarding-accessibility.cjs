// Production handlers, synthetic accounts/names/images only. No external I/O.
const { JSDOM, ResourceLoader, VirtualConsole } = require('jsdom');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP88OEDAwMDEwMDAwMDAwAh6gLUcoFD3wAAAABJRU5ErkJggg==';
const tick = (ms=25) => new Promise(resolve => setTimeout(resolve, ms));
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return {promise,resolve}; };
const session = (anonymous=false,id='synthetic-A') => ({access_token:'synthetic-'+id,refresh_token:'synthetic-refresh-'+id,expires_in:3600,user:{id,is_anonymous:anonymous,email:anonymous?undefined:'audit@example.invalid',identities:anonymous?[]:[{}]}});
const response = body => new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});
class Local extends ResourceLoader {
  fetch(url) { const u = new URL(url); return u.hostname==='labels.test'&&u.pathname.endsWith('.js') ? Promise.resolve(fs.readFileSync(path.join(root,u.pathname))) : null; }
}
async function fixture(options={}) {
  const errors=[],calls=[],alerts=[],confirms=[],vc=new VirtualConsole();vc.on('jsdomError',error=>errors.push(error.message));let statusHook=null;
  const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'https://labels.test/',resources:new Local(),runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
    w.Headers=Headers;w.Response=Response;w.AbortController=AbortController;w.TextEncoder=TextEncoder;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
    w.alert=text=>alerts.push(text);w.confirm=text=>{confirms.push(text);return false;};
    if(!options.welcome)w.localStorage.setItem('littleLabelsWelcomeSeenV1','1');
    if(!options.anonymous)w.localStorage.setItem('eea_label_maker_supabase_session_v1',JSON.stringify(session()));
    w.Image=class{constructor(){this.naturalWidth=this.naturalHeight=2;}set src(value){queueMicrotask(()=>this.onload?.());}};
    w.HTMLCanvasElement.prototype.getContext=()=>new Proxy({measureText:text=>({width:String(text).length*10}),createLinearGradient:()=>({addColorStop(){}})},{get:(object,key)=>key in object?object[key]:()=>{}});
    w.HTMLCanvasElement.prototype.toDataURL=()=>photo;
    w.fetch=async(url,request={})=>{
      const p=new URL(url).pathname;calls.push({path:p,method:request.method||'GET'});
      if(p.startsWith('/auth/')){if(options.authGate)await options.authGate.promise;return response(session(!!options.anonymous));}
      if(p.endsWith('/little_labels_access_status')){if(options.statusGate)await options.statusGate.promise;if(statusHook)await statusHook();return response({active:options.active!==false});}
      if(p.endsWith('/little_labels_admin_status'))return response({is_admin:false});
      if(p==='/rest/v1/labels'||p==='/rest/v1/print_queue'){assert.equal(request.method||'GET','GET');return response([]);}
      throw Error('Unexpected mocked request '+p);
    };
  }});
  const w=dom.window;await new Promise(resolve=>w.addEventListener('load',resolve));await tick();
  const $=id=>w.document.getElementById(id),input=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new w.Event('input',{bubbles:true}));};
  const key=(el,key,shiftKey=false)=>{const event=new w.KeyboardEvent('keydown',{key,shiftKey,bubbles:true,cancelable:true});el.dispatchEvent(event);return event.defaultPrevented;};
  function openNames(){const trigger=$('homeNameBtn');trigger.focus();trigger.click();return trigger;}
  function addPhoto(index){
    w.FileReader=class{readAsDataURL(){this.result=photo;this.onload();}};
    const create=w.document.createElement.bind(w.document);w.document.createElement=tag=>{const el=create(tag);if(tag==='input')el.click=()=>{Object.defineProperty(el,'files',{value:[{}]});el.onchange();};return el;};
    try{$('nlPhotos').querySelectorAll('button')[index].click();}finally{w.document.createElement=create;}
  }
  return{w,$,input,key,openNames,addPhoto,calls,errors,alerts,confirms,setStatusHook:hook=>statusHook=hook,close(){w.close();assert.deepEqual(errors,[]);assert.equal(calls.filter(call=>call.path.includes('/functions/')).length,0);}};
}
let passed=0;
async function test(name,fn,options){const f=await fixture(options);try{await fn(f);await tick();console.log('PASS '+name);passed++;}finally{f.close();}}
(async()=>{
  const authGate=deferred(),statusGate=deferred();
  await test('saved-account startup stays neutral until authentication and access resolve',async f=>{
    assert.equal(f.w.eval('cloudStartupPending'),true);assert.equal(f.$('llaAccountPane').classList.contains('lla-hidden'),true);assert.match(f.$('llaCheckingTitle').textContent,/Opening/);assert.equal(f.calls.filter(call=>call.path.endsWith('little_labels_access_status')).length,0);
    authGate.resolve();await tick();assert.equal(f.w.eval('cloudStartupPending'),false);assert.match(f.$('llaCheckingTitle').textContent,/Checking/);assert.equal(f.$('llaActivatePane').classList.contains('lla-hidden'),true);assert.equal(f.$('llaAccountPane').classList.contains('lla-hidden'),true);
    statusGate.resolve();await tick();assert.equal(f.w.LittleLabelsAccess.isActive(),true);assert.equal(f.$('llAccessGate').classList.contains('lla-hidden'),true);
  },{authGate,statusGate});
  const anonymousGate=deferred();
  await test('new device gets sign-in instructions only after startup completes',async f=>{
    assert.match(f.$('llaCheckingTitle').textContent,/Opening/);assert.equal(f.$('llaAccountPane').classList.contains('lla-hidden'),true);
    anonymousGate.resolve();await tick();assert.equal(f.$('llaAccountPane').classList.contains('lla-hidden'),false);assert.equal(f.calls.filter(call=>call.path.endsWith('little_labels_access_status')).length,0);
  },{anonymous:true,authGate:anonymousGate});
  await test('activation help is inside the enforced gate and keyboard focus stays there',async f=>{
    const gate=f.$('llAccessGate');assert.equal(gate.classList.contains('lla-hidden'),false);assert.match(gate.querySelector('details').textContent,/Start Here guide/);assert.match(gate.querySelector('details').textContent,/same account/);assert.equal(f.$('llWelcome'),null);
    f.$('homeGalleryBtn').focus();assert.equal(gate.contains(f.w.document.activeElement),true);f.$('llaManageAccount').focus();assert.equal(f.key(f.$('llaManageAccount'),'Tab'),true);assert.equal(f.w.document.activeElement.id,'llaCode');assert.equal(f.key(gate,'Escape'),true);assert.equal(gate.classList.contains('lla-hidden'),false);
  },{active:false,welcome:true});
  await test('welcome and guide are device-neutral, have all four steps, and restore focus',async f=>{
    await tick(550);const welcome=f.$('llWelcome');assert.ok(welcome);assert.equal(welcome.getAttribute('role'),'dialog');assert.equal(f.w.document.activeElement.id,'llwStart');assert.doesNotMatch(f.$('llwPhone').textContent,/my phone/i);assert.deepEqual([...welcome.querySelectorAll('.llw-flow span')].map(x=>x.textContent),['Create','Review','Save','Print']);
    f.$('llwLearn').focus();f.$('llwLearn').click();const help=f.$('llHelp');assert.equal(help.getAttribute('role'),'dialog');assert.equal(f.w.document.activeElement.id,'llhBack');assert.match(help.textContent,/Computer instructions/);assert.match(help.textContent,/Activation and account help/);assert.deepEqual([...help.querySelectorAll('.llh-step strong')].map(x=>x.textContent),['Create','Review','Save','Print']);
    f.$('homeGalleryBtn').focus();assert.equal(f.w.document.activeElement.id,'llhBack');assert.equal(f.key(help,'Escape'),true);assert.equal(help.classList.contains('llh-hidden'),true);assert.equal(f.w.document.activeElement.id,'homeGalleryBtn');assert.ok(!f.$('home').inert);
  },{welcome:true});
  await test('name editor traps focus, closes with Escape, restores trigger repeatedly',async f=>{
    for(let i=0;i<2;i++){
      const trigger=f.openNames(),overlay=f.$('nameLabelsOverlay');assert.equal(overlay.getAttribute('role'),'dialog');assert.equal(overlay.getAttribute('aria-modal'),'true');assert.equal(f.w.document.activeElement.id,'nlNames');
      f.$('nlNext').focus();assert.equal(f.key(f.$('nlNext'),'Tab'),true);assert.equal(f.w.document.activeElement.id,'nlBack');assert.equal(f.key(f.$('nlBack'),'Tab',true),true);assert.equal(f.w.document.activeElement.id,'nlNext');
      f.$('homeGalleryBtn').focus();assert.equal(f.w.document.activeElement.id,'nlNames');assert.equal(f.key(overlay,'Escape'),true);assert.equal(overlay.classList.contains('hide'),true);assert.equal(f.w.document.activeElement,trigger);assert.ok(!f.$('home').inert);
    }
  });
  await test('missing photos require a decision; Add Photos preserves draft without saves',async f=>{
    f.w.eval('cloudReady=false;');f.openNames();f.input('nlNames','Synthetic Ada\nSynthetic Bea');f.w.document.querySelector('[data-style="photo"]').click();f.$('nlNext').click();f.$('nlNext').click();await tick();
    assert.equal(f.w.eval('queue.length'),0);assert.equal(f.w.eval('library.length'),0);assert.equal(f.$('nlMissingPhotos').hidden,false);assert.equal(f.w.document.activeElement.id,'nlAddMissingPhotos');assert.match(f.$('nlMissingMessage').textContent,/2 of 2/);assert.match(f.$('nlMissingMessage').textContent,/whole batch/);
    f.$('nlAddMissingPhotos').click();assert.equal(f.$('nlMissingPhotos').hidden,true);assert.match(f.w.document.activeElement.getAttribute('aria-label'),/Add photo for Synthetic Ada/);assert.equal(f.w.NLStyle(),'photo');assert.equal(f.w.eval('queue.length'),0);
    f.$('nlNext').click();assert.equal(f.key(f.$('nlMissingPhotos'),'Escape'),true);assert.equal(f.$('nlMissingPhotos').hidden,true);assert.equal(f.$('nameLabelsOverlay').classList.contains('hide'),false);assert.equal(f.w.document.activeElement.id,'nlNext');
  });
  await test('Continue Name Only explicitly saves whole batch once, preserving photo draft',async f=>{
    f.w.eval('cloudReady=false;');f.openNames();f.input('nlNames','Synthetic Ada\nSynthetic Bea');f.w.document.querySelector('[data-style="photo"]').click();f.addPhoto(1);f.$('nlNext').click();assert.match(f.$('nlMissingMessage').textContent,/1 of 2/);
    f.$('nlContinueNameOnly').click();f.$('nlContinueNameOnly').click();await tick();assert.equal(f.w.NLStyle(),'name');assert.equal(f.w.eval('queue.length'),2);assert.equal(f.w.eval('library.length'),2);assert.ok(f.w.eval('queue.every(item=>!item.photo)'));assert.equal(f.w.NLStudents()[1].photo,photo);assert.equal(f.$('nameLabelsOverlay').classList.contains('hide'),true);assert.equal(f.w.document.activeElement.id,'queueBack');assert.ok(!f.$('queue').inert);
  });
  await test('preview navigation covers every student and each photo action is named',async f=>{
    f.openNames();f.input('nlNames','Synthetic Ada\nSynthetic Bea\nSynthetic Cy');await tick();assert.match(f.$('nlPreview').querySelector('img').alt,/Synthetic Ada/);assert.equal(f.$('nlPrevStudent').disabled,true);f.$('nlNextStudent').click();await tick();assert.match(f.$('nlPreview').querySelector('img').alt,/Synthetic Bea/);assert.match(f.$('nlPreviewPosition').textContent,/2 of 3/);
    f.input('nlNames','Synthetic Bea\nSynthetic Cy');await tick();assert.match(f.$('nlPreviewPosition').textContent,/1 of 2.*Synthetic Bea/);f.w.document.querySelector('[data-style="photo"]').click();f.addPhoto(1);assert.match(f.$('nlPreviewPosition').textContent,/2 of 2.*Synthetic Cy/);assert.equal(f.$('nlPreview').querySelector('img').alt,'Photo of Synthetic Cy');assert.equal(f.$('nlNextStudent').disabled,true);assert.equal(f.$('nlPhotos').querySelectorAll('button')[1].getAttribute('aria-label'),'Change photo for Synthetic Cy');f.$('nlPrevStudent').click();assert.match(f.$('nlPreviewPosition').textContent,/Synthetic Bea/);
  });
  await test('complete photo batch saves photos and copies without missing-photo prompt',async f=>{
    f.w.eval('cloudReady=false;');f.openNames();f.input('nlNames','Synthetic Ada\nSynthetic Bea');f.w.document.querySelector('[data-style="photo"]').click();f.addPhoto(0);f.addPhoto(1);f.$('nlCopies').value='2';f.$('nlCopies').dispatchEvent(new f.w.Event('change'));f.$('nlNext').click();await tick();assert.equal(f.$('nlMissingPhotos').hidden,true);assert.equal(f.w.eval('queue.length'),4);assert.ok(f.w.eval('queue.every(item=>item.photo.startsWith("data:"))'));assert.equal(f.w.eval('library.length'),2);
  });
  await test('entitlement refresh suspends open dialog safely and restores it only when access is verified',async f=>{
    f.openNames();f.input('nlNames','Synthetic Ada');const gate=deferred();f.setStatusHook(()=>gate.promise);const checking=f.w.LittleLabelsAccess.check();await tick();assert.equal(f.$('llAccessGate').classList.contains('lla-hidden'),false);assert.equal(f.$('nameLabelsOverlay').inert,true);f.$('nlNames').focus();assert.equal(f.$('llAccessGate').contains(f.w.document.activeElement),true);
    gate.resolve();await checking;await tick();assert.equal(f.$('llAccessGate').classList.contains('lla-hidden'),true);assert.equal(f.w.document.activeElement.id,'nlNames');assert.ok(!f.$('nameLabelsOverlay').inert);assert.ok(f.$('home').closest('[aria-hidden="true"]'));f.$('nlBack').click();assert.ok(!f.$('home').inert);assert.equal(f.w.document.activeElement.id,'homeNameBtn');
  });
  await test('account navigation dismisses nested photo decision without stale focus or data',async f=>{
    f.openNames();f.input('nlNames','Synthetic Ada');f.w.document.querySelector('[data-style="photo"]').click();f.$('nlNext').click();f.w.show('account');await tick();assert.equal(f.$('nameLabelsOverlay').classList.contains('hide'),true);assert.ok(!f.$('account').inert);assert.ok(!f.$('nameLabelsOverlay').contains(f.w.document.activeElement));
    f.w.eval(`saveCloudSession(${JSON.stringify(session(false,'synthetic-B'))});updateAccountUI();`);await tick();assert.equal(f.$('nlNames').value,'');assert.equal(f.$('nlMissingPhotos').hidden,true);assert.ok(!f.$('account').inert);
  });
  await test('nested Settings help restores its exact trigger without unlocking the background',async f=>{
    f.$('littleLabelsSettingsBtn').focus();f.$('littleLabelsSettingsBtn').click();await tick();f.$('llHelpBtn').focus();f.$('llHelpBtn').click();assert.equal(f.w.document.activeElement.id,'llhBack');assert.equal(f.$('llSettings').inert,true);f.$('llhBack').click();assert.equal(f.w.document.activeElement.id,'llHelpBtn');assert.ok(!f.$('llSettings').inert);assert.ok(f.$('home').closest('[aria-hidden="true"]'));f.$('llsBack').click();assert.equal(f.w.document.activeElement.id,'littleLabelsSettingsBtn');assert.equal(f.$('home').closest('[aria-hidden="true"]'),null);
  });
  await test('existing feature modal can nest over typed editor with no focus fight or inert leak',async f=>{
    f.$('homeTypeBtn').focus();f.$('homeTypeBtn').click();f.input('tlEnglish','Synthetic blocks');const unlock=f.$('tlTranslationTools').querySelector('.ll-unlock-features');unlock.focus();unlock.click();await tick();const info=f.$('llFeatureInfo');assert.equal(info.hidden,false);assert.ok(info.contains(f.w.document.activeElement));f.$('tlEnglish').focus();assert.ok(info.contains(f.w.document.activeElement));assert.equal(f.key(info,'Escape'),true);await tick();assert.equal(info.hidden,true);assert.equal(f.w.document.activeElement,unlock);assert.ok(!f.$('typeLabelOverlay').inert);assert.ok(f.$('home').closest('[aria-hidden="true"]'));f.$('tlBack').click();assert.equal(f.$('home').closest('[aria-hidden="true"]'),null);
  });
  await test('access refresh closes feature information before taking focus ownership',async f=>{
    f.$('homeTypeBtn').focus();f.$('homeTypeBtn').click();f.input('tlEnglish','Synthetic kept wording');const unlock=f.$('tlTranslationTools').querySelector('.ll-unlock-features');unlock.focus();unlock.click();const info=f.$('llFeatureInfo'),gate=f.$('llAccessGate'),hold=deferred();f.setStatusHook(()=>hold.promise);
    const checking=f.w.LittleLabelsAccess.check();await tick();assert.deepEqual(f.errors,[]);assert.equal(info.hidden,true);assert.equal(gate.classList.contains('lla-hidden'),false);assert.ok(!gate.inert);assert.equal(gate.getAttribute('aria-hidden'),null);assert.ok(gate.contains(f.w.document.activeElement));f.$('tlEnglish').focus();assert.ok(gate.contains(f.w.document.activeElement));
    f.w.LittleLabelsFeatureInfo.open();assert.equal(info.hidden,true);assert.ok(gate.contains(f.w.document.activeElement));hold.resolve();await checking;await tick();assert.equal(gate.classList.contains('lla-hidden'),true);assert.ok(!f.$('typeLabelOverlay').inert);assert.equal(f.$('tlEnglish').value,'Synthetic kept wording');assert.ok(f.$('typeLabelOverlay').contains(f.w.document.activeElement));assert.ok(f.$('home').closest('[aria-hidden="true"]'));f.$('tlBack').click();assert.equal(f.$('home').closest('[aria-hidden="true"]'),null);
  });
  for(const eventName of ['focus','visibilitychange']) await test(eventName+' refresh gives the gate sole focus ownership over open feature info',async f=>{
    f.$('homeTypeBtn').click();f.input('tlEnglish','Synthetic interrupted draft');f.$('tlTranslationTools').querySelector('.ll-unlock-features').click();const hold=deferred();f.setStatusHook(()=>hold.promise);
    (eventName==='focus'?f.w:f.w.document).dispatchEvent(new f.w.Event(eventName));await tick();assert.deepEqual(f.errors,[]);assert.equal(f.$('llFeatureInfo').hidden,true);assert.ok(!f.$('llAccessGate').inert);assert.equal(f.$('llAccessGate').classList.contains('lla-hidden'),false);assert.ok(f.$('llAccessGate').contains(f.w.document.activeElement));
    hold.resolve();await tick();assert.equal(f.$('llAccessGate').classList.contains('lla-hidden'),true);assert.ok(!f.$('typeLabelOverlay').inert);assert.equal(f.$('tlEnglish').value,'Synthetic interrupted draft');assert.ok(f.$('typeLabelOverlay').contains(f.w.document.activeElement));f.$('tlBack').click();assert.equal(f.$('home').closest('[aria-hidden="true"]'),null);
  });
  console.log(`PASS ${passed} names/onboarding/accessibility scenarios with all external I/O mocked`);
})().catch(error=>{console.error(error);process.exitCode=1;});
