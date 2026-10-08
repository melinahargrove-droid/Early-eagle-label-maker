(()=>{
  const s=document.createElement('style');
  s.textContent=`@media print{
    html,body{margin:0!important;padding:0!important;background:#fff!important}
    body>*:not(#printRoot){display:none!important}
    #printRoot{display:block!important;visibility:visible!important;opacity:1!important;position:absolute!important;left:0!important;top:0!important;width:8.5in!important;margin:0!important;padding:0!important;background:#fff!important;z-index:2147483647!important}
    #printRoot *{visibility:visible!important;opacity:1!important}
    #printRoot .print-page{display:block!important;position:relative!important;width:8.5in!important;height:11in!important;overflow:hidden!important;background:#fff!important;break-after:page!important;page-break-after:always!important}
    #printRoot .print-page:last-child{break-after:auto!important;page-break-after:auto!important}
    #printRoot .raster-print-label{display:block!important;position:absolute!important;overflow:visible!important}
    #printRoot .raster-print-label img{display:block!important;visibility:visible!important;opacity:1!important;width:100%!important;height:100%!important;object-fit:fill!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
  }`;
  document.head.appendChild(s);

  function waitForImageLoad(img,signal){
    if(signal.aborted)return Promise.resolve(false);
    if(img.complete)return Promise.resolve(img.naturalWidth>0);
    return new Promise(resolve=>{
      const done=ok=>{img.removeEventListener('load',loaded);img.removeEventListener('error',failed);signal.removeEventListener('abort',failed);resolve(ok);};
      const loaded=()=>done(img.naturalWidth>0),failed=()=>done(false);
      img.addEventListener('load',loaded,{once:true});img.addEventListener('error',failed,{once:true});signal.addEventListener('abort',failed,{once:true});
    });
  }
  function waitForDecode(img,signal){
    if(signal.aborted)return Promise.resolve(false);
    if(!img.decode)return Promise.resolve(true);
    return new Promise(resolve=>{
      const done=ok=>{signal.removeEventListener('abort',cancel);resolve(ok);},cancel=()=>done(false);
      signal.addEventListener('abort',cancel,{once:true});
      try{Promise.resolve(img.decode()).then(()=>done(true),()=>done(false));}catch{done(false);}
    });
  }
  function waitForFrame(signal){
    if(signal.aborted)return Promise.resolve(false);
    return new Promise(resolve=>{
      const cancel=()=>{cancelAnimationFrame(frame);resolve(false);};
      const frame=requestAnimationFrame(()=>{signal.removeEventListener('abort',cancel);resolve(true);});
      signal.addEventListener('abort',cancel,{once:true});
    });
  }
  async function waitForPrintImages(job,isCurrent){
    const signal=job.controller.signal;
    const ready=await Promise.all(job.images.map(async img=>{
      const ready=await waitForImageLoad(img,signal)&&isCurrent()&&await waitForDecode(img,signal)&&isCurrent()&&img.complete&&img.naturalWidth>0;
      if(!ready)job.controller.abort();
      return ready;
    }));
    if(!ready.every(Boolean)||!isCurrent())return false;
    // Let Chrome commit the decoded images, checking the click's render at both frames.
    for(let frame=0;frame<2;frame++)if(!await waitForFrame(signal)||!isCurrent())return false;
    return isCurrent();
  }

  function install(){
    const btn=document.getElementById('printNowBtn');
    if(!btn || btn.dataset.androidPrintFix==='1') return;
    btn.dataset.androidPrintFix='1';
    let active=null;
    document.addEventListener('little-label-print-invalidated',()=>{
      if(!active)return;
      const old=active;active=null;old.controller.abort();
      if(btn.textContent==='Preparing print…')btn.textContent=old.text;
    });
    btn.addEventListener('click',async e=>{
      e.preventDefault();
      e.stopImmediatePropagation();
      if(btn.disabled||active)return;
      const state=window.LittleLabelPrintState,snapshot=state?.capture(),root=document.getElementById('printRoot');
      const images=root?[...root.querySelectorAll('img')]:[];
      if(!state?.isCurrent(snapshot)||!images.length)return;
      const job={snapshot,root,images,text:btn.textContent,controller:new AbortController()};active=job;
      const isCurrent=()=>{
        if(active!==job||!state.isCurrent(snapshot)||root!==document.getElementById('printRoot'))return false;
        const currentImages=[...root.querySelectorAll('img')];
        return images.length===currentImages.length&&images.every((img,index)=>img===currentImages[index]);
      };
      root.removeAttribute('aria-hidden');
      btn.disabled=true;
      btn.textContent='Preparing print…';
      try{
        const ready=await waitForPrintImages(job,isCurrent);
        if(!isCurrent())return;
        if(!ready){
          alert('The print sheet is not ready yet. Please try Print Labels again.');
          return;
        }
        window.print();
      }catch(error){
        if(isCurrent()){
          console.error('Could not open print dialog:',error);
          alert("I couldn't open the print dialog. Please try Print Labels again.");
        }
      }finally{
        if(active===job){
          const current=isCurrent();active=null;
          if(current)btn.disabled=false;
          if(btn.textContent==='Preparing print…')btn.textContent=job.text;
        }
      }
    },true);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
