(()=>{
  const APP_VERSION="102";
  const FLAG=`little_labels_direct_bootstrap_${APP_VERSION}`;
  function updateVisibleBuild(){
    document.querySelectorAll('.footer-note span').forEach(el=>{
      if(/App build\s+\d+/i.test(el.textContent||'')) el.textContent=`App build ${APP_VERSION}`;
    });
  }
  async function retireLegacyWorker(){
    updateVisibleBuild();
    if(sessionStorage.getItem(FLAG)) return;
    sessionStorage.setItem(FLAG,'1');
    try{
      if('serviceWorker' in navigator){
        const regs=await navigator.serviceWorker.getRegistrations();
        for(const reg of regs){ try{await reg.unregister();}catch{} }
      }
      if('caches' in window){
        const keys=await caches.keys();
        await Promise.all(keys.filter(k=>k.includes('label-maker-')||k.startsWith('little-labels-')).map(k=>caches.delete(k)));
      }
      const u=new URL(location.href);
      if(u.searchParams.get('appv')!==APP_VERSION){
        u.searchParams.set('appv',APP_VERSION);
        location.replace(u.toString());
      }
    }catch(err){ console.warn('Legacy PWA cleanup failed:',err); }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',updateVisibleBuild,{once:true}); else updateVisibleBuild();
  addEventListener('load',()=>setTimeout(retireLegacyWorker,100));
})();\n