const VERSION="101";
const PATCHES=[
  "commercial-access.js","little-labels-admin.js","v1-audit-polish.js","home-grid-order.js","onboarding-help.js",
  "make-list-isolated.js","make-list-polish.js","smart-print-layout.js","name-labels.js","name-labels-queue.js",
  "queue-library-polish.js","little-labels-theme.js","label-settings.js","language-settings.js","identification-language.js",
  "confirmation-cleanup.js","type-a-label.js","blank-input-placeholders.js","sellable-label-wiring.js","sellable-label-render.js",
  "true-size-rotation-fix.js","background-cleanup-toggle.js","home-settings-gear.js","print-blank-fix.js","pdf-print.js","pwa-version-fix.js"
];
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  try{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k.includes('label-maker-')||k.startsWith('little-labels-')).map(k=>caches.delete(k)));
  }catch{}
  await self.clients.claim();
})()));
async function injectPatches(response){
  if(!response)return response;
  try{
    let html=await response.text();
    for(const name of PATCHES){
      if(!html.includes(name)) html=html.replace('</body>',`<script src="./${name}?v=${VERSION}"></script></body>`);
    }
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }catch{return response;}
}
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(event.request.mode==='navigate'||url.pathname.endsWith('/index.html')){
    event.respondWith((async()=>{
      try{
        const response=await fetch(event.request,{cache:'no-store'});
        return await injectPatches(response);
      }catch{
        return new Response('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui;padding:24px;background:#FCF8F0;color:#17375E"><h2>Little Labels needs an internet connection to open.</h2><p>Please reconnect and try again.</p></body>',{headers:{'content-type':'text/html'}});
      }
    })());
    return;
  }
  event.respondWith(fetch(event.request,{cache:'no-store'}));
});