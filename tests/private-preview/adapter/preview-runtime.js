/* Isolated review adapter. All saved classroom content remains in this origin's
 * localStorage. It provides the original save workflow's storage contract only;
 * there is no customer login, purchased entitlement, credit balance or AI service. */
(() => {
  'use strict';
  const KEY = 'little-labels-isolated-preview-v1';
  const clone = value => JSON.parse(JSON.stringify(value));
  let problem = '', storageReady = false;
  const audit = { blocked: [], localReads: 0, localWrites: 0 };
  const valid = value => value && value.version === 1 && Array.isArray(value.labels) && Array.isArray(value.print_queue);
  const empty = () => ({version:1,labels:[],print_queue:[]});
  function read() {
    let raw;
    try { raw = localStorage.getItem(KEY); }
    catch { throw Error('Browser storage is unavailable. Keep this page open; saving is disabled.'); }
    if (!raw) return empty();
    let value; try { value = JSON.parse(raw); } catch {}
    if (!valid(value)) throw Error('The saved preview data could not be read. It has not been overwritten. Use a different browser for a fresh test.');
    return value;
  }
  function write(value) {
    if (!storageReady) throw Error(problem || 'Preview storage is not ready.');
    const raw = JSON.stringify(value);
    try { localStorage.setItem(KEY,raw); }
    catch { throw Error('Browser storage is full or unavailable. This change was not saved. Keep the page open, remove unneeded test labels, then retry.'); }
    if (localStorage.getItem(KEY) !== raw) throw Error('The browser did not retain this save. Keep this page open and retry.');
    audit.localWrites++; problem='';
  }
  const blocked = target => {
    audit.blocked.push(String(target));
    throw Error('This isolated preview does not connect to accounts, AI, payments, or external services.');
  };
  // No real transport is retained. Even accidental calls to the former backend
  // are rejected; local storage responses never leave the browser.
  window.fetch = async (input, options={}) => {
    const target = typeof input === 'string' ? input : input.url;
    const url = new URL(target,location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith('/__preview/rest/v1/')) return blocked(url.href);
    try {
      const name = url.pathname.split('/').pop();
      if (!['labels','print_queue'].includes(name)) return blocked(url.href);
      const method = String(options.method || 'GET').toUpperCase();
      let value = read(), rows = value[name];
      const matches = row => (!url.searchParams.has('id') || url.searchParams.get('id') === 'eq.' + row.id)
        && (!url.searchParams.has('printed_at') || (url.searchParams.get('printed_at') === 'is.null' && !row.printed_at));
      let result;
      if (method === 'GET') {
        audit.localReads++;
        result = rows.filter(matches);
        if (url.searchParams.get('order') === 'created_at.desc') result = [...result].reverse();
      } else if (method === 'POST') {
        const incoming = JSON.parse(options.body);
        if (!Array.isArray(incoming) || incoming.some(x => !x.id)) throw Error('The label save was invalid.');
        for (const row of incoming) if (!rows.some(x=>x.id===row.id)) rows.push({...row,created_at:new Date().toISOString()});
        write(value); result=incoming;
      } else if (method === 'PATCH') {
        const patch=JSON.parse(options.body);
        value[name]=rows.map(row=>matches(row)?{...row,...patch}:row);
        write(value);result=value[name].filter(matches);
      } else if (method === 'DELETE') {
        result=rows.filter(matches);value[name]=rows.filter(row=>!matches(row));write(value);
      } else return blocked(url.href);
      return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
    } catch(error) {
      problem=error.message;window.LittleLabelsPreview?.refresh();
      return new Response(JSON.stringify({message:error.message}),{status:507,headers:{'Content-Type':'application/json'}});
    }
  };
  // Other network-capable APIs are blocked, independently of the CSP.
  if (window.XMLHttpRequest) XMLHttpRequest.prototype.open=function(_method,url){blocked(url)};
  window.WebSocket=function(url){blocked(url)};
  window.EventSource=function(url){blocked(url)};
  if (navigator.sendBeacon) navigator.sendBeacon=()=>false;
  if (navigator.serviceWorker) navigator.serviceWorker.register=async()=>blocked('service worker');
  const originalOpen=window.open.bind(window);
  window.open=(url,target,features)=> (!url || url==='about:blank' || String(url).startsWith('blob:')) ? originalOpen(url,target,features) : blocked(url);
  function text(id,value){const el=document.getElementById(id);if(el&&el.textContent!==value)el.textContent=value;}
  function refresh() {
    const state = problem ? problem : 'Saved only in this browser';
    text('homeSyncStatus',state);
    text('accountStatusText','Isolated test preview');
    text('accountStatusSub','No app account or device sync');
    const banner=document.getElementById('previewStorageStatus');
    if(banner) {text('previewStorageStatus',problem || 'Photos and saved labels stay in this browser. Clearing its data removes them. Nothing is sent to AI.');banner.setAttribute('role',problem?'alert':'note');}
    document.querySelectorAll('.ll-ai-balance').forEach(el=>{if(el.textContent!=='AI is disabled in this preview.')el.textContent='AI is disabled in this preview.'});
    document.querySelectorAll('.ll-ai-note').forEach(el=>{const value='Type the wording yourself. No credits or paid actions are connected here.';if(el.textContent!==value)el.textContent=value});
    const status=document.getElementById('singleSaveStatus');
    if(status?.textContent==='Saved to your account.')status.textContent='Saved only in this browser.';
    const footer=document.querySelector('.footer-note');
    const footerText='Test labels are saved only in this browser. They remain after reload, but clearing browser data removes them. This preview has no account or cloud sync.';
    if(footer && footer.textContent!==footerText)footer.textContent=footerText;
    document.querySelectorAll('#mliTranslate,#mliAllPics,.mli-picbtn,#productLinkStartBtn,#startBatchPhotoBtn,#normalCleanupBtn,#strongCleanupBtn,#retryCleanupBtn').forEach(el=>{el.disabled=true;el.title='Unavailable in this isolated manual-label preview'});
  }
  async function initialize() {
    // Adapt the existing persistence branch without a real or simulated login.
    updateSyncStatus=refresh;
    updateAccountUI=()=>{ensureSyncOwner();refresh();};
    showWorkflowSaveNotice=(destination,copies)=>{
      const el=document.getElementById(destination==='library'?'librarySaveNotice':'queueSaveNotice');
      if(el){el.className='status ok';el.textContent='Saved only in this browser.'+(copies?` ${copies} ${copies===1?'copy is':'copies are'} ready to print.`:'');}
    };
    try { read(); const probe=KEY+':probe';localStorage.setItem(probe,'ok');localStorage.removeItem(probe);storageReady=true; }
    catch(error){problem=error.message;}
    currentUser={id:'browser-only-preview',is_anonymous:true};
    cloudSession={access_token:'local-storage-adapter-only',user:currentUser};
    cloudReady=true;observeCloudSession();
    const sourceShow=show;
    show=function(id){if(['account','passwordRecovery'].includes(id)){alert('Accounts are unavailable in this preview. Labels save only in this browser.');return;}return sourceShow(id)};
    const notice=document.createElement('aside');notice.id='previewNotice';notice.innerHTML='<strong>Test preview — saved only in this browser</strong><span id="previewStorageStatus"></span><span class="preview-small">Try object photos and fictional names. Accounts, AI, purchases and cloud sync are disabled.</span>';
    document.body.prepend(notice);
    new ResizeObserver(()=>document.documentElement.style.setProperty('--preview-banner-height',notice.offsetHeight+'px')).observe(notice);
    new MutationObserver(refresh).observe(document.body,{childList:true,subtree:true,characterData:true});
    document.addEventListener('click',event=>{
      const link=event.target.closest('a[href]');
      if(link){const url=new URL(link.href,location.href);if(url.origin!==location.origin&&!['blob:','data:'].includes(url.protocol)){event.preventDefault();event.stopImmediatePropagation();alert('External links are disabled in this test preview.');}}
      const button=event.target.closest('#homeProductBtn,#homeBatchBtn,#accountBtn,#llCleanupToggle');
      if(button){event.preventDefault();event.stopImmediatePropagation();alert('This test preview is for manual labels. Accounts, product lookup, batch photo AI and background cleanup are disabled.');}
    },true);
    document.addEventListener('submit',event=>{event.preventDefault();event.stopImmediatePropagation();},true);
    try{await loadCloudData()}catch(error){problem=error.message;}
    refresh();window.__previewReady=true;
  }
  window.LittleLabelsPreview={initialize,refresh,audit,key:KEY};
})();
