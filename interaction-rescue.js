(()=>{
  const BUILD='105';
  const errors=[];
  function record(msg){
    const text=String(msg||'Unknown error');
    errors.push(text);
    console.error('[Little Labels rescue]',text);
    const badge=document.getElementById('llRescueBadge');
    if(badge){badge.textContent='Little Labels diagnostic: '+text.slice(0,120);badge.style.background='#FCEDEC';badge.style.color='#8B4D49';}
  }
  window.addEventListener('error',e=>record(e.message||e.error));
  window.addEventListener('unhandledrejection',e=>record(e.reason?.message||e.reason));

  function fallbackShow(id){
    const ids=['home','capture','confirm','preview','sets','makeList','batch','batchReview','queue','library','reprint','account','passwordRecovery','printPreview'];
    ids.forEach(x=>document.getElementById(x)?.classList.toggle('hidden',x!==id));
    window.scrollTo(0,0);
  }
  function go(id){
    try{
      if(typeof window.show==='function') window.show(id); else fallbackShow(id);
    }catch(e){record(e);fallbackShow(id);}
  }
  function wire(id,fn){
    const el=document.getElementById(id); if(!el)return;
    el.style.pointerEvents='auto';
    el.style.touchAction='manipulation';
    el.onclick=(e)=>{e.preventDefault();e.stopPropagation();try{fn(e)}catch(err){record(err)}};
  }
  function install(){
    if(!document.getElementById('llRescueBadge')){
      const b=document.createElement('div');
      b.id='llRescueBadge';
      b.textContent='Diagnostic build '+BUILD+' active';
      b.style.cssText='position:fixed;left:8px;bottom:8px;z-index:50000;padding:5px 8px;border-radius:999px;background:#EEF7FD;color:#17375E;font:700 11px Arial;box-shadow:0 2px 8px #17375E22;pointer-events:none';
      document.body.appendChild(b);
      setTimeout(()=>{if(!errors.length)b.style.opacity='.35'},3500);
    }
    document.querySelectorAll('.app button,#home button').forEach(b=>{b.style.pointerEvents='auto';b.style.touchAction='manipulation'});
    wire('homePhotoBtn',()=>{const i=document.getElementById('homeCameraInput');if(i){i.value='';i.click()}else go('capture')});
    wire('homeGalleryBtn',()=>{const i=document.getElementById('homeGalleryInput');if(i){i.value='';i.click()}else go('capture')});
    wire('homeProductBtn',()=>{if(typeof window.openDedicatedBatch==='function')window.openDedicatedBatch('link');else go('batch')});
    wire('homeListBtn',()=>go('makeList'));
    wire('queueBtn',()=>{try{window.refreshQueue?.()}catch{}go('queue')});
    wire('libraryBtn',()=>{try{window.refreshLibrary?.()}catch{}go('library')});
    wire('accountBtn',()=>{try{window.updateAccountUI?.()}catch{}go('account')});
    wire('makeListBack',()=>go('home'));
    wire('queueBack',()=>go('home'));
    wire('libraryBack',()=>go('home'));
    document.querySelectorAll('#llAccessGate.lla-hidden,#llHelp.llh-hidden,#llAdmin.lla-hidden,#llSettings.lls-hidden,#nameLabelsOverlay.hide,#typeLabelOverlay.tl-hidden').forEach(x=>x.style.pointerEvents='none');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,0),{once:true});else setTimeout(install,0);
  window.addEventListener('load',()=>setTimeout(install,100));
  setTimeout(install,1500);
})();