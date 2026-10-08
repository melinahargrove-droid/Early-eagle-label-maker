// Seed only the intercepted fixture's in-memory queue. Never load or modify the
// owner's real labels. Export actual native Chromium PDFs, not dialog screenshots.
const fs=require('node:fs'),path=require('node:path');
module.exports=async function exercisePrintCases({page,expect,assert,engine,width,out,photo,db,writes}){
 const original=await page.evaluate(()=>queue),databaseBefore=JSON.stringify([...db.print_queue]),writesBefore=writes.length,results=[];
 const meta=await page.evaluate(()=>LittleLabelSettings.meta);
 const items=(ids,prefix)=>ids.map((id,i)=>({id:`synthetic-${prefix}-${i}`,english:`QA ${prefix} ${i+1}`,spanish:i%2?'Manual wording':'',photo,size:meta[id].name+' · '+meta[id].dims.split(' · ')[0]}));
 async function printCase(name,rows,cuts,expectedPages){
  await page.evaluate(rows=>{queue=rows;show('queue');renderQueue();},rows);
  await page.locator('#mockSheets').click();await expect(page.locator('#printPreview')).toBeVisible();
  // Establish the initial output before a separate user cut-line change. A
  // render-overlap regression is tracked separately from these normal PDFs.
  await page.waitForFunction(count=>document.querySelectorAll('#printRoot .raster-print-label').length===count&&[...document.querySelectorAll('#printRoot img')].every(x=>x.complete&&x.naturalWidth),rows.length);
  await page.locator('#cutLinesToggle').setChecked(cuts);
  await page.waitForFunction(({count,cuts})=>document.querySelectorAll('#printRoot .raster-print-label').length===count&&[...document.querySelectorAll('#printRoot img')].every(x=>x.complete&&x.naturalWidth)&&[...document.querySelectorAll('#printRoot .raster-print-label')].every(x=>x.classList.contains('cut-lines')===cuts),{count:rows.length,cuts});
  const before=await page.evaluate(()=>({prints:__printed,queue:JSON.stringify(queue)}));
  await page.locator('#printNowBtn').click();await page.waitForFunction(n=>__printed===n+1,before.prints);
  const measured=await page.evaluate(()=>({pages:[...document.querySelectorAll('#printRoot .print-page')].map(p=>[...p.querySelectorAll('.raster-print-label')].map(x=>({x:parseFloat(x.style.left),y:parseFloat(x.style.top),w:parseFloat(x.style.width),h:parseFloat(x.style.height),cuts:x.classList.contains('cut-lines'),imageW:x.querySelector('img').naturalWidth,imageH:x.querySelector('img').naturalHeight}))),layout:printLayoutPages.map(p=>p.map(x=>({id:x.id,w:x._w,h:x._h,rotated:!!x._rotated}))),queue:JSON.stringify(queue)}));
  assert.equal(measured.queue,before.queue,'Preparing/printing keeps the seeded queue unchanged');
  assert.equal(measured.pages.flat().length,rows.length);assert.equal(measured.pages.length,measured.layout.length);
  if(expectedPages)assert.equal(measured.pages.length,expectedPages,`${name}: expected sheet count`);
  for(let p=0;p<measured.pages.length;p++)for(let i=0;i<measured.pages[p].length;i++){
   const box=measured.pages[p][i],item=measured.layout[p][i];
   assert.equal(box.cuts,cuts);assert.equal(box.w,item.w);assert.equal(box.h,item.h);
   assert.ok(box.x>=.25-1e-6&&box.y>=.25-1e-6&&box.x+box.w<=8.25+1e-6&&box.y+box.h<=10.75+1e-6,`${name}: quarter-inch sheet margins`);
   assert.equal(box.imageW,Math.round(box.w*300));assert.equal(box.imageH,Math.round(box.h*300));
   for(const other of measured.pages[p].slice(i+1))assert.ok(box.x+box.w<=other.x+1e-6||other.x+other.w<=box.x+1e-6||box.y+box.h<=other.y+1e-6||other.y+other.h<=box.y+1e-6,`${name}: no overlapping placements`);
  }
  let pdf=null;
  if(engine==='chromium'&&width===1280){
   const file=path.join(out,name+'.pdf'),bytes=await page.pdf({path:file,preferCSSPageSize:true,printBackground:true}),raw=bytes.toString('latin1');
   const pages=(raw.match(/\/Type\s*\/Page\b/g)||[]).length,boxes=[...raw.matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)];
   assert.equal(pages,measured.pages.length,`${name}: PDF has no omitted/extra blank pages`);assert.equal(boxes.length,pages);
   for(const box of boxes)assert.deepEqual(box.slice(1).map(Number),[612,792]);
   pdf={file:path.basename(file),bytes:bytes.length,pages,letter:true};
  }
  assert.equal(JSON.stringify([...db.print_queue]),databaseBefore,'No fixture database queue update');assert.equal(writes.length,writesBefore,'No save/delete/print-status request');
  results.push({name,count:rows.length,sheets:measured.pages.length,cuts,placements:measured.pages,pdf});
 }
 await printCase('fourteen-copies',items(Array(14).fill('business'),'copies'),true,2);
 if(width===1280){await printCase('all-nine-formats',items(Object.keys(meta),'formats'),true);await printCase('all-nine-formats-no-cuts',items(Object.keys(meta),'formats'),false);}
 await page.evaluate(rows=>{queue=rows;},original);
 fs.writeFileSync(path.join(out,`${width}-reaudit-print.json`),JSON.stringify({engine,width,passed:true,queuePreserved:true,results},null,2));
 return results;
};
