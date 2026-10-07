// Deterministic renderer checks; all canvases/images are synthetic and no browser
// or network is started. caption-fit-browser.cjs verifies real canvas ink in CI.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {boxes,samples,shorts,fallbackSamples,compact}=require('./caption-fixtures.cjs');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const html=read('index.html'),meta=vm.runInNewContext('('+read('label-settings.js').match(/const meta=(\{.*?\});const langs=/s)[1]+')');
function harness({segmenter=true}={}){
 const rasters=new Map(),canvases=[];
 const c={console,Math,Intl:segmenter?Intl:{Segmenter:undefined},document:{readyState:'loading',addEventListener(){},createElement(tag){assert.equal(tag,'canvas');return canvas();}},
  Image:class{constructor(){this.naturalWidth=300;this.naturalHeight=200;}set src(value){this.onload();}},
  LittleLabelSettings:{meta,get:()=>({sizes:Object.fromEntries(Object.keys(meta).map(id=>[id,true])),sets:[]})},labelDimensions:null,buildPrintLayout:null,sizesForBatchSet:null};
 function canvas(){
  const cv={width:0,height:0,texts:[],draws:[]},stack=[];
  const ctx={font:'10px Arial',textAlign:'start',textBaseline:'alphabetic',fillStyle:'#000',direction:'ltr',
   save(){stack.push({font:this.font,textAlign:this.textAlign,textBaseline:this.textBaseline,fillStyle:this.fillStyle,direction:this.direction});},restore(){Object.assign(this,stack.pop());},
   beginPath(){},closePath(){},moveTo(){},lineTo(){},arcTo(){},ellipse(){},fill(){},fillRect(){},stroke(){},setLineDash(){},createLinearGradient(){return {addColorStop(){}};},
   drawImage(image,...args){cv.draws.push(args);},
   measureText(text){
    const size=Number(this.font.match(/([\d.]+)px/)[1]),width=Array.from(text).reduce((sum,ch)=>sum+(/\p{Mark}|\u200d|\uFE0F/u.test(ch)?0:/\s/u.test(ch)?.28:.57),0)*size;
    const offset=this.textAlign==='center'?width/2:0,asc=size*.83,desc=size*.21,vertical=this.textBaseline==='middle'?(asc-desc)/2:0;
    return {width,actualBoundingBoxLeft:offset+size*.025,actualBoundingBoxRight:width-offset+size*.025,actualBoundingBoxAscent:asc-vertical,actualBoundingBoxDescent:desc+vertical};
   },
   fillText(text,x,y,maxWidth){const m=this.measureText(text);cv.texts.push({text:String(text),font:this.font,weight:this.font.startsWith('800')?800:700,size:Number(this.font.match(/([\d.]+)px/)[1]),color:this.fillStyle,x,y,maxWidth,direction:this.direction,left:x-m.actualBoundingBoxLeft,right:x+m.actualBoundingBoxRight,top:y-m.actualBoundingBoxAscent,bottom:y+m.actualBoundingBoxDescent});}
  };
  cv.getContext=()=>ctx;cv.toDataURL=()=>{const id='data:synthetic/'+canvases.indexOf(cv);rasters.set(id,cv);return id;};canvases.push(cv);return cv;
 }
 c.window=c;vm.createContext(c);
 vm.runInContext(html.slice(html.indexOf('function escapePrintHtml('),html.indexOf('async function markCurrentSheetPrinted(')),c);
 vm.runInContext(read('sellable-label-wiring.js'),c);vm.runInContext(read('sellable-label-render.js'),c);
 vm.runInContext(read('tests/fixtures/caption-print-baseline.js'),c);
 return {c,rasters};
}
(async()=>{
 const h=harness();let count=0,minPoints=Infinity;
 for(const [id,m] of Object.entries(meta))for(const sample of samples){
  const item={...sample,photo:'data:synthetic-photo',size:m.name},before=JSON.stringify(item),src=await h.c.rasterizeFinishedLabel(item),cv=h.rasters.get(src),box=boxes[id];
  assert.equal(cv.width,Math.round(m.w*300));assert.equal(cv.height,Math.round(m.h*300));assert.equal(JSON.stringify(item),before);
  for(const [weight,text] of [[800,sample.english],[700,sample.spanish]])assert.equal(compact(cv.texts.filter(t=>t.weight===weight).map(t=>t.text).join('')),compact(text),`${id}/${sample.name}: every character retained`);
  for(const t of cv.texts.filter(t=>t.text)){
   assert.ok(t.left>=box.x-1e-6&&t.right<=box.x+box.w+1e-6&&t.top>=box.y-1e-6&&t.bottom<=box.y+box.h+1e-6,`${id}/${sample.name} inside accepted text box: ${JSON.stringify(t)}`);
   assert.equal(t.maxWidth,undefined,'Never squeeze text with fillText(maxWidth)');assert.ok(!/^\p{Mark}/u.test(t.text),'No separated combining mark');minPoints=Math.min(minPoints,t.size*72/300);
  }
  const lines=cv.texts.filter(t=>t.text);for(let i=1;i<lines.length;i++)assert.ok(lines[i].top>=lines[i-1].bottom-1e-6,`${id}/${sample.name}: caption lines do not overlap`);
  count++;
 }
 for(const [id,m] of Object.entries(meta))for(const sample of shorts){
  const item={...sample,photo:'data:synthetic-photo',size:m.name},prior=h.rasters.get(await h.c.LittleLabelsCaptionBaseline(item)),current=h.rasters.get(await h.c.rasterizeFinishedLabel(item));
  assert.deepEqual(current.texts,prior.texts,`${id}/${sample.name}: short-caption draw parity`);assert.deepEqual(current.draws,prior.draws,`${id}: photo geometry unchanged`);
 }
 const fallback=harness({segmenter:false});let fallbackCount=0;
 for(const [id,m] of Object.entries(meta))for(const sample of fallbackSamples){
  const item={...sample,photo:'data:synthetic-photo',size:m.name},cv=fallback.rasters.get(await fallback.c.rasterizeFinishedLabel(item)),box=boxes[id];
  for(const [weight,text] of [[800,sample.english],[700,sample.spanish]]){
   const lines=cv.texts.filter(t=>t.weight===weight&&t.text).map(t=>t.text);
   assert.equal(lines.join(' '),text,`${id}/${sample.name}: no line boundary may divide a whitespace token or Unicode cluster`);
   for(const token of text.split(' '))assert.ok(lines.some(line=>line.split(' ').includes(token)),`${id}/${sample.name}: whole token reaches one fillText call`);
  }
  for(const t of cv.texts.filter(t=>t.text))assert.ok(t.left>=box.x-1e-6&&t.right<=box.x+box.w+1e-6&&t.top>=box.y-1e-6&&t.bottom<=box.y+box.h+1e-6,`${id}/${sample.name}: whole tokens still fit their original box`);
  fallbackCount++;
 }
 console.log(`PASS ${fallbackCount} disabled-Segmenter flag/skin-tone/Hangul/ZWJ/accent cases preserve complete tokens at actual draw-call line boundaries`);
 console.log(`PASS ${count} synthetic complete-caption/format cases, 27 short-caption draw-parity cases; minimum stress-fixture font ${minPoints.toFixed(2)} pt (synthetic metrics)`);
})().catch(error=>{console.error(error);process.exitCode=1;});
