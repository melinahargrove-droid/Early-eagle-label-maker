self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  try{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k.includes('label-maker-')||k.startsWith('little-labels-')).map(k=>caches.delete(k)));
  }catch{}
  await self.clients.claim();
  try{await self.registration.unregister();}catch{}
})()));
// Build 102: no fetch interception. GitHub Pages serves Little Labels directly.
