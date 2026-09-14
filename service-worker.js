const CACHE="little-labels-v99";
const FALLBACK_KEY="./index.html?appv=99";
const PATCHES=[
  "commercial-access.js","little-labels-admin.js","v1-audit-polish.js","home-grid-order.js","onboarding-help.js",
  "make-list-isolated.js","make-list-polish.js","smart-print-layout.js","name-labels.js","name-labels-queue.js",
  "queue-library-polish.js","little-labels-theme.js","label-settings.js","language-settings.js","identification-language.js",
  "confirmation-cleanup.js","type-a-label.js","blank-input-placeholders.js","sellable-label-wiring.js","sellable-label-render.js",
  "true-size-rotation-fix.js","background-cleanup-toggle.js","home-settings-gear.js","print-blank-fix.js","pdf-print.js","pwa-version-fix.js"
];
self.addEventListener('install',e=>{e.waitUntil((async()=>{const c=await caches.open(CACHE);try{const r=await fetch(FALLBACK_KEY,{cache:'no-store'});if(r&&r.ok)await c.put(FALLBACK_KEY,r.clone());}catch{}})());self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>(k.includes('label-maker-')||k.startsWith('little-labels-'))&&k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim();})());});
async function injectPatches(response){if(!response)return response;try{let html=await response.text();for(const name of PATCHES){if(!html.includes(name)){html=html.replace('</body>',`<script src="./${name}?v=99"></script></body>`);}}const headers=new Headers(response.headers);headers.delete('content-length');return new Response(html,{status:response.status,statusText:response.statusText,headers});}catch{return response;}}
async function saveFallback(response){try{if(response&&response.ok){const c=await caches.open(CACHE);await c.put(FALLBACK_KEY,response.clone());}}catch{}}
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);
  if(e.request.mode==='navigate'||url.pathname.endsWith('/index.html')){
    e.respondWith((async()=>{
      try{
        const network=await fetch(e.request,{cache:'no-store'});
        saveFallback(network.clone());
        return injectPatches(network);
      }catch{
        const cached=await caches.match(FALLBACK_KEY)||await caches.match('./');
        return cached?injectPatches(cached):Response.error();
      }
    })());
    return;
  }
  e.respondWith((async()=>{
    try{
      const network=await fetch(e.request,{cache:'no-store'});
      if(network&&network.ok){const c=await caches.open(CACHE);c.put(e.request,network.clone()).catch(()=>{});}
      return network;
    }catch{
      return (await caches.match(e.request))||Response.error();
    }
  })());
});