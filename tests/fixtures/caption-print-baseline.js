// Frozen pre-fix print artwork for real-canvas short-caption pixel parity.
// Extracted from build 117 before the confirmed caption truncation repair.
window.LittleLabelsCaptionBaseline = (() => {
  const window = {labelDimensions: globalThis.labelDimensions};
function roundRectPath(ctx,x,y,w,h,r){
  const rr=Math.min(r,w/2,h/2);
  ctx.beginPath();
  ctx.moveTo(x+rr,y);
  ctx.arcTo(x+w,y,x+w,y+h,rr);
  ctx.arcTo(x+w,y+h,x,y+h,rr);
  ctx.arcTo(x,y+h,x,y,rr);
  ctx.arcTo(x,y,x+w,y,rr);
  ctx.closePath();
}

function wrapTextLines(ctx,text,maxWidth,maxLines=2){
  const words=String(text||"").trim().split(/\s+/).filter(Boolean);
  if(!words.length) return [""];
  const lines=[];
  let current="";
  for(const word of words){
    const test=current ? current+" "+word : word;
    if(ctx.measureText(test).width<=maxWidth || !current){
      current=test;
    }else{
      lines.push(current);
      current=word;
      if(lines.length===maxLines-1) break;
    }
  }
  if(current && lines.length<maxLines) lines.push(current);

  // If there are unconsumed words, fit remaining text into final line.
  const consumed=lines.join(" ").split(/\s+/).filter(Boolean).length;
  if(consumed<words.length && lines.length){
    let final=lines[lines.length-1];
    const remaining=words.slice(consumed).join(" ");
    const candidate=(final+" "+remaining).trim();
    if(ctx.measureText(candidate).width<=maxWidth){
      lines[lines.length-1]=candidate;
    }
  }
  return lines;
}

async function loadImageForRaster(src){
  if(!src) return null;
  const img=new Image();
  img.decoding="async";
  await new Promise((resolve,reject)=>{
    img.onload=resolve;
    img.onerror=reject;
    img.src=src;
  });
  return img;
}

async function rasterizeFinishedLabel(item){
  const d=labelDimensions(item);
  const DPI=300;
  const W=Math.round(d.w*DPI);
  const H=Math.round(d.h*DPI);
  const canvas=document.createElement("canvas");
  canvas.width=W; canvas.height=H;
  const ctx=canvas.getContext("2d");

  // CP BASKET: full printed piece is 3 x 5 in.
  // Top 3 x 2.5 in stays blank as the fold-in flap.
  // Bottom 3 x 2.5 in is the visible designed label.
  if(d.type==="cp"){
    ctx.fillStyle="#ffffff";
    ctx.fillRect(0,0,W,H);

    // Full CP Basket card: 4.5" wide x 3" tall.
    // Top 4.5" x 1.5" is the blank fold-behind flap.
    // Bottom 4.5" x 1.5" is the visible label.
    const foldY=Math.round(H/2);

    // Fold guide at exactly 1.5 inches from the top.
    ctx.save();
    ctx.strokeStyle="#9aa9b5";
    ctx.lineWidth=2;
    ctx.setLineDash([10,8]);
    ctx.beginPath();
    ctx.moveTo(0,foldY);
    ctx.lineTo(W,foldY);
    ctx.stroke();
    ctx.restore();

    const visibleY=foldY;
    const visibleH=H-foldY;

    // Soft Early Eagle field on visible half only.
    const bg=ctx.createLinearGradient(0,visibleY,W,H);
    bg.addColorStop(0,"#e6f2fb");
    bg.addColorStop(.50,"#f7fbfe");
    bg.addColorStop(1,"#dcecf8");
    ctx.fillStyle=bg;
    ctx.fillRect(0,visibleY,W,visibleH);

    const inset=Math.round(DPI*.035);
    const cardX=inset;
    const cardY=visibleY+inset;
    const cardW=W-inset*2;
    const cardH=visibleH-inset*2;
    const radius=Math.round(DPI*.075);

    ctx.save();
    ctx.shadowColor="rgba(48,88,118,.16)";
    ctx.shadowBlur=Math.round(DPI*.022);
    ctx.shadowOffsetY=Math.round(DPI*.010);
    roundRectPath(ctx,cardX,cardY,cardW,cardH,radius);
    ctx.fillStyle="#ffffff";
    ctx.fill();
    ctx.restore();

    roundRectPath(ctx,cardX,cardY,cardW,cardH,radius);
    ctx.strokeStyle="#7fb3d8";
    ctx.lineWidth=Math.max(4,Math.round(DPI*.013));
    ctx.stroke();

    // Wide shallow visible panel: large image left, bilingual wording right.
    const pad=Math.round(DPI*.045);
    const contentX=cardX+pad;
    const contentY=cardY+pad;
    const contentW=cardW-pad*2;
    const contentH=cardH-pad*2;

    const imageW=Math.round(contentW*.40);
    const dividerX=contentX+imageW+Math.round(DPI*.025);
    const textX=dividerX+Math.round(DPI*.065);
    const textW=(contentX+contentW)-textX;

    try{
      const img=await loadImageForRaster(item.photo);
      if(img){
        const maxW=imageW*.96;
        const maxH=contentH*.94;
        const scale=Math.min(maxW/img.naturalWidth,maxH/img.naturalHeight);
        const iw=img.naturalWidth*scale;
        const ih=img.naturalHeight*scale;
        ctx.drawImage(img,contentX+(imageW-iw)/2,contentY+(contentH-ih)/2,iw,ih);
      }
    }catch(err){
      console.warn("Could not rasterize CP label photo:",err);
    }

    ctx.strokeStyle="#5c9dcd";
    ctx.lineWidth=Math.max(3,Math.round(DPI*.011));
    ctx.beginPath();
    ctx.moveTo(dividerX,contentY+contentH*.08);
    ctx.lineTo(dividerX,contentY+contentH*.92);
    ctx.stroke();

    ctx.textAlign="center";
    ctx.textBaseline="middle";
    const centerX=textX+textW/2;

    let enSize=78;
    ctx.font=`800 ${enSize}px Arial, sans-serif`;
    while(ctx.measureText(item.english||"").width>textW*.97 && enSize>50){
      enSize--;
      ctx.font=`800 ${enSize}px Arial, sans-serif`;
    }
    const enLines=wrapTextLines(ctx,item.english||"",textW*.96,2);

    let esSize=56;
    ctx.font=`700 ${esSize}px Arial, sans-serif`;
    while(ctx.measureText(item.spanish||"").width>textW*.97 && esSize>36){
      esSize--;
      ctx.font=`700 ${esSize}px Arial, sans-serif`;
    }
    const esLines=wrapTextLines(ctx,item.spanish||"",textW*.96,2);

    const enH=enSize*1.02;
    const esH=esSize*1.02;
    const gap=Math.round(DPI*.006);
    const totalH=enLines.length*enH+esLines.length*esH+gap;
    let ty=contentY+(contentH-totalH)/2+enH/2;

    ctx.fillStyle="#0e4c88";
    ctx.font=`800 ${enSize}px Arial, sans-serif`;
    for(const line of enLines){
      ctx.fillText(line,centerX,ty);
      ty+=enH;
    }

    ty+=gap;
    ctx.fillStyle="#171717";
    ctx.font=`700 ${esSize}px Arial, sans-serif`;
    for(const line of esLines){
      ctx.fillText(line,centerX,ty);
      ty+=esH;
    }

    return canvas.toDataURL("image/png");
  }

  // BUSINESS CARD: locked Build 19 visual treatment.
  const bg=ctx.createLinearGradient(0,0,W,H);
  bg.addColorStop(0,"#e6f2fb");
  bg.addColorStop(.48,"#f7fbfe");
  bg.addColorStop(1,"#dcecf8");
  ctx.fillStyle=bg;
  ctx.fillRect(0,0,W,H);

  ctx.save();
  ctx.globalAlpha=.18;
  ctx.fillStyle="#b9d9ee";
  ctx.beginPath(); ctx.ellipse(W*.08,H*.18,W*.17,H*.22,-.25,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(W*.92,H*.82,W*.20,H*.25,.2,0,Math.PI*2); ctx.fill();
  ctx.restore();

  const inset=Math.round(DPI*.028);
  const cardX=inset, cardY=inset*.55, cardW=W-inset*2, cardH=H-inset*1.10;
  const radius=Math.round(DPI*.085);

  ctx.save();
  ctx.shadowColor="rgba(48,88,118,.20)";
  ctx.shadowBlur=Math.round(DPI*.03);
  ctx.shadowOffsetY=Math.round(DPI*.015);
  roundRectPath(ctx,cardX,cardY,cardW,cardH,radius);
  ctx.fillStyle="#ffffff";
  ctx.fill();
  ctx.restore();

  roundRectPath(ctx,cardX,cardY,cardW,cardH,radius);
  ctx.strokeStyle="#7fb3d8";
  ctx.lineWidth=Math.max(4,Math.round(DPI*.014));
  ctx.stroke();

  ctx.save();
  ctx.globalAlpha=.28;
  roundRectPath(ctx,cardX+5,cardY+4,cardW-10,cardH-8,radius-4);
  ctx.strokeStyle="#b7d5e9";
  ctx.lineWidth=Math.max(2,Math.round(DPI*.009));
  ctx.stroke();
  ctx.restore();

  const innerPad=Math.round(DPI*.035);
  const contentX=cardX+innerPad;
  const contentW=cardW-innerPad*2;
  const textBlockH=Math.round(H*.30);
  const dividerY=cardY+cardH-textBlockH;
  const imageTop=cardY+Math.round(DPI*.012);
  const imageBottom=dividerY-Math.round(DPI*.012);
  const imageAreaH=imageBottom-imageTop;

  try{
    const img=await loadImageForRaster(item.photo);
    if(img){
      const maxW=contentW*.99;
      const maxH=imageAreaH*.99;
      const scale=Math.min(maxW/img.naturalWidth,maxH/img.naturalHeight);
      const iw=img.naturalWidth*scale;
      const ih=img.naturalHeight*scale;
      ctx.drawImage(img,contentX+(contentW-iw)/2,imageTop+(imageAreaH-ih)/2,iw,ih);
    }
  }catch(err){
    console.warn("Could not rasterize label photo:",err);
  }

  ctx.strokeStyle="#5c9dcd";
  ctx.lineWidth=Math.max(3,Math.round(DPI*.012));
  ctx.beginPath();
  ctx.moveTo(contentX,dividerY);
  ctx.lineTo(contentX+contentW,dividerY);
  ctx.stroke();

  ctx.textAlign="center";
  ctx.textBaseline="middle";

  let enSize=66;
  ctx.font=`800 ${enSize}px Arial, sans-serif`;
  while(ctx.measureText(item.english||"").width>contentW*.985 && enSize>40){
    enSize--;
    ctx.font=`800 ${enSize}px Arial, sans-serif`;
  }
  const enLines=wrapTextLines(ctx,item.english||"",contentW*.96,2);

  let esSize=50;
  ctx.font=`700 ${esSize}px Arial, sans-serif`;
  while(ctx.measureText(item.spanish||"").width>contentW*.985 && esSize>31){
    esSize--;
    ctx.font=`700 ${esSize}px Arial, sans-serif`;
  }
  const esLines=wrapTextLines(ctx,item.spanish||"",contentW*.96,2);

  const lineGap=Math.round(DPI*.008);
  const enLineH=enSize*1.03;
  const esLineH=esSize*1.03;
  const totalH=enLines.length*enLineH+esLines.length*esLineH+lineGap*2;
  let ty=dividerY+(textBlockH-totalH)/2+enLineH/2;

  ctx.fillStyle="#0e4c88";
  ctx.font=`800 ${enSize}px Arial, sans-serif`;
  for(const line of enLines){
    ctx.fillText(line,W/2,ty);
    ty+=enLineH;
  }

  ty+=lineGap;
  ctx.fillStyle="#171717";
  ctx.font=`700 ${esSize}px Arial, sans-serif`;
  for(const line of esLines){
    ctx.fillText(line,W/2,ty);
    ty+=esLineH;
  }

  return canvas.toDataURL("image/png");
}

window.rasterizeFinishedLabel = rasterizeFinishedLabel;
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
return window.rasterizeFinishedLabel;
})();
