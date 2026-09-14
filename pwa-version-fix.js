(()=>{
  const APP_VERSION="104";

  function updateVisibleBuild(){
    document.querySelectorAll('.footer-note span').forEach(el=>{
      if(/App build\s+\d+/i.test(el.textContent||'')) el.textContent=`App build ${APP_VERSION}`;
    });
  }

  // Build 104 deliberately does NOT unregister workers, clear caches,
  // or force a navigation. Those recovery actions can strand an
  // installed PWA on a blank shell. Little Labels now lets the page
  // finish loading normally and keeps PWA recovery separate from UI boot.
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',updateVisibleBuild,{once:true});
  }else{
    updateVisibleBuild();
  }
})();
