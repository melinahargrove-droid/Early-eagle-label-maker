const CACHE="early-eagle-label-maker-v39";
const APP_SHELL=["./","./index.html?appv=39","./manifest.webmanifest?v=39","./icon-192.png?v=39","./icon-512.png?v=39","./icon-maskable-512.png?v=39","./make-list-hotfix.js?v=39","./smart-print-layout.js?v=39","./pwa-version-fix.js?v=39"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(APP_SHELL)));self.skipWaiting();});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x.startsWith("early-eagle-label-maker-")&&x!==CACHE).map(x=>caches.delete(x)))));self.clients.claim();});
async function injectHotfix(response){
 if(!response)return response;
 try{
  const text=await response.text();let html=text;
  html=html.replace('href="manifest.webmanifest"','href="manifest.webmanifest?v=39"');
  html=html.replace(/href="icon-192\.png"/g,'href="icon-192.png?v=39"');
  html=html.replace(/href="icon-512\.png"/g,'href="icon-512.png?v=39"');
  const tags=[['make-list-hotfix.js','<script src="./make-list-hotfix.js?v=39"></script>'],['smart-print-layout.js','<script src="./smart-print-layout.js?v=39"></script>'],['pwa-version-fix.js','<script src="./pwa-version-fix.js?v=39"></script>']];
  for(const [needle,tag] of tags) if(!html.includes(needle)) html=html.replace("</body>",tag+"</body>");
  const headers=new Headers(response.headers);headers.delete("content-length");return new Response(html,{status:response.status,statusText:response.statusText,headers});
 }catch{return response;}
}
self.addEventListener("fetch",e=>{if(e.request.method!=="GET")return;const u=new URL(e.request.url);if(e.request.mode==="navigate"||u.pathname.endsWith("/index.html")){e.respondWith((async()=>{try{return await injectHotfix(await fetch(e.request,{cache:"no-store"}));}catch{return await injectHotfix(await caches.match("./index.html?appv=39"));}})());return;}e.respondWith(fetch(e.request,{cache:"no-store"}).catch(()=>caches.match(e.request)));});
