(()=>{
  let active=false, activeIdentity='', pending=null, revision=0, wasAccountScreen=false, activatingIdentity='';
  const $=id=>document.getElementById(id);
  const permanent=()=>typeof userIsPermanent==='function'&&userIsPermanent(currentUser);
  const identity=()=>JSON.stringify([currentUser?.id||'',cloudSession?.access_token||'',permanent()]);
  const accountScreen=()=>['account','passwordRecovery'].some(id=>$(id)&&!$(id).classList.contains('hidden'));
  let gateVisible=false,returnFocus=null,lastMode=null;
  const backgroundState=new Map();
  function visible(el){return !!el&&el.isConnected&&!el.closest('.hidden,.lla-hidden,.tl-hidden,.mli-hidden,.hide,[inert]')&&getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility!=='hidden'}
  function focusables(){return [...$('llAccessGate').querySelectorAll('button,input,select,textarea,a[href],[tabindex]')].filter(el=>!el.disabled&&el.tabIndex>=0&&visible(el))}
  function focusGate(){const first=focusables()[0]||$('llAccessGate');first?.focus({preventScroll:true})}
  function lockBackground(){
    if(!globalThis.document?.body)return;
    for(const el of document.body.children){
      if(el.id==='llAccessGate'||['SCRIPT','STYLE'].includes(el.tagName))continue;
      if(!backgroundState.has(el))backgroundState.set(el,{inert:el.inert,aria:el.getAttribute('aria-hidden')});
      el.inert=true;el.setAttribute('aria-hidden','true');
    }
  }
  function setGateVisible(show){
    const gate=$('llAccessGate');
    if(show&&!gateVisible){returnFocus=document.activeElement;gateVisible=true;lockBackground();}
    gate.classList.toggle('lla-hidden',!show);gate.style.pointerEvents=show?'auto':'none';
    if(show){
      lockBackground();
      if(!gate.contains(document.activeElement)||!visible(document.activeElement))focusGate();
    }else if(gateVisible){
      gateVisible=false;
      for(const [el,state] of backgroundState){el.inert=state.inert;if(state.aria===null)el.removeAttribute('aria-hidden');else el.setAttribute('aria-hidden',state.aria);}
      backgroundState.clear();
      const target=accountScreen()?($('passwordRecovery')&&!$('passwordRecovery').classList.contains('hidden')?$('newRecoveryLinkBtn'):$('accountBack')):
        visible(returnFocus)&&returnFocus!==document.body&&!returnFocus.disabled?returnFocus:$('homeGalleryBtn');
      target?.focus({preventScroll:true});returnFocus=null;
    }
  }

  function render(mode){
    const gate=$('llAccessGate');
    if(!gate)return;
    const allowed=active&&activeIdentity===identity();

    for(const [id,name] of [['llaActivatePane','activate'],['llaAccountPane','account'],['llaCheckingPane','checking']]) $(id).classList.toggle('lla-hidden',mode!==name);
    $('llaManageAccount').classList.toggle('lla-hidden',mode==='account');
    $('llaRetryAccess').classList.toggle('lla-hidden',mode!=='activate'||!!activatingIdentity);
    gate.setAttribute('aria-labelledby',mode==='checking'?'llaCheckingTitle':mode==='account'?'llaAccountTitle':'llaActivateTitle');
    setGateVisible(!accountScreen()&&!allowed);
    if(gateVisible&&mode!==lastMode)focusGate();
    lastMode=mode;
  }
  async function rpc(fn,args={}){
    const token=cloudSession?.access_token;
    if(!token)throw Error('Sign in first.');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    let r;
    try{r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`,{method:'POST',headers:{apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(args),signal:controller.signal});}
    finally{clearTimeout(timer)}
    let d={};try{d=await r.json()}catch{}
    if(!r.ok){const error=Error('Could not check access.');error.status=r.status;throw error;}
    return d;
  }
  function check(){
    const key=identity();
    active=false;
    if(!permanent()){
      revision++;pending=null;render('account');return Promise.resolve(false);
    }
    if(activatingIdentity===key){render('activate');return Promise.resolve(false)}
    render('checking');
    if(pending?.key===key)return pending.promise;
    const request=++revision;
    const promise=(async()=>{
      try{
        const d=await rpc('little_labels_access_status');
        if(request!==revision||key!==identity())return false;
        active=d?.active===true;activeIdentity=key;
        $('llaStatus').textContent='';
        render('activate');return active;
      }catch(e){
        if(request!==revision||key!==identity())return false;
        active=false;$('llaStatus').textContent='Could not verify access. Check your connection and try again.';
        render('activate');return false;
      }finally{if(pending?.request===request)pending=null}
    })();
    pending={key,request,promise};return promise;
  }
  async function activate(){
    const input=$('llaCode'),status=$('llaStatus'),btn=$('llaActivate');
    if(btn.disabled)return;
    const code=(input.value||'').trim();
    if(!code){status.textContent='Enter the activation code from your Little Labels purchase.';return}
    if(!permanent()){check();return}
    const key=identity(),request=++revision;pending=null;activatingIdentity=key;
    btn.disabled=true;btn.textContent='Activating…';status.textContent='';
    try{
      const d=await rpc('activate_little_labels',{code_input:code});
      if(request!==revision||key!==identity())return;
      if(!d?.success){
        const publicMessages=['Sign in with a permanent account first.','That activation code was not found.','That activation code is no longer active.','That activation code has already been used.'];
        const error=Error('Activation failed');error.publicMessage=publicMessages.includes(d?.error)?d.error:'That code could not be activated. Check the code in your Start Here guide and try again.';throw error;
      }
      active=true;activeIdentity=key;status.textContent='✓ Little Labels is activated!';
      render('activate');
    }catch(e){if(request===revision&&key===identity())status.textContent=e.publicMessage||(e.status===429?'Too many attempts. Please wait a minute, then try again.':'Could not activate right now. Check your connection and try again.')}
    finally{if(activatingIdentity===key)activatingIdentity='';btn.disabled=false;btn.textContent='Activate Little Labels';if(key===identity())render('activate')}
  }
  function onNavigate(id){
    const returning=wasAccountScreen;
    wasAccountScreen=id==='account'||id==='passwordRecovery';
    if(wasAccountScreen)setGateVisible(false);
    else if(!returning&&active&&activeIdentity===identity())render('activate');
    else check();
  }
  function openAccount(){if(typeof show==='function')show('account')}
  function install(){
    const o=document.createElement('div');o.id='llAccessGate';
    o.innerHTML=`<div class="lla-wrap"><div class="lla-card"><div class="lla-heart">♡</div><div id="llaCheckingPane" class="lla-hidden"><h1 id="llaCheckingTitle">Checking access…</h1><p>Please wait while we check this account’s Little Labels purchase.</p></div><div id="llaActivatePane"><div class="lla-kicker">One-Time Setup</div><h1 id="llaActivateTitle">Activate Little Labels</h1><p>Your purchase includes access for one Little Labels account. Enter the activation code from your Start Here guide.</p><label for="llaCode">Activation code</label><input id="llaCode" aria-describedby="llaStatus" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX"><button id="llaActivate">Activate Little Labels</button><div id="llaStatus" class="lla-status" role="status" aria-live="polite"></div><div class="lla-note">Once activated, just sign into this same account on your phone or computer. You won't need to enter the code again.</div></div><div id="llaAccountPane" class="lla-hidden"><div class="lla-kicker">Almost There</div><h1 id="llaAccountTitle">Sign in to activate</h1><p>Little Labels access belongs to your account, so first create or sign into the account you'll use on your devices.</p><button id="llaAccount">Create or Sign In</button><div class="lla-note">After you're signed in, you'll come right back here to enter your purchase activation code.</div></div><button id="llaRetryAccess" class="lla-hidden">Check access again</button><button id="llaManageAccount" class="lla-hidden">Sign in with another account</button></div></div>`;
    o.setAttribute('role','dialog');o.setAttribute('aria-modal','true');o.setAttribute('tabindex','-1');
    document.body.append(o);
    document.addEventListener('keydown',e=>{
      if(!gateVisible)return;
      if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();return;}
      if(e.key!=='Tab')return;
      const items=focusables(),first=items[0],last=items[items.length-1];
      if(!items.length){e.preventDefault();o.focus();}
      else if(e.shiftKey&&(document.activeElement===first||!items.includes(document.activeElement))){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&(document.activeElement===last||!items.includes(document.activeElement))){e.preventDefault();first.focus();}
    },true);
    document.addEventListener('focusin',e=>{if(gateVisible&&!o.contains(e.target))focusGate()},true);
    new MutationObserver(()=>{if(gateVisible)lockBackground()}).observe(document.body,{childList:true});
    $('llaRetryAccess').onclick=check;$('llaActivate').onclick=activate;$('llaAccount').onclick=openAccount;$('llaManageAccount').onclick=openAccount;
    $('llaCode').addEventListener('keydown',e=>{if(e.key==='Enter')activate()});
    wasAccountScreen=accountScreen();
    window.LittleLabelsAccess={check,onNavigate,isActive:()=>active&&activeIdentity===identity()};
    document.addEventListener('little-label-auth-updated',check);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)check()});
    window.addEventListener('focus',check);
    check();
  }
