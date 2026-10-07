// Native CI only when local browser launch is denied. Do not weaken its sandbox.
// Shipped renderer chain, real Canvas/TextMetrics and pixel masks; synthetic
// photos/captions, no account client, provider, payment or other network calls.
const {chromium,webkit}=require('@playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {boxes,samples,shorts,fallbackSamples,compact}=require('./caption-fixtures.cjs');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const html=read('index.html'),meta=vm.runInNewContext('('+read('label-settings.js').match(/const meta=(\{.*?\});const langs=/s)[1]+')');
const engine=process.env.BROWSER_ENGINE||'chromium',out=path.join(root,'test-results/captions',engine);fs.mkdirSync(out,{recursive:true});
function saveCapture(prefix,capture){
 if(!capture)return null;
 const {raster,maskRasters,...details}=capture;
 const png=(name,data)=>{if(data){fs.writeFileSync(path.join(out,name),Buffer.from(data.split(',')[1],'base64'));return name;}return null;};
 return {...details,rasterFile:png(prefix+'.png',raster),maskFiles:(maskRasters||[]).map((data,i)=>png(prefix+`-mask-${i}.png`,data))};
}
(async()=>{
 const browser=await({chromium,webkit})[engine].launch({headless:true}),failures=[];
 try{for(const width of [390,768,1280]){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'}),page=await context.newPage(),errors=[],network=[],results=[],caseFailures=[],parityResults=[];
  const fail=(kind,id,sample,error,captures={})=>{
   const prefix=`${width}-${id}-${sample}-${kind}-FAILURE`,record={engine,width,kind,format:id,sample,error:error.stack||String(error),expectedBox:boxes[id],captures:{}};
   for(const [name,capture] of Object.entries(captures))record.captures[name]=saveCapture(prefix+'-'+name,capture);
   const file=prefix+'.json';fs.writeFileSync(path.join(out,file),JSON.stringify(record,null,2));
   const summary={kind,format:id,sample,error:record.error,artifact:file};caseFailures.push(summary);failures.push({width,...summary});return summary;
  };
  page.on('pageerror',error=>errors.push(error.message));await context.route('**/*',route=>{network.push(route.request().url());return route.abort();});
  try{
   await page.setContent('<!doctype html><html><body></body></html>');
   await page.addScriptTag({content:`var labelDimensions,buildPrintLayout,sizesForBatchSet;window.LittleLabelSettings={meta:${JSON.stringify(meta)},get:()=>({sizes:{},sets:[]})};`});
   await page.addScriptTag({content:html.slice(html.indexOf('function escapePrintHtml('),html.indexOf('async function markCurrentSheetPrinted('))});
   for(const file of ['sellable-label-wiring.js','sellable-label-render.js','name-only-render.js','true-size-rotation-fix.js','tests/fixtures/caption-print-baseline.js'])await page.addScriptTag({content:read(file)});
   await page.evaluate(()=>{
    const photo=document.createElement('canvas');photo.width=300;photo.height=200;const p=photo.getContext('2d');p.fillStyle='#fff8eb';p.fillRect(0,0,300,200);p.fillStyle='#629ac0';p.fillRect(50,40,140,120);window.captionPhoto=photo.toDataURL('image/png');
    window.captureCaption=async(item,baseline=false)=>{
     const native=CanvasRenderingContext2D.prototype.fillText,records=[],masks=new Map();
     const textKeys=['font','textAlign','textBaseline','direction','fontKerning','fontStretch','fontVariantCaps','letterSpacing','wordSpacing','textRendering'];
     const metrics=m=>Object.fromEntries(['width','actualBoundingBoxLeft','actualBoundingBoxRight','actualBoundingBoxAscent','actualBoundingBoxDescent','fontBoundingBoxAscent','fontBoundingBoxDescent','emHeightAscent','emHeightDescent','hangingBaseline','alphabeticBaseline','ideographicBaseline'].filter(key=>Number.isFinite(m[key])).map(key=>[key,m[key]]));
     const state=ctx=>{const t=ctx.getTransform();return {properties:Object.fromEntries([...textKeys,'fillStyle','globalAlpha','globalCompositeOperation','shadowColor','shadowBlur','shadowOffsetX','shadowOffsetY','filter'].filter(key=>key in ctx).map(key=>[key,ctx[key]])),transform:{a:t.a,b:t.b,c:t.c,d:t.d,e:t.e,f:t.f},canvas:{width:ctx.canvas.width,height:ctx.canvas.height,dir:ctx.canvas.dir,lang:ctx.canvas.lang}};};
     CanvasRenderingContext2D.prototype.fillText=function(text,x,y,...other){
      const value=String(text),m=this.measureText(value),record={text:value,x,y,font:this.font,size:Number(this.font.match(/([\d.]+)px/)?.[1]),weight:this.font.startsWith('800')?800:700,direction:this.direction,maxWidth:other[0],left:x-m.actualBoundingBoxLeft,right:x+m.actualBoundingBoxRight,top:y-m.actualBoundingBoxAscent,bottom:y+m.actualBoundingBoxDescent,sourceState:state(this),sourceMetricsBefore:metrics(m)};records.push(record);
      let mask=masks.get(this.canvas);if(!mask){mask=document.createElement('canvas');mask.width=this.canvas.width;mask.height=this.canvas.height;masks.set(this.canvas,mask);}
      // Keep the existing mask-copy behavior unchanged while diagnosing it.
      // Both states/metrics are retained so a font-property setter, fallback font,
      // transform or drawing-state discrepancy is visible rather than assumed away.
      const ink=mask.getContext('2d');for(const key of textKeys)if(key in ink)ink[key]=this[key];
      ink.fillStyle='#000';record.maskState=state(ink);record.maskMetricsBefore=metrics(ink.measureText(value));
      native.call(ink,text,x,y,...other);const returned=native.call(this,text,x,y,...other);
      record.maskMetricsAfter=metrics(ink.measureText(value));record.sourceMetricsAfter=metrics(this.measureText(value));return returned;
     };
     let raster=null,captureError=null;
     try{
      raster=await(baseline?LittleLabelsCaptionBaseline:rasterizeFinishedLabel)({...item,photo:captionPhoto});
     }catch(error){captureError=error.stack||String(error);}finally{CanvasRenderingContext2D.prototype.fillText=native;}
      const pixelBounds=[],maskRasters=[];for(const mask of masks.values()){
       const data=mask.getContext('2d').getImageData(0,0,mask.width,mask.height).data;let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity,count=0;
       for(let y=0;y<mask.height;y++)for(let x=0;x<mask.width;x++)if(data[(y*mask.width+x)*4+3]>8){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);count++;}
       if(count)pixelBounds.push({left,right,top,bottom,count,width:mask.width,height:mask.height});
       maskRasters.push(mask.toDataURL('image/png'));
      }
      return {raster,records,pixelBounds,maskRasters,captureError};
    };
   });
   for(const [id,m] of Object.entries(meta))for(const sample of [...samples,...fallbackSamples]){
    let result;
    try{
    result=await page.evaluate(async item=>{
     const originalSegmenter=Intl.Segmenter;
     if(item.noSegmenter)Intl.Segmenter=undefined;
     try{return await captureCaption(item);}finally{Intl.Segmenter=originalSegmenter;}
    },{...sample,size:m.name});
    const box=boxes[id],label=`${engine}/${width}/${id}/${sample.name}`;
    assert.equal(result.captureError,null,label+' renderer completed');
    for(const [weight,text] of [[800,sample.english],[700,sample.spanish]])assert.equal(compact(result.records.filter(r=>r.weight===weight).map(r=>r.text).join('')),compact(text),label+' retains every source character');
    if(sample.noSegmenter)for(const [weight,text] of [[800,sample.english],[700,sample.spanish]]){
     const drawn=result.records.filter(r=>r.weight===weight&&r.text).map(r=>r.text);
     assert.equal(drawn.join(' '),text,label+' whole tokens and Unicode clusters survive actual line boundaries');
     for(const token of text.split(' '))assert.ok(drawn.some(line=>line.split(' ').includes(token)),label+' token stays in one real fillText call');
    }
    const lines=result.records.filter(r=>r.text);
    for(const line of lines){
     assert.ok([line.left,line.right,line.top,line.bottom,line.size].every(Number.isFinite),label+' real metrics are finite');
     assert.ok(line.left>=box.x-.01&&line.right<=box.x+box.w+.01&&line.top>=box.y-.01&&line.bottom<=box.y+box.h+.01,label+' actual glyph bounds stay inside accepted text box: '+JSON.stringify(line));
     assert.equal(line.maxWidth,undefined,label+' does not horizontally squeeze');assert.ok(!/^\p{Mark}/u.test(line.text),label+' retains grapheme boundaries');
    }
    for(let i=1;i<lines.length;i++)assert.ok(lines[i].top>=lines[i-1].bottom-.01,label+' caption lines do not overlap');
    for(const b of result.pixelBounds){assert.ok(b.count>0);assert.equal(b.width,Math.round(m.w*300));assert.equal(b.height,Math.round(m.h*300));assert.ok(b.left>=Math.floor(box.x)-1&&b.right<=Math.ceil(box.x+box.w)+1&&b.top>=Math.floor(box.y)-1&&b.bottom<=Math.ceil(box.y+box.h)+1,label+' real caption pixels stay inside accepted text box');}
    const fontPoints=Math.min(...lines.map(r=>r.size))*72/300;
    if(width===390&&['business','cp','3x5-portrait'].includes(id)&&['confirmed-truncation','bilingual-long','arabic','cjk','combining-accents','unbroken-tokens'].includes(sample.name))fs.writeFileSync(path.join(out,`${width}-${id}-${sample.name}.png`),Buffer.from(result.raster.split(',')[1],'base64'));
    if(width===390&&id==='business'&&sample.noSegmenter)fs.writeFileSync(path.join(out,`${width}-${id}-${sample.name}.png`),Buffer.from(result.raster.split(',')[1],'base64'));
    results.push({format:id,sample:sample.name,passed:true,noSegmenter:!!sample.noSegmenter,fontPoints,records:result.records,pixelBounds:result.pixelBounds});
    }catch(error){
     const failure=fail('caption',id,sample.name,error,{actual:result});
     results.push({format:id,sample:sample.name,passed:false,noSegmenter:!!sample.noSegmenter,artifact:failure.artifact,records:result?.records,pixelBounds:result?.pixelBounds});
    }
   }
   for(const [id,m] of Object.entries(meta))for(const sample of shorts){
    let result;
    try{
    result=await page.evaluate(async item=>({before:await captureCaption(item,true),after:await captureCaption(item)}),{...sample,size:m.name});
    assert.equal(result.before.captureError,null);assert.equal(result.after.captureError,null);
    assert.equal(result.after.raster,result.before.raster,`${engine}/${width}/${id}/${sample.name}: every PNG pixel matches the frozen short-caption baseline`);
    parityResults.push({format:id,sample:sample.name,passed:true});
    }catch(error){const failure=fail('parity',id,sample.name,error,result);parityResults.push({format:id,sample:sample.name,passed:false,artifact:failure.artifact});}
   }
   assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
  }catch(error){fail('setup-or-browser','matrix','environment',error);}
  finally{
   const fonts=results.map(r=>r.fontPoints).filter(Number.isFinite),minimumFontPoints=fonts.length?Math.min(...fonts):null;
   const passed=!caseFailures.length&&!errors.length&&!network.length;
   fs.writeFileSync(path.join(out,`${width}-results.json`),JSON.stringify({engine,width,passed,cases:results.length,shortPixelParityCases:parityResults.length,minimumFontPoints,errors,network,failures:caseFailures,results,parityResults},null,2));
   if(!passed)fs.writeFileSync(path.join(out,`${width}-failure.json`),JSON.stringify({engine,width,failures:caseFailures,errors,network,results,parityResults},null,2));
   console.log(`${passed?'PASS':'FAIL'} ${engine} ${width}px: ${results.length} caption cases; ${parityResults.filter(r=>r.passed).length}/${parityResults.length} exact short-caption PNG matches; ${caseFailures.length} recorded failures; minimum passing stress font ${minimumFontPoints?.toFixed(2)??'unknown'} pt`);
   await context.close();
  }
 }}finally{await browser.close();}
 if(failures.length)throw Error(`${failures.length} caption/browser assertions failed. All cases and widths were attempted; see test-results/captions/${engine}/*-FAILURE.json and *-results.json.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
