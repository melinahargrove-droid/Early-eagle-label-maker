const CACHE="early-eagle-label-maker-v34";
const APP_SHELL=["./","./index.html?appv=34","./manifest.webmanifest","./icon-192.png","./icon-512.png","./icon-maskable-512.png","./make-list-hotfix.js?v=34"];

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
    const tag='<script src="./make-list-hotfix.js?v=34"></script>';
    const html=text.includes("make-list-hotfix.js") ? text : text.replace("</body>",tag+"</body>");
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
        return await injectHotfix(await caches.match("./index.html?appv=34"));
      }
    })());
    return;
  }
  e.respondWith(fetch(e.request,{cache:"no-store"}).catch(()=>caches.match(e.request)));
});
