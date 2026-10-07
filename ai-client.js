// Central request path for all Little Labels AI tools. Never send a draft as a new account.
let littleLabelsAIAuthRevision=0;
document.addEventListener('little-label-auth-updated',()=>{littleLabelsAIAuthRevision++});
async function littleLabelsAIFetch(url,options={}){
  const allowed=['identify-material','translate-label','batch-labels','batch-wording','label-picture'].map(name=>`${SUPABASE_URL}/functions/v1/${name}`);
  if(!allowed.includes(url))throw Error('Unrecognized Little Labels AI endpoint.');
  const owner=currentUser?.id,token=cloudSession?.access_token,revision=littleLabelsAIAuthRevision;
  if(!owner||!token||!userIsPermanent(currentUser))throw Error('Sign in with a permanent account to use Little Labels.');
  const sameIdentity=()=>currentUser?.id===owner&&cloudSession?.access_token===token&&littleLabelsAIAuthRevision===revision&&userIsPermanent(currentUser);
  await globalThis.LittleLabelsOwnerAI.requireOwner();
  if(!sameIdentity() || options.isCurrent?.()===false || options.signal?.aborted)throw Error('This action was cancelled before anything was sent.');
  const {isCurrent,...requestOptions}=options;
  const headers=new Headers(options.headers||{});
  headers.set('apikey',SUPABASE_PUBLISHABLE_KEY);
  headers.set('Authorization',`Bearer ${token}`);
  const response=await fetch(url,{...requestOptions,headers,redirect:'error'});
  if(!sameIdentity())throw Error('Your account changed. Please try again from the current account.');
  // A retry after refresh could accidentally reuse a draft under another account.
  if(response.status===401)throw Error('Your sign-in expired. Sign in again, then retry this tool.');
  // Callers parse asynchronously. Keep the ownership check through response consumption.
  const readJSON=response.json.bind(response);
  response.json=async()=>{const value=await readJSON();if(!sameIdentity())throw Error('Your account changed. Please try again from the current account.');return value};
  return response;
}

// This capability is UI guidance only. Every Edge Function verifies the same
// existing protected owner RPC again; no browser flag authorizes provider use.
(() => {
  let key = '', allowed = false, expires = 0, generation = 0, pending = null;
  const identity = () => JSON.stringify([currentUser?.id || '', cloudSession?.access_token || '', littleLabelsAIAuthRevision,
    !!currentUser && userIsPermanent(currentUser)]);
  function isOwner() { return allowed && key === identity() && expires > Date.now(); }
  function notify() {
    if (typeof globalThis.dispatchEvent === 'function' && typeof CustomEvent === 'function') globalThis.dispatchEvent(new CustomEvent('little-label-owner-ai-updated'));
  }
  function invalidate() { generation++; pending?.controller.abort(); pending = null; key = ''; allowed = false; expires = 0; notify(); }
  async function check(fresh = false) {
    const now = identity();
    if (!currentUser?.id || !cloudSession?.access_token || !userIsPermanent(currentUser)) { if (key || allowed) invalidate(); return false; }
    if (!fresh && key === now && expires > Date.now()) return allowed;
    if (pending?.key === now) return pending.promise;
    const request = ++generation, controller = new AbortController(), token = cloudSession.access_token;
    const prior = isOwner(), timer = setTimeout(() => controller.abort(), 10000);
    const promise = (async () => {
      try {
        const values = [];
        for (const name of ['little_labels_access_status','little_labels_admin_status']) {
          const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, { method:'POST', signal:controller.signal,
            headers:{apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:'{}' });
          if (!response.ok) throw Error('Owner access could not be verified.');
          values.push(await response.json());
        }
        if (request !== generation || now !== identity()) return false;
        allowed = values[0]?.active === true && values[1]?.is_admin === true; key = now; expires = Date.now() + 30000;
        if (allowed !== prior) notify();
        return allowed;
      } catch {
        if (request === generation && now === identity()) { allowed = false; key = now; expires = Date.now() + 3000; if (prior) notify(); }
        return false;
      } finally { clearTimeout(timer); if (pending?.request === request) pending = null; }
    })();
    pending = {key:now,request,controller,promise}; return promise;
  }
  async function requireOwner() {
    if (!(await check(true))) { const error = Error('These optional tools are not available for this account. Your manual labels still work.'); error.code = 'OWNER_AI_REQUIRED'; throw error; }
  }
  async function authorize(description, current = () => true, local = false) {
    const before = identity();
    if (!(await check())) { globalThis.LittleLabelsFeatureInfo?.open(); return false; }
    if (before !== identity() || !current()) return false;
    const notice = local === 'retrieval'
      ? `${description}\n\nThis uses owner access to retrieve the retailer page and photo. It does not request AI processing or use customer credits. Continue?`
      : local
      ? `${description}\n\nThis processes the photo in your browser using downloaded model files. It does not call the paid image provider. Continue?`
      : `${description}\n\nThis uses your verified owner access. No customer credits or credit purchase are required. The external AI service still charges provider usage. Continue?`;
    if (!globalThis.confirm(notice)) return false;
    return before === identity() && isOwner() && current();
  }
  globalThis.LittleLabelsOwnerAI = Object.freeze({check,isOwner,requireOwner,authorize,invalidate});
  document.addEventListener('little-label-auth-updated', () => { invalidate(); void check(); });
  document.addEventListener('little-label-account-changed', invalidate);
  document.addEventListener('little-label-navigation',()=>{void check();});
  if (typeof globalThis.addEventListener === 'function') globalThis.addEventListener('focus',()=>{ void check(true); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',()=>{ void check(); },{once:true});
  else if (document.readyState) void check();
})();