const s=document.createElement('style');s.textContent=`#llAccessGate{position:fixed;inset:0;z-index:30000;background:#FCF8F0;overflow:auto;color:#17375E}.lla-hidden{display:none!important}#llAccessGate :focus-visible{outline:3px solid #17375E!important;outline-offset:4px}.lla-card button:disabled{opacity:.65;cursor:wait}.lla-wrap{min-height:100%;display:flex;align-items:center;justify-content:center;padding:24px 16px}.lla-card{width:100%;max-width:430px;background:#FFFDF9;border:1px solid #DDE6EC;border-radius:28px;padding:24px;box-shadow:0 16px 45px rgba(23,55,94,.10);text-align:center}.lla-heart{width:58px;height:58px;border-radius:50%;background:#EEF7FD;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;font-size:2rem;color:#D4A23E}.lla-kicker{display:inline-block;background:#EEF7FD;border-radius:999px;padding:6px 10px;font-size:.76rem;letter-spacing:.05em}.lla-card h1{font:500 1.85rem Georgia,serif;margin:10px 0 8px}.lla-card p{color:#4E6175;line-height:1.45}.lla-card label{display:block;text-align:left;margin:18px 0 6px;font-weight:700}.lla-card input{width:100%;padding:14px;border:1px solid #CBD9E4;border-radius:14px;text-align:center;font-size:1.05rem;letter-spacing:.08em;text-transform:uppercase;background:#fff;color:#17375E}.lla-card button{width:100%;margin-top:12px;padding:14px;border:0;border-radius:17px;background:#BEDBF0;color:#17375E;font:inherit;font-weight:800}.lla-status{min-height:22px;margin-top:10px;color:#8B4D49;font-size:.88rem}.lla-note{margin-top:16px;padding:12px;border-radius:15px;background:#EEF7FD;color:#4E6175;font-size:.83rem;line-height:1.4}`;document.head.append(s);document.readyState==='loading'?document.addEventListener('DOMContentLoaded',install,{once:true}):install()})();