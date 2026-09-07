(()=>{
  const original=window.rasterizeFinishedLabel;
  if(typeof original!=='function') return;
  const DPI=300;
  const roundRect=(ctx,x,y,w,h,r)=>{const rr=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+rr,y);ctx.arcTo(x+w,y,x+w,y+h,rr);ctx.arcTo(x+w,y+h,x,y+h,rr);ctx.arcTo(x,y+h,x,y,rr);ctx.arcTo(x,y,x+w,y,rr);ctx.closePath()};
  const load=src=>new Promise((res,rej)=>{if(!src)return res(null);const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=src});
  function fitFont(ctx,text,maxW,start,min,weight){let s=start;ctx.font=`${weight} ${s}px Arial, sans-serif`;while(s>min&&ctx.measureText(text||'').width>maxW){s--;ctx.font=`${weight} ${s}px Arial, sans-serif`}return s}
  function wrap(ctx,text,maxW,maxLines=2){const words=String(text||'').trim().split(/\s+/).filter(Boolean),out=[];let line='';for(const word of words){const t=line?line+' '+word:word;if(!line||ctx.measureText(t).width<=maxW)line=t;else{out.push(line);line=word;if(out.length===maxLines-1)break}}if(line&&out.length<maxLines)out.push(line);return out.length?out:['']}
  async function generic(item,d){
    const W=Math.round(d.w*DPI),H=Math.round(d.h*DPI),c=document.createElement('canvas');c.width=W;c.height=H;const ctx=c.getContext('2d');
    const bg=ctx.createLinearGradient(0,0,W,H);bg.addColorStop(0,'#EAF4FB');bg.addColorStop(.52,'#FFFDF9');bg.addColorStop(1,'#DCECF8');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
    const inset=Math.max(9,Math.round(Math.min(W,H)*.035)),r=Math.max(18,Math.round(Math.min(W,H)*.055));
    ctx.save();ctx.shadowColor='rgba(38,53,77,.14)';ctx.shadowBlur=Math.round(Math.min(W,H)*.025);ctx.shadowOffsetY=Math.round(Math.min(W,H)*.01);roundRect(ctx,inset,inset,W-inset*2,H-inset*2,r);ctx.fillStyle='#fff';ctx.fill();ctx.restore();
    roundRect(ctx,inset,inset,W-inset*2,H-inset*2,r);ctx.strokeStyle='#8FB8D8';ctx.lineWidth=Math.max(3,Math.round(Math.min(W,H)*.006));ctx.stroke();
    const pad=Math.round(Math.min(W,H)*.055),x=inset+pad,y=inset+pad,w=W-(inset+pad)*2,h=H-(inset+pad)*2;
    const portrait=d.h>d.w*1.15;
    const img=await load(item.photo).catch(()=>null);
    if(portrait){
      const imageH=Math.round(h*.66),divider=y+imageH;
      if(img){const scale=Math.min(w*.92/img.naturalWidth,imageH*.9/img.naturalHeight),iw=img.naturalWidth*scale,ih=img.naturalHeight*scale;ctx.drawImage(img,x+(w-iw)/2,y+(imageH-ih)/2,iw,ih)}
      ctx.strokeStyle='#8FB8D8';ctx.lineWidth=Math.max(2,Math.round(DPI*.008));ctx.beginPath();ctx.moveTo(x,divider);ctx.lineTo(x+w,divider);ctx.stroke();
      const textTop=divider+Math.round(DPI*.05),textH=y+h-textTop,center=x+w/2;
      let en=fitFont(ctx,item.english,w*.94,Math.round(Math.min(W,H)*.09),32,800);ctx.font=`800 ${en}px Arial, sans-serif`;const enLines=wrap(ctx,item.english,w*.94,2);
      let es=fitFont(ctx,item.spanish,w*.94,Math.round(en*.68),24,700);ctx.font=`700 ${es}px Arial, sans-serif`;const esLines=wrap(ctx,item.spanish,w*.94,2);
      const lh1=en*1.05,lh2=es*1.05,gap=Math.round(DPI*.025),total=enLines.length*lh1+gap+esLines.length*lh2;let ty=textTop+(textH-total)/2+lh1/2;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#174F83';ctx.font=`800 ${en}px Arial, sans-serif`;for(const line of enLines){ctx.fillText(line,center,ty);ty+=lh1}ty+=gap;ctx.fillStyle='#222';ctx.font=`700 ${es}px Arial, sans-serif`;for(const line of esLines){ctx.fillText(line,center,ty);ty+=lh2}
    }else{
      const imageW=Math.round(w*.53),divider=x+imageW;
      if(img){const scale=Math.min(imageW*.9/img.naturalWidth,h*.88/img.naturalHeight),iw=img.naturalWidth*scale,ih=img.naturalHeight*scale;ctx.drawImage(img,x+(imageW-iw)/2,y+(h-ih)/2,iw,ih)}
      ctx.strokeStyle='#8FB8D8';ctx.lineWidth=Math.max(2,Math.round(DPI*.008));ctx.beginPath();ctx.moveTo(divider,y+h*.08);ctx.lineTo(divider,y+h*.92);ctx.stroke();
      const tx=divider+Math.round(DPI*.05),tw=x+w-tx,center=tx+tw/2;
      let en=fitFont(ctx,item.english,tw*.94,Math.round(Math.min(W,H)*.085),30,800);ctx.font=`800 ${en}px Arial, sans-serif`;const enLines=wrap(ctx,item.english,tw*.94,2);
      let es=fitFont(ctx,item.spanish,tw*.94,Math.round(en*.68),23,700);ctx.font=`700 ${es}px Arial, sans-serif`;const esLines=wrap(ctx,item.spanish,tw*.94,2);
      const lh1=en*1.04,lh2=es*1.04,gap=Math.round(DPI*.02),total=enLines.length*lh1+gap+esLines.length*lh2;let ty=y+(h-total)/2+lh1/2;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#174F83';ctx.font=`800 ${en}px Arial, sans-serif`;for(const line of enLines){ctx.fillText(line,center,ty);ty+=lh1}ty+=gap;ctx.fillStyle='#222';ctx.font=`700 ${es}px Arial, sans-serif`;for(const line of esLines){ctx.fillText(line,center,ty);ty+=lh2}
    }
    return c.toDataURL('image/png');
  }
  window.rasterizeFinishedLabel=async function(item){const d=window.labelDimensions?window.labelDimensions(item):null;if(!d||d.type==='business'||d.type==='cp')return original(item);return generic(item,d)};
})();