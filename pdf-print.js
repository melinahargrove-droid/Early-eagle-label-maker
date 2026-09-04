(()=>{
 const DPI=200,PAGE_W=8.5,PAGE_H=11,PT_W=612,PT_H=792;
 const enc=new TextEncoder();
 function sbytes(s){return enc.encode(s)}
 function join(parts){let n=0;parts.forEach(p=>n+=p.length);const out=new Uint8Array(n);let o=0;for(const p of parts){out.set(p,o);o+=p.length}return out}
 function dataUrlBytes(url){const b64=url.split(',')[1]||'';const bin=atob(b64);const out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out}
 function load(src){return new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=src})}
 async function renderPage(page,showCuts){
   const c=document.createElement('canvas');c.width=Math.round(PAGE_W*DPI);c.height=Math.round(PAGE_H*DPI);const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);
   for(const item of page){
     const raster=await rasterizeFinishedLabel(item);const img=await load(raster);const px=item.x*DPI,py=item.y*DPI,pw=item._w*DPI,ph=item._h*DPI;
     if(item._rotated){x.save();x.translate(px+pw/2,py+ph/2);x.rotate(Math.PI/2);x.drawImage(img,-ph/2,-pw/2,ph,pw);x.restore()}else{x.drawImage(img,px,py,pw,ph)}
     if(showCuts){x.save();x.strokeStyle='#7a8792';x.lineWidth=1.4;x.setLineDash([6,5]);x.strokeRect(px+.7,py+.7,pw-1.4,ph-1.4);x.restore()}
   }
   return c.toDataURL('image/jpeg',.96);
 }
 function makePdf(jpegs,w,h){
   const objs=[];const pageIds=[];
   objs[1]=sbytes('<< /Type /Catalog /Pages 2 0 R >>');
   for(let i=0;i<jpegs.length;i++) pageIds.push(3+i*3);
   objs[2]=sbytes(`<< /Type /Pages /Kids [${pageIds.map(id=>id+' 0 R').join(' ')}] /Count ${jpegs.length} >>`);
   for(let i=0;i<jpegs.length;i++){
     const p=3+i*3,im=p+1,ct=p+2,j=dataUrlBytes(jpegs[i]);
     objs[p]=sbytes(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PT_W} ${PT_H}] /Resources << /XObject << /Im0 ${im} 0 R >> >> /Contents ${ct} 0 R >>`);
     objs[im]=join([sbytes(`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${j.length} >>\nstream\n`),j,sbytes('\nendstream')]);
     const stream=`q\n${PT_W} 0 0 ${PT_H} 0 0 cm\n/Im0 Do\nQ\n`;objs[ct]=sbytes(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
   }
   const header=sbytes('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');const chunks=[header],offs=[0];let pos=header.length;
   for(let i=1;i<objs.length;i++){offs[i]=pos;const ch=join([sbytes(`${i} 0 obj\n`),objs[i],sbytes('\nendobj\n')]);chunks.push(ch);pos+=ch.length}
   const xref=pos;let xr=`xref\n0 ${objs.length}\n0000000000 65535 f \n`;for(let i=1;i<objs.length;i++)xr+=String(offs[i]).padStart(10,'0')+' 00000 n \n';
   chunks.push(sbytes(xr+`trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`));return new Blob(chunks,{type:'application/pdf'})
 }
 async function createPdf(){
   if(typeof printLayoutPages==='undefined'||!printLayoutPages.length){alert('Create the print sheets first.');return}
   const btn=document.getElementById('printNowBtn');const old=btn.textContent;btn.disabled=true;btn.textContent='Building PDF…';
   try{
     const viewer=window.open('about:blank','_blank');if(viewer){viewer.document.write('<title>Little Labels PDF</title><p style="font-family:sans-serif;padding:24px">Building your print-ready PDF…</p>')}
     const cuts=document.getElementById('cutLinesToggle')?.checked!==false;const pages=[];for(const p of printLayoutPages)pages.push(await renderPage(p,cuts));
     const pdf=makePdf(pages,Math.round(PAGE_W*DPI),Math.round(PAGE_H*DPI));const url=URL.createObjectURL(pdf);
     if(viewer){viewer.location.href=url}else{const a=document.createElement('a');a.href=url;a.download='Little-Labels-Print-Sheets.pdf';document.body.append(a);a.click();a.remove();alert('Your print-ready PDF was created. Open the downloaded PDF and print it at Actual Size / 100%.')}
     setTimeout(()=>URL.revokeObjectURL(url),120000);
   }catch(err){console.error('PDF print error',err);alert('I could not build the print PDF. Please try again.');}
   finally{btn.disabled=false;btn.textContent=old.replace('Print / Save PDF','Open Print PDF')}
 }
 function install(){const b=document.getElementById('printNowBtn');if(!b)return;b.textContent='🖨️ Open Print PDF';b.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();createPdf()},{capture:true});const note=b.nextElementSibling;if(note&&note.classList.contains('tiny'))note.textContent='This creates a true 8.5 × 11 PDF. In the PDF print settings, use Letter paper and 100% / Actual Size.'}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();