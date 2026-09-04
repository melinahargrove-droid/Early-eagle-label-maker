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

  async function waitForPrintImages(){
    const root=document.getElementById('printRoot');
    if(!root) return false;
    root.removeAttribute('aria-hidden');
    const imgs=[...root.querySelectorAll('img')];
    if(!imgs.length) return false;
    await Promise.all(imgs.map(async img=>{
      if(!img.complete){
        await new Promise(resolve=>{
          const done=()=>resolve();
          img.addEventListener('load',done,{once:true});
          img.addEventListener('error',done,{once:true});
        });
      }
      if(img.decode){try{await img.decode();}catch{}}
    }));
    // Let Chrome commit the decoded images to the rendered print tree.
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    return true;
  }

  function install(){
    const btn=document.getElementById('printNowBtn');
    if(!btn || btn.dataset.androidPrintFix==='1') return;
    btn.dataset.androidPrintFix='1';
    btn.addEventListener('click',async e=>{
      e.preventDefault();
      e.stopImmediatePropagation();
      const old=btn.textContent;
      btn.disabled=true;
      btn.textContent='Preparing print…';
      try{
        const ready=await waitForPrintImages();
        if(!ready){
          alert('The print sheet is not ready yet. Please tap Create Print Sheets again.');
          return;
        }
        window.print();
      }finally{
        btn.disabled=false;
        btn.textContent=old;
      }
    },true);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();