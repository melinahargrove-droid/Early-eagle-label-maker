(()=>{
  let userWantsCleanup=false;
  let realClean=null;

  const css=document.createElement('style');
  css.textContent=`.ll-cleanup-choice{margin:12px 0 4px;padding:12px 14px;border:1px solid #DDE6EC;border-radius:17px;background:#EEF7FD;display:flex;align-items:center;justify-content:space-between;gap:12px}.ll-cleanup-copy strong{display:block;color:#17375E}.ll-cleanup-copy small{display:block;color:#61758A;margin-top:3px;line-height:1.25}.ll-cleanup-switch{position:relative;width:50px;height:29px;flex:0 0 auto}.ll-cleanup-switch input{position:absolute;opacity:0}.ll-cleanup-track{position:absolute;inset:0;border-radius:999px;background:#E8EDF1;border:1px solid #D4DEE6;transition:.18s}.ll-cleanup-thumb{position:absolute;width:23px;height:23px;left:3px;top:3px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(23,55,94,.18);transition:.18s}.ll-cleanup-switch input:checked+.ll-cleanup-track{background:#BFDDF2;border-color:#8FB8D8}.ll-cleanup-switch input:checked+.ll-cleanup-track .ll-cleanup-thumb{transform:translateX(21px);background:#17375E}`;
  document.head.appendChild(css);

  function hideCleanupExtras(){
    document.getElementById('cleanupStatus')?.classList.add('hidden');
    document.getElementById('cleanupStrengthWrap')?.classList.add('hidden');
    document.getElementById('photoChoiceRow')?.classList.add('hidden');
    document.getElementById('retryCleanupBtn')?.classList.add('hidden');
  }

  function useOriginal(){
    try{
      activePhotoDataUrl=photoDataUrl;
      cleanedPhotoDataUrl='';
      rawRemovedPhotoDataUrl='';
      cleanupSucceeded=false;
      const img=document.getElementById('confirmPhoto');
      if(img&&photoDataUrl) img.src=photoDataUrl;
      if(typeof syncLabel==='function') syncLabel();
    }catch{}
    hideCleanupExtras();
  }

  async function gatedClean(){
    if(!userWantsCleanup){
      useOriginal();
      return false;
    }
    return realClean ? realClean() : false;
  }

  function installToggle(){
    const confirmPhoto=document.getElementById('confirmPhoto');
    if(!confirmPhoto||document.getElementById('llCleanupToggleWrap')) return;
    const wrap=document.createElement('label');
    wrap.id='llCleanupToggleWrap';
    wrap.className='ll-cleanup-choice';
    wrap.innerHTML=`<span class="ll-cleanup-copy"><strong>Remove Photo Background</strong><small>Optional — turn this on if you want a cleaner cut-out image.</small></span><span class="ll-cleanup-switch"><input id="llCleanupToggle" type="checkbox"><span class="ll-cleanup-track"><span class="ll-cleanup-thumb"></span></span></span>`;
    confirmPhoto.insertAdjacentElement('afterend',wrap);
    const input=wrap.querySelector('input');
    input.checked=false;
    input.addEventListener('change',async()=>{
      userWantsCleanup=input.checked;
      if(userWantsCleanup){
        if(realClean) await realClean();
      }else{
        useOriginal();
      }
    });
    hideCleanupExtras();
  }

  function resetForNewPhoto(){
    userWantsCleanup=false;
    const input=document.getElementById('llCleanupToggle');
    if(input) input.checked=false;
    hideCleanupExtras();
  }

  function install(){
    realClean=window.cleanBackground||globalThis.cleanBackground||null;
    try{cleanBackground=gatedClean}catch{}
    try{window.cleanBackground=gatedClean}catch{}
    installToggle();
    const observer=new MutationObserver(()=>{
      const confirm=document.getElementById('confirm');
      if(confirm&&!confirm.classList.contains('hidden')){
        installToggle();
        if(!userWantsCleanup) useOriginal();
      }
    });
    const confirm=document.getElementById('confirm');
    if(confirm) observer.observe(confirm,{attributes:true,attributeFilter:['class']});
    ['homeCameraInput','homeGalleryInput','cameraInput','galleryInput'].forEach(id=>document.getElementById(id)?.addEventListener('change',resetForNewPhoto,{capture:true}));
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();