(()=>{
  const APP_VERSION="35";
  const REFRESH_FLAG=`eea_force_refresh_v${APP_VERSION}`;

  async function forceCurrentWorker(){
    if(!('serviceWorker' in navigator)) return;
    try{
      const regs=await navigator.serviceWorker.getRegistrations();
      for(const reg of regs){
        const script=reg.active?.scriptURL||reg.waiting?.scriptURL||reg.installing?.scriptURL||"";
        if(!script.includes(`service-worker.js?v=${APP_VERSION}`)){
          await reg.unregister();
        }
      }

      if('caches' in window){
        const keys=await caches.keys();
        await Promise.all(keys
          .filter(k=>k.startsWith('early-eagle-label-maker-') && k!==`early-eagle-label-maker-v${APP_VERSION}`)
          .map(k=>caches.delete(k)));
      }

      const reg=await navigator.serviceWorker.register(`./service-worker.js?v=${APP_VERSION}`,{updateViaCache:'none'});
      await reg.update().catch(()=>{});

      const url=new URL(window.location.href);
      const current=url.searchParams.get('appv');
      if(current!==APP_VERSION && !sessionStorage.getItem(REFRESH_FLAG)){
        sessionStorage.setItem(REFRESH_FLAG,'1');
        url.searchParams.set('appv',APP_VERSION);
        window.location.replace(url.toString());
      }
    }catch(err){
      console.warn('PWA version refresh failed:',err);
    }
  }

  // Run after the legacy v32 load handler, then correct it immediately.
  window.addEventListener('load',()=>setTimeout(forceCurrentWorker,50));
})();
