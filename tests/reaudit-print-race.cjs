// Exercise the shipped render/queue/navigation/account handlers with synthetic
// labels and deferred raster results. No browser launch, real account or network.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {fixture,deferred,tick,photo}=require('./audit-fixture.cjs');
const results=[];
const raster=id=>photo+'#'+encodeURIComponent(id);
const rows=(count,prefix='copy')=>Array.from({length:count},(_,i)=>({id:`synthetic-${prefix}-${i}`,english:`Synthetic ${prefix} ${i+1}`,spanish:'Manual wording',photo,size:'Business Card'}));
function seed(f,items=rows(1)){
  f.w.__printTestItems=items;
  f.w.eval('queue=__printTestItems;show("queue");refreshQueue();');
  return JSON.stringify(items);
}
function holdRasters(f){
  const calls=[];
  f.w.rasterizeFinishedLabel=item=>{const pending=deferred();calls.push({...pending,item:JSON.parse(JSON.stringify(item))});return pending.promise;};
  return calls;
}
const boxes=f=>[...f.$('printRoot').querySelectorAll('.raster-print-label')];
function output(f){return [f.$('sheetPreviewPages').innerHTML,f.$('printRoot').innerHTML,f.$('printSheetSummary').textContent];}
function assertEmpty(f){
  assert.equal(f.$('printRoot').children.length,0);
  assert.equal(f.$('sheetPreviewPages').children.length,0);
  assert.equal(f.$('printSheetSummary').textContent,'');
  assert.equal(f.$('printNowBtn').disabled,true);
}
function assertReady(f,{count=1,cuts=true,pages=1}={}){
  assert.equal(f.$('printRoot').querySelectorAll('.print-page').length,pages);
  assert.equal(f.$('sheetPreviewPages').querySelectorAll('.sheet-preview').length,pages);
  assert.equal(boxes(f).length,count);
  for(const item of boxes(f))assert.equal(item.classList.contains('cut-lines'),cuts);
  assert.equal(f.$('printNowBtn').disabled,false);
  assert.equal(f.$('markSheetPrintedBtn').disabled,false);
  assert.equal(f.$('printSheetSummary').textContent,`${count} label${count===1?'':'s'} arranged on ${pages} letter-size sheet${pages===1?'':'s'} at true size.`);
}
async function run(name,exercise){
  const f=await fixture(false),callsBefore=f.calls.length;
  try{
    // Optional red-run mode uses the exact prior shipping coordination functions.
    // Normal CI always exercises the current production functions and wrappers.
    if(process.env.PRINT_RACE_BASELINE_INDEX){
      const source=fs.readFileSync(process.env.PRINT_RACE_BASELINE_INDEX,'utf8');
      const start=source.indexOf('async function buildRasterPrintPages('),end=source.indexOf('async function markCurrentSheetPrinted(',start);
      assert.ok(start>=0&&end>start);f.w.eval(source.slice(start,end));
      f.w.document.removeEventListener('little-label-navigation',f.w.cancelPrintRender);
      f.w.document.removeEventListener('little-label-account-changed',f.w.cancelPrintRender);
      for(const id of ['printNowBtn','markSheetPrintedBtn'])f.$(id).disabled=false;
    }
    await exercise(f);
    assert.deepEqual(f.errors,[],'No uncaught DOM errors');
    assert.equal(f.calls.slice(callsBefore).filter(call=>['/rest/v1/labels','/rest/v1/print_queue'].includes(call.path)).length,0,'Rendering never writes or reloads the saved queue');
    results.push({name,passed:true});console.log('PASS '+name);
  }finally{f.close();}
}
(async()=>{
  await run('initial render plus immediate cut toggle publishes only the latest sheets',async f=>{
    const before=seed(f),calls=holdRasters(f),first=f.w.createPrintSheets();
    assert.equal(calls.length,1);assert.equal(f.$('cutLinesToggle').disabled,false);
    f.$('cutLinesToggle').checked=false;
    f.$('cutLinesToggle').dispatchEvent(new f.w.Event('change',{bubbles:true}));
    assert.equal(calls.length,2,'The toggle genuinely overlaps the initial pending render');
    calls[1].resolve(raster('latest'));await tick();assertReady(f,{cuts:false});
    const latest=output(f);calls[0].resolve(raster('old'));await first;
    assert.deepEqual(output(f),latest,'Late initial output cannot append extra pages or old cut lines');
    assertReady(f,{cuts:false});assert.equal(f.w.eval('JSON.stringify(queue)'),before);
  });
  await run('rapid toggles tolerate old success and failure while the latest render is pending',async f=>{
    seed(f);const calls=holdRasters(f),first=f.w.createPrintSheets();
    f.$('cutLinesToggle').checked=false;const second=f.w.renderPrintSheets();
    f.$('cutLinesToggle').checked=true;const third=f.w.renderPrintSheets();
    assert.equal(calls.length,3);
    calls[0].resolve(raster('old'));await first;
    calls[1].reject(Error('Synthetic superseded failure'));await second;
    assert.equal(f.$('printRoot').children.length,0);assert.equal(f.$('printNowBtn').disabled,true);
    assert.match(f.$('sheetPreviewPages').textContent,/Rendering/);
    assert.equal(f.$('sheetPreviewPages').querySelector('button'),null);
    calls[2].resolve(raster('latest'));await third;assertReady(f);
  });
  for(const outcome of ['success','failure'])await run(`close then reopen ignores an old ${outcome}`,async f=>{
    seed(f,rows(1,'old'));const calls=holdRasters(f),first=f.w.createPrintSheets();
    f.$('printPreviewBack').click();assertEmpty(f);
    seed(f,rows(1,'new'));const second=f.w.createPrintSheets();
    assert.equal(calls.length,2);calls[1].resolve(raster('new'));await second;
    const latest=output(f);
    if(outcome==='success')calls[0].resolve(raster('old'));else calls[0].reject(Error('Synthetic old failure'));
    await first;assert.deepEqual(output(f),latest);assertReady(f);
    assert.match(boxes(f)[0].querySelector('img').src,/#new$/);
  });
  await run('closing without reopening clears completed output and cancels pending pages',async f=>{
    seed(f);f.w.rasterizeFinishedLabel=async item=>raster(item.id);await f.w.createPrintSheets();assertReady(f);
    f.$('printPreviewBack').click();assertEmpty(f);
    seed(f,rows(14));const calls=holdRasters(f),pending=f.w.createPrintSheets();
    f.$('printPreviewBack').click();assertEmpty(f);
    calls[0].resolve(raster('closed'));await pending;
    assertEmpty(f);assert.equal(calls.length,1,'Canceled work stops before rasterizing the remaining labels');
  });
  for(const outcome of ['success','failure'])await run(`account replacement prevents old render ${outcome} from repainting`,async f=>{
    seed(f,rows(1,'account-A'));const calls=holdRasters(f),first=f.w.createPrintSheets();
    await f.switchAccount('synthetic-account-B');assertEmpty(f);
    assert.equal(f.w.eval('printBatchIds.length+printLayoutPages.length'),0);
    seed(f,rows(1,'account-B'));const second=f.w.createPrintSheets();
    calls[1].resolve(raster('account-B'));await second;const latest=output(f);
    if(outcome==='success')calls[0].resolve(raster('account-A'));else calls[0].reject(Error('Synthetic account-A failure'));
    await first;assert.deepEqual(output(f),latest);assertReady(f);
    assert.match(boxes(f)[0].querySelector('img').src,/#account-B$/);
  });
  for(const outcome of ['success','failure'])for(const timing of ['pending','complete'])await run(`retry ${timing}: superseded ${outcome} cannot take over`,async f=>{
    const before=seed(f),calls=holdRasters(f),old=f.w.createPrintSheets(),failed=f.w.renderPrintSheets();
    calls[1].reject(Error('Synthetic current failure'));await failed;
    assert.match(f.$('sheetPreviewPages').textContent,/couldn't prepare.*Ready to Print/);
    assert.equal(f.$('printRoot').children.length,0);assert.equal(f.$('printNowBtn').disabled,true);
    const retry=f.$('sheetPreviewPages').querySelector('button');assert.equal(retry.textContent,'Retry Print Sheets');
    retry.click();assert.equal(calls.length,3);assert.match(f.$('sheetPreviewPages').textContent,/Rendering/);
    if(timing==='complete'){calls[2].resolve(raster('retry'));await tick();assertReady(f);}
    const retryOutput=output(f);
    if(outcome==='success')calls[0].resolve(raster('old'));else calls[0].reject(Error('Synthetic older failure'));
    await old;assert.deepEqual(output(f),retryOutput);
    if(timing==='pending'){
      assert.equal(f.$('printNowBtn').disabled,true);assert.match(f.$('sheetPreviewPages').textContent,/Rendering/);
      calls[2].resolve(raster('retry'));await tick();
    }
    assertReady(f);
    assert.equal(f.w.eval('JSON.stringify(queue)'),before);
  });
  for(const cuts of [true,false])for(const count of [1,14])await run(`normal ${count} copies with cuts ${cuts?'on':'off'} retain exact physical positions and order`,async f=>{
    const before=seed(f,rows(count)),seen=[];f.$('cutLinesToggle').checked=cuts;
    f.w.rasterizeFinishedLabel=async item=>{seen.push(item.id);return raster(item.id);};
    await f.w.createPrintSheets();assertReady(f,{count,cuts,pages:count===14?2:1});
    const layout=JSON.parse(f.w.eval('JSON.stringify(printLayoutPages)'));
    assert.deepEqual(seen,layout.flat().map(item=>item.id));
    [...f.$('printRoot').children].forEach((page,index)=>{
      assert.equal(page.children.length,layout[index].length);
      [...page.children].forEach((box,i)=>{
        const item=layout[index][i];
        assert.deepEqual([box.style.left,box.style.top,box.style.width,box.style.height],[`${item.x}in`,`${item.y}in`,`${item._w}in`,`${item._h}in`]);
        assert.equal(box.querySelector('img').getAttribute('src'),raster(item.id));
      });
    });
    assert.equal(f.w.eval('JSON.stringify(queue)'),before);
  });
  await run('all nine formats preserve raster inputs, rotations, dimensions and batch copies',async f=>{
    const meta=f.w.LittleLabelSettings.meta,items=Object.entries(meta).map(([id,m],i)=>({...rows(1,id)[0],size:m.name+' · '+m.dims.split(' · ')[0]}));
    assert.equal(items.length,9);const before=seed(f,items),seen=[];
    f.w.rasterizeFinishedLabel=async item=>{seen.push(JSON.parse(JSON.stringify(item)));return raster(item.id);};
    await f.w.createPrintSheets();const layout=JSON.parse(f.w.eval('JSON.stringify(printLayoutPages)'));
    assertReady(f,{count:9,pages:layout.length});assert.deepEqual(seen,layout.flat());
    assert.deepEqual(JSON.parse(f.w.eval('JSON.stringify(printBatchIds)')),items.map(item=>item.id));
    assert.equal(f.w.eval('JSON.stringify(queue)'),before);
  });
  if(process.env.PRINT_RACE_EVIDENCE_FILE)fs.writeFileSync(process.env.PRINT_RACE_EVIDENCE_FILE,JSON.stringify({syntheticOnly:true,browserLaunched:false,results},null,2)+'\n');
})().catch(error=>{console.error(error);process.exitCode=1;});
