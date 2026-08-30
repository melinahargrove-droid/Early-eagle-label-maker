(()=>{
  // Paper-saving print packer for mixed Early Eagle label sizes.
  // CP basket labels stay upright because their fold line must remain horizontal.
  // Business-card labels may rotate 90° when that uses otherwise wasted page space.
  const PAGE_W=8.5, PAGE_H=11, MARGIN=.25, GAP=.08;
  const EPS=.0001;

  function dims(item){
    const cp=String(item.size||'').toLowerCase().includes('cp basket');
    return cp ? {w:4.5,h:3,type:'cp'} : {w:3.375,h:2,type:'business'};
  }

  function intersects(a,b){
    return !(a.x+a.w+GAP<=b.x+EPS || b.x+b.w+GAP<=a.x+EPS ||
             a.y+a.h+GAP<=b.y+EPS || b.y+b.h+GAP<=a.y+EPS);
  }

  function candidates(placed){
    const pts=[{x:MARGIN,y:MARGIN}];
    placed.forEach(p=>{
      pts.push({x:p.x+p.w+GAP,y:p.y});
      pts.push({x:p.x,y:p.y+p.h+GAP});
    });
    const seen=new Set();
    return pts.filter(p=>{
      if(p.x>PAGE_W-MARGIN+EPS || p.y>PAGE_H-MARGIN+EPS) return false;
      const key=`${p.x.toFixed(4)},${p.y.toFixed(4)}`;
      if(seen.has(key)) return false;
      seen.add(key); return true;
    }).sort((a,b)=>(a.y-b.y)||(a.x-b.x));
  }

  function fits(x,y,w,h,placed){
    if(x+w>PAGE_W-MARGIN+EPS || y+h>PAGE_H-MARGIN+EPS) return false;
    const box={x,y,w,h};
    return !placed.some(p=>intersects(box,p));
  }

  function bestPlacement(item,placed){
    const d=dims(item);
    const orientations=d.type==='business'
      ? [{w:d.w,h:d.h,rotated:false},{w:d.h,h:d.w,rotated:true}]
      : [{w:d.w,h:d.h,rotated:false}];
    let best=null;
    for(const pt of candidates(placed)){
      for(const o of orientations){
        if(!fits(pt.x,pt.y,o.w,o.h,placed)) continue;
        // Prefer top/left packing, then the orientation that leaves the smaller right-side sliver.
        const rightWaste=(PAGE_W-MARGIN)-(pt.x+o.w);
        const bottom=(pt.y+o.h);
        const score=pt.y*1000 + pt.x*100 + rightWaste + bottom*.01;
        if(!best || score<best.score){
          best={x:pt.x,y:pt.y,w:o.w,h:o.h,rotated:o.rotated,score};
        }
      }
    }
    return best;
  }

  function packOnePage(pending){
    const placed=[];
    const used=new Set();
    // CP labels first; then cards fill the gaps around them.
    const order=pending.map((item,index)=>({item,index,d:dims(item)}))
      .sort((a,b)=>(a.d.type===b.d.type?0:(a.d.type==='cp'?-1:1)) || (b.d.h*b.d.w-a.d.h*a.d.w));

    let changed=true;
    while(changed){
      changed=false;
      for(const entry of order){
        if(used.has(entry.index)) continue;
        const pos=bestPlacement(entry.item,placed);
        if(!pos) continue;
        const d=entry.d;
        placed.push({...entry.item,x:pos.x,y:pos.y,_w:pos.w,_h:pos.h,_type:d.type,_rotated:pos.rotated,_sourceIndex:entry.index,w:pos.w,h:pos.h});
        used.add(entry.index);
        changed=true;
      }
    }
    return {placed,used};
  }

  window.buildPrintLayout=function smartBuildPrintLayout(items){
    let pending=items.slice();
    const pages=[];
    while(pending.length){
      const {placed,used}=packOnePage(pending);
      if(!placed.length){
        // Safety fallback; should never happen for supported label sizes.
        const item=pending[0], d=dims(item);
        placed.push({...item,x:MARGIN,y:MARGIN,_w:d.w,_h:d.h,_type:d.type,_rotated:false});
        used.add(0);
      }
      pages.push(placed.map(({w,h,_sourceIndex,...p})=>p));
      pending=pending.filter((_,i)=>!used.has(i));
    }
    return pages;
  };

  // Rotate the already-rasterized business-card artwork inside its packed rectangle.
  const originalRender=window.renderPrintSheets;
  if(typeof originalRender==='function'){
    window.renderPrintSheets=async function(){
      await originalRender();
      const apply=(root,selector)=>{
        root.querySelectorAll(selector).forEach((el,i)=>{
          const flat=(window.printLayoutPages||[]).flat();
          const item=flat[i];
          if(!item?._rotated) return;
          const img=el.querySelector('img');
          if(!img) return;
          img.style.position='absolute';
          img.style.left='50%'; img.style.top='50%';
          img.style.width=`${(item._h/item._w)*100}%`;
          img.style.height=`${(item._w/item._h)*100}%`;
          img.style.maxWidth='none'; img.style.maxHeight='none';
          img.style.transform='translate(-50%,-50%) rotate(90deg)';
          img.style.transformOrigin='center center';
        });
      };
      apply(document,'#sheetPreviewPages .raster-sheet-label');
      apply(document,'#printRoot .raster-print-label');
    };
  }
})();
