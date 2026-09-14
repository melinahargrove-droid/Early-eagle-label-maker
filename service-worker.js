self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    try{
      const keys=await caches.keys();
      await Promise.all(keys.filter(k=>k.includes('label-maker-')||k.startsWith('little-labels-')).map(k=>caches.delete(k)));
      await self.registration.unregister();
      const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
      for(const client of clients) client.postMessage({type:'LL_SW_REMOVED'});
    }catch(err){console.warn(err);}
  })());
});
// Build 100 recovery worker intentionally has no fetch handler.
