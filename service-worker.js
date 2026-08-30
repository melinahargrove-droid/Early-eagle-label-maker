const CACHE="early-eagle-label-maker-v36";
const APP_SHELL=["./","./index.html?appv=36","./manifest.webmanifest","./icon-192.png","./icon-512.png","./icon-maskable-512.png","./make-list-hotfix.js?v=36","./pwa-version-fix.js?v=36"];

self.addEventListener("install",e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate",e=>{
  e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x.startsWith("early-eagle-label-maker-")&&x!==CACHE).map(x=>caches.delete(x)))));
  self.clients.claim();
});

async function injectHotfix(response){
  if(!response) return response;
  try{
    const text=await response.text();
    const listTag='<script src="./make-list-hotfix.js?v=36"></script>';
    const versionTag='<script src="./pwa-version-fix.js?v=36"></script>';
    let html=text;
    if(!html.includes("make-list-hotfix.js")) html=html.replace("</body>",listTag+"</body>");
    if(!html.includes("pwa-version-fix.js")) html=html.replace("</body>",versionTag+"</body>");
    const headers=new Headers(response.headers);
    headers.delete("content-length");
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }catch{
    return response;
  }
}

self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET") return;
  const u=new URL(e.request.url);
  if(e.request.mode==="navigate"||u.pathname.endsWith("/index.html")){
    e.respondWith((async()=>{
      try{
        return await injectHotfix(await fetch(e.request,{cache:"no-store"}));
      }catch{
        return await injectHotfix(await caches.match("./index.html?appv=36"));
      }
    })());
    return;
  }
  e.respondWith(fetch(e.request,{cache:"no-store"}).catch(()=>caches.match(e.request)));
});
