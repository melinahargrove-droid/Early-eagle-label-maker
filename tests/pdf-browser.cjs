// Visual QA only: real browser canvas + production PDF routines, synthetic labels.
const {chromium}=require('playwright');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://local').pathname;try{res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(path.join(root,name==='/'?'index.html':name)))}catch{res.statusCode=404;res.end()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.on('listening',r));const browser=await chromium.launch({headless:true});
 try{
 const page=await browser.newPage();await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:')?r.continue():r.abort());
 await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>window.LittleLabelSettings&&window.buildPrintLayout&&window.rasterizeFinishedLabel);
 const source=fs.readFileSync(path.join(root,'pdf-print.js'),'utf8').replace(/ if\(document.readyState==='loading'\)[\s\S]*?\n\}\)\(\);$/, ' window.pdfQA={renderPage,makePdf};\n})();');await page.addScriptTag({content:source});
 const result=await page.evaluate(async()=>{
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="white"/><circle cx="120" cy="120" r="70" fill="#F5B13A" stroke="#17375E" stroke-width="6"/><path d="M120 45 L100 75 H112 V130 H128 V75 H140 Z" fill="#17375E"/><text x="120" y="172" text-anchor="middle" font-size="27" font-family="Arial">UP</text></svg>';
  const photo='data:image/svg+xml;base64,'+btoa(svg);
  const items=Object.entries(LittleLabelSettings.meta).map(([id,m],i)=>({id:'synthetic-'+id,english:'Test '+(i+1),spanish:'Example',photo,size:m.name+' · '+m.dims.split(' · ')[0]}));
  const pages=buildPrintLayout(items),jpegs=[];for(const page of pages)jpegs.push(await pdfQA.renderPage(page,true));
  const pdf=pdfQA.makePdf(jpegs,1700,2200);return {bytes:Array.from(new Uint8Array(await pdf.arrayBuffer())),layout:pages.map(p=>p.map(({id,size,x,y,_w,_h,_rotated})=>({id,size,x,y,_w,_h,_rotated}))),jpegs};
 });
 assert.equal(result.layout.flat().length,9);assert.ok(result.layout.flat().some(x=>x._rotated));fs.mkdirSync(path.join(root,'test-results'),{recursive:true});fs.writeFileSync(path.join(root,'test-results/synthetic-nine-size-print.pdf'),Buffer.from(result.bytes));fs.writeFileSync(path.join(root,'test-results/synthetic-nine-size-layout.json'),JSON.stringify(result.layout,null,2));result.jpegs.forEach((url,i)=>fs.writeFileSync(path.join(root,`test-results/page-${i+1}.jpg`),Buffer.from(url.split(',')[1],'base64')));console.log('PASS actual PDF generated:',result.layout.length,'Letter pages, nine sizes,',result.layout.flat().filter(x=>x._rotated).length,'packed rotations');
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exit(1)});
