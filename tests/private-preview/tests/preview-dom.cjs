const fs=require('fs'),path=require('path'),assert=require('assert/strict');const {JSDOM,ResourceLoader,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'../dist');const tick=(ms=20)=>new Promise(r=>setTimeout(r,ms));
async function open(stored){
 const errors=[],outside=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 class Local extends ResourceLoader{fetch(url){const u=new URL(url);if(u.origin!=='https://labels.test'){outside.push(url);return null}if(/\.(js|css)$/.test(u.pathname))return Promise.resolve(fs.readFileSync(path.join(root,u.pathname)));return null}}
 const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'https://labels.test/',pretendToBeVisual:true,runScripts:'dangerously',resources:new Local(),virtualConsole:vc,beforeParse(w){w.Response=Response;w.Headers=Headers;w.Request=Request;w.TextEncoder=TextEncoder;w.scrollTo=()=>{};w.alert=()=>{};w.confirm=()=>false;w.ResizeObserver=class{observe(){}disconnect(){}};w.Image=class{constructor(){this.naturalWidth=160;this.naturalHeight=100}set src(s){queueMicrotask(()=>this.onload?.())}};w.HTMLCanvasElement.prototype.getContext=()=>({fillRect(){},drawImage(){}});w.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/jpeg;base64,c3ludGhldGlj';if(stored!==undefined)w.localStorage.setItem('little-labels-isolated-preview-v1',stored)}});
 const w=dom.window;await new Promise(r=>w.addEventListener('load',r));await tick();return{dom,w,errors,outside,close:()=>w.close()};
}
(async()=>{
 const h=await open();const {w}=h,$=id=>w.document.getElementById(id),input=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new w.Event('input',{bubbles:true}))};
 let saved;
 try{
  assert.equal(w.__previewReady,true);assert.deepEqual(h.errors,[]);
  $('homeTypeBtn').click();input('tlEnglish','Building Blocks');input('tlSecond','Bloques');$('tlNext').click();await tick();assert.equal($('englishInput').value,'Building Blocks');assert.equal($('spanishInput').value,'Bloques');assert.equal($('tlTranslationTools').querySelector('button').disabled,true);
  $('chooseSetBtn').click();$('addToQueue').click();await tick();assert.equal(w.eval('library.length'),1);assert.equal(w.eval('queue.length'),2);assert.match($('queueSaveNotice').textContent,/Saved only in this browser/);
  const before=w.localStorage.getItem(w.LittleLabelsPreview.key);
  w.__oldSet=w.Storage.prototype.setItem;w.Storage.prototype.setItem=function(k,v){if(k===w.LittleLabelsPreview.key)throw Error('Simulated quota');return w.__oldSet.call(this,k,v)};
  const failed=await w.fetch('/__preview/rest/v1/labels',{method:'POST',body:JSON.stringify([{id:'synthetic-fail',english:'not saved'}])});assert.equal(failed.status,507);assert.equal(w.localStorage.getItem(w.LittleLabelsPreview.key),before);assert.match($('previewStorageStatus').textContent,/full or unavailable/);
  w.Storage.prototype.setItem=w.__oldSet;
  const retry=await w.fetch('/__preview/rest/v1/labels',{method:'POST',body:JSON.stringify([{id:'synthetic-retry',english:'retry saved'}])});assert.equal(retry.status,200);
  await w.fetch('/__preview/rest/v1/labels',{method:'POST',body:JSON.stringify([{id:'synthetic-retry',english:'duplicate retry'}])});
  assert.equal(JSON.parse(w.localStorage.getItem(w.LittleLabelsPreview.key)).labels.length,2);
  const patch=await w.fetch('/__preview/rest/v1/print_queue?printed_at=is.null',{method:'PATCH',body:JSON.stringify({printed_at:'synthetic-printed'})});assert.equal(patch.status,200);
  assert.equal((await(await w.fetch('/__preview/rest/v1/print_queue?printed_at=is.null')).json()).length,0);
  await assert.rejects(w.fetch('https://example.invalid/forbidden'),/isolated preview/);await assert.rejects(w.fetch('/__preview/functions/v1/identify-material'),/isolated preview/);
  assert.deepEqual(h.outside,[]);assert.deepEqual(h.errors,[]);
  saved=w.localStorage.getItem(w.LittleLabelsPreview.key);
  console.log('PASS full-page DOM boot, manual label, local save, quota error, retry, deduplication, patch/filter and network guard');
 }finally{h.close()}
 const reload=await open(saved);try{assert.equal(reload.w.eval('library.length'),2);assert.equal(reload.w.eval('queue.length'),0);assert.deepEqual(reload.errors,[]);console.log('PASS local data restored after reload')}finally{reload.close()}
 const bad=await open('{corrupt');try{assert.equal(bad.w.localStorage.getItem(bad.w.LittleLabelsPreview.key),'{corrupt');assert.match(bad.w.document.getElementById('previewStorageStatus').textContent,/not been overwritten/);assert.deepEqual(bad.errors,[]);console.log('PASS corrupt storage is preserved with visible recovery guidance')}finally{bad.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
