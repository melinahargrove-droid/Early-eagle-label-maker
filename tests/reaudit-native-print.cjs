// The actual native Print listener plus shipped render/navigation/account handlers.
// Synthetic queues, manually released image decodes/animation frames; no browser.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {fixture,deferred,photo}=require('./audit-fixture.cjs');
const results=[];
const settle=async()=>{for(let i=0;i<16;i++)await Promise.resolve();};
async function setup(){
  const f=await fixture(false),frames=new Map(),prints=[],alerts=[];let nextFrame=0;
  f.w.requestAnimationFrame=callback=>{const id=++nextFrame;frames.set(id,callback);return id;};
  f.w.cancelAnimationFrame=id=>frames.delete(id);
  f.w.print=()=>prints.push({count:f.$('printRoot').querySelectorAll('img').length,cuts:f.$('cutLinesToggle').checked,sources:[...f.$('printRoot').querySelectorAll('img')].map(img=>img.src)});
  f.w.alert=message=>alerts.push(message);
  if(process.env.NATIVE_PRINT_BASELINE_SCRIPT){
    const button=f.$('printNowBtn'),copy=button.cloneNode(true);delete copy.dataset.androidPrintFix;button.replaceWith(copy);
    f.w.eval(fs.readFileSync(process.env.NATIVE_PRINT_BASELINE_SCRIPT,'utf8'));
  }
  function images(decode=()=>Promise.resolve(),complete=true){
    const list=[...f.$('printRoot').querySelectorAll('img')];
    list.forEach(img=>{Object.defineProperty(img,'complete',{value:complete,configurable:true});Object.defineProperty(img,'naturalWidth',{value:900,configurable:true});img.decode=decode;});
    return list;
  }
  async function prepare(prefix='original',count=1){
    f.w.__nativeRows=Array.from({length:count},(_,i)=>({id:`synthetic-${prefix}-${i}`,english:`Synthetic ${prefix} ${i+1}`,spanish:'Manual wording',photo,size:'Business Card'}));
    f.w.eval('queue=__nativeRows;show("queue");refreshQueue();');
    f.w.rasterizeFinishedLabel=async item=>photo+'#'+item.id;
    await f.w.createPrintSheets();images();
    assert.equal(f.$('printNowBtn').disabled,false);
    assert.equal(f.$('printNowBtn').textContent,'Print Labels');
  }
  async function frame(){assert.ok(frames.size,'A print frame is pending');const [id,callback]=frames.entries().next().value;frames.delete(id);callback(0);await settle();}
  async function finishFrames(){for(let i=0;i<3&&frames.size;i++)await frame();}
  function loading(){assert.equal(f.$('printNowBtn').disabled,true);assert.equal(f.$('printRoot').querySelectorAll('img').length,0);}
  function ready(){assert.equal(f.$('printNowBtn').disabled,false);assert.equal(f.$('printNowBtn').textContent,'Print Labels');}
  return {...f,frames,prints,alerts,images,prepare,frame,finishFrames,loading,ready};
}
async function run(name,exercise){
  const f=await setup();
  try{
    await exercise(f);assert.deepEqual(f.errors,[]);
    assert.equal(f.calls.filter(call=>['/rest/v1/labels','/rest/v1/print_queue'].includes(call.path)&&!['GET',undefined].includes(call.options.method)).length,0,'Native printing never changes saved labels or the queue');
    results.push({name,passed:true});console.log('PASS '+name);
  }finally{f.close();}
}
(async()=>{
  await run('held decode cannot print empty sheets or re-enable a replacement render',async f=>{
    await f.prepare();const decode=deferred();f.images(()=>decode.promise);const before=f.w.eval('JSON.stringify(queue)');
    f.$('printNowBtn').click();await settle();assert.equal(f.$('printNowBtn').textContent,'Preparing print…');
    const raster=deferred();f.w.rasterizeFinishedLabel=()=>raster.promise;
    f.$('cutLinesToggle').checked=false;const replacement=f.w.renderPrintSheets();f.loading();
    decode.resolve();await settle();await f.finishFrames();
    assert.equal(f.prints.length,0);f.loading();assert.equal(f.$('printNowBtn').textContent,'Print Labels');
    raster.resolve(photo);await replacement;f.images();f.ready();assert.equal(f.w.eval('JSON.stringify(queue)'),before);
  });
  for(const outcome of ['resolve','reject'])await run(`old decode ${outcome} cannot print completed replacement sheets or disturb a new click`,async f=>{
    await f.prepare();const old=deferred();f.images(()=>old.promise);f.$('printNowBtn').click();await settle();
    f.$('cutLinesToggle').checked=false;await f.w.renderPrintSheets();f.images();f.ready();
    const fresh=deferred();f.images(()=>fresh.promise);f.$('printNowBtn').click();await settle();
    if(outcome==='resolve')old.resolve();else old.reject(Error('Synthetic stale decode failure'));
    await settle();assert.equal(f.prints.length,0);assert.equal(f.$('printNowBtn').disabled,true);assert.equal(f.$('printNowBtn').textContent,'Preparing print…');
    fresh.resolve();await settle();await f.finishFrames();assert.equal(f.prints.length,1);assert.equal(f.prints[0].cuts,false);f.ready();assert.deepEqual(f.alerts,[]);
  });
  for(const action of ['back','reopen','account'])for(const outcome of ['resolve','reject'])await run(`${action} cancels a native click before old decode ${outcome}`,async f=>{
    await f.prepare();const old=deferred();f.images(()=>old.promise);f.$('printNowBtn').click();await settle();
    if(action==='account')await f.switchAccount('synthetic-native-account-B');else f.$('printPreviewBack').click();
    assert.equal(f.$('printRoot').querySelectorAll('img').length,0);assert.equal(f.$('printNowBtn').disabled,true);
    if(action!=='back')await f.prepare('replacement');
    if(outcome==='resolve')old.resolve();else old.reject(Error('Synthetic canceled decode failure'));
    await settle();await f.finishFrames();assert.equal(f.prints.length,0);assert.deepEqual(f.alerts,[]);
    assert.equal(f.$('printNowBtn').textContent,'Print Labels');
    if(action==='back')assert.equal(f.$('printNowBtn').disabled,true);else f.ready();
  });
  for(const boundary of [0,1])for(const action of ['cuts','back','account'])await run(`${action} cancels the native handoff at animation-frame boundary ${boundary+1}`,async f=>{
    await f.prepare();f.$('printNowBtn').click();await settle();assert.equal(f.frames.size,1);
    if(boundary===1)await f.frame();
    let replacement=null,raster=null;
    if(action==='cuts'){
      raster=deferred();f.w.rasterizeFinishedLabel=()=>raster.promise;f.$('cutLinesToggle').checked=false;replacement=f.w.renderPrintSheets();
    }else if(action==='back')f.$('printPreviewBack').click();else await f.switchAccount('synthetic-frame-account-B');
    await settle();await f.finishFrames();assert.equal(f.prints.length,0);assert.equal(f.frames.size,0);assert.equal(f.$('printNowBtn').disabled,true);
    assert.equal(f.$('printNowBtn').textContent,'Print Labels');assert.deepEqual(f.alerts,[]);
    if(replacement){raster.resolve(photo);await replacement;f.images();f.ready();}
  });
  await run('pending image load is canceled without waiting for the detached image',async f=>{
    await f.prepare();const [img]=f.images(()=>Promise.resolve(),false);f.$('printNowBtn').click();await settle();
    f.$('printPreviewBack').click();await settle();assert.equal(f.$('printNowBtn').textContent,'Print Labels');
    img.dispatchEvent(new f.w.Event('load'));await settle();await f.finishFrames();assert.equal(f.prints.length,0);assert.equal(f.$('printNowBtn').disabled,true);
  });
  await run('rejected decode leaves the current print retryable and never opens a blank dialog',async f=>{
    await f.prepare();const before=f.w.eval('JSON.stringify(queue)');f.images(()=>Promise.reject(Error('Synthetic current decode failure')));
    f.$('printNowBtn').click();await settle();assert.equal(f.prints.length,0);assert.equal(f.alerts.length,1);f.ready();
    f.images();f.$('printNowBtn').click();await settle();await f.finishFrames();assert.equal(f.prints.length,1);f.ready();assert.equal(f.w.eval('JSON.stringify(queue)'),before);
  });
  await run('failed image load stays retryable and cannot print a missing image',async f=>{
    await f.prepare();const [img]=f.images(()=>Promise.resolve(),false);f.$('printNowBtn').click();await settle();img.dispatchEvent(new f.w.Event('error'));await settle();
    assert.equal(f.prints.length,0);assert.equal(f.alerts.length,1);f.ready();
    f.images();f.$('printNowBtn').click();await settle();await f.finishFrames();assert.equal(f.prints.length,1);f.ready();
  });
  await run('one failed decode cancels other pending images and allows a fresh multi-page print',async f=>{
    await f.prepare('decode-retry',14);const held=deferred(),images=f.images(()=>held.promise);
    images[0].decode=()=>Promise.reject(Error('Synthetic one-image failure'));
    f.$('printNowBtn').click();await settle();assert.equal(f.prints.length,0);assert.equal(f.alerts.length,1);f.ready();
    f.images();f.$('printNowBtn').click();await settle();await f.finishFrames();assert.equal(f.prints.length,1);assert.equal(f.prints[0].count,14);f.ready();
    held.resolve();await settle();assert.equal(f.prints.length,1);f.ready();
  });
  await run('a failed native dialog leaves the same completed sheets ready for an explicit retry',async f=>{
    await f.prepare();const native=f.w.print;f.w.print=()=>{throw Error('Synthetic dialog failure');};
    f.$('printNowBtn').click();await settle();await f.finishFrames();assert.equal(f.prints.length,0);assert.equal(f.alerts.length,1);f.ready();
    f.w.print=native;f.$('printNowBtn').click();await settle();await f.finishFrames();assert.equal(f.prints.length,1);f.ready();
  });
  await run('rapid cut toggles cancel native preparation while the newest render wins',async f=>{
    await f.prepare();const old=deferred();f.images(()=>old.promise);f.$('printNowBtn').click();await settle();
    const rasters=[];f.w.rasterizeFinishedLabel=()=>{const pending=deferred();rasters.push(pending);return pending.promise;};
    f.$('cutLinesToggle').checked=false;const first=f.w.renderPrintSheets();f.$('cutLinesToggle').checked=true;const second=f.w.renderPrintSheets();
    rasters[1].resolve(photo);await second;f.images();f.ready();old.resolve();rasters[0].resolve(photo);await first;await settle();await f.finishFrames();
    assert.equal(f.prints.length,0);f.ready();f.$('printNowBtn').click();await settle();await f.finishFrames();assert.equal(f.prints.length,1);assert.equal(f.prints[0].cuts,true);
  });
  for(const count of [1,14])await run(`one explicit click prints ${count} copies once after both frames and preserves the queue`,async f=>{
    await f.prepare('normal',count);const before=f.w.eval('JSON.stringify(queue)');
    f.$('printNowBtn').click();f.$('printNowBtn').click();f.$('printNowBtn').dispatchEvent(new f.w.Event('click',{bubbles:true}));await settle();
    assert.equal(f.prints.length,0);await f.frame();assert.equal(f.prints.length,0);await f.frame();
    assert.equal(f.prints.length,1);assert.equal(f.prints[0].count,count);f.ready();assert.equal(f.w.eval('JSON.stringify(queue)'),before);
    f.$('printNowBtn').click();await settle();await f.finishFrames();assert.equal(f.prints.length,2,'A new explicit click remains available');
  });
  if(process.env.NATIVE_PRINT_EVIDENCE_FILE)fs.writeFileSync(process.env.NATIVE_PRINT_EVIDENCE_FILE,JSON.stringify({syntheticOnly:true,browserLaunched:false,results},null,2)+'\n');
})().catch(error=>{console.error(error);process.exitCode=1;});
