(()=>{
  const setText=(el,text)=>{if(el&&el.textContent!==text)el.textContent=text};
  const setAttr=(el,name,value)=>{if(el&&el.getAttribute(name)!==value)el.setAttribute(name,value)};

  function cleanMeta(){
    if(document.title!=='Little Labels')document.title='Little Labels';
    setAttr(document.querySelector('meta[name="application-name"]'),'content','Little Labels');
    setAttr(document.querySelector('meta[name="apple-mobile-web-app-title"]'),'content','Little Labels');
    setAttr(document.querySelector('meta[name="theme-color"]'),'content','#FCF8F0');
  }

  function cleanBrandText(){
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    const nodes=[];
    while(walker.nextNode())nodes.push(walker.currentNode);
    nodes.forEach(n=>{
      const p=n.parentElement;
      if(!p||['SCRIPT','STYLE'].includes(p.tagName))return;
      let t=n.nodeValue||'';
      t=t.replace(/Early Eagle Academy Classroom Label Maker/gi,'Little Labels')
        .replace(/Early Eagle Label Maker/gi,'Little Labels')
        .replace(/Early Eagle Labels/gi,'Little Labels')
        .replace(/Early Eagle Academy/gi,'');
      if(t!==n.nodeValue)n.nodeValue=t;
    });
    document.querySelectorAll('.home-action.name-label-wide').forEach(x=>x.classList.remove('name-label-wide'));
  }

  function tidyCopy(){
    const recovery=document.getElementById('passwordRecovery');
    if(recovery)setText(recovery.querySelector('p.muted'),'Choose a new password for your Little Labels account.');

    const account=document.getElementById('account');
    if(account)setText(account.querySelector('.card>p.muted'),'Create an account on your phone first to keep everything you already saved, then sign into that same account on your computer.');

    const reprint=document.getElementById('reprint');
    if(reprint)setText(reprint.querySelector('p.muted'),'Use your approved saved picture and wording again without recreating the label.');

    setText(document.querySelector('#nameLabelsOverlay .nl-tip'),'Only label sizes turned on in Settings appear here.');
  }

  function a11y(){
    document.querySelectorAll('[id$="Status"],.status,.batch-status,.mli-picstatus').forEach(x=>{
      setAttr(x,'role','status');
      setAttr(x,'aria-live','polite');
    });
    document.querySelectorAll('button').forEach(b=>{
      const t=(b.textContent||'').trim();
      if(t==='← Back'&&!b.getAttribute('aria-label'))b.setAttribute('aria-label','Back');
    });
    const gear=document.getElementById('littleLabelsSettingsBtn');
    if(gear){
      setAttr(gear,'aria-label','Settings');
      if(gear.title!=='Settings')gear.title='Settings';
    }
  }

  function addCss(){
    if(document.getElementById('llFinalAuditCss'))return;
    const s=document.createElement('style');
    s.id='llFinalAuditCss';
    s.textContent=`.label-en,.label-es,.sheet-page-en,.sheet-page-es,.print-label-en,.print-label-es,.queue-item strong,.queue-item .tiny,.nl-preview strong,.nl-student strong,.mli-item input{overflow-wrap:anywhere;word-break:break-word}.nl-preview strong{max-width:100%;text-align:center;line-height:1.05;font-size:clamp(1.2rem,7vw,2rem)!important}.nl-student strong{min-width:0}.queue-item{min-width:0}.queue-item>div{min-width:0}.home-action strong,.home-action small{overflow-wrap:normal;word-break:normal}.mli-item,.nl-card,.card{min-width:0}button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:3px solid #79AAD1!important;outline-offset:2px}@media(max-width:380px){.nl-tabs,.nl-types{grid-template-columns:1fr!important}.queue-item{align-items:flex-start!important}.queue-actions{min-width:96px!important}}`;
    document.head.append(s);
  }

  function audit(){cleanMeta();cleanBrandText();tidyCopy();a11y()}

  function install(){
    audit();
    addCss();
    let queued=false;
    const obs=new MutationObserver(()=>{
      if(queued)return;
      queued=true;
      setTimeout(()=>{queued=false;audit()},0);
    });
    obs.observe(document.body,{childList:true,subtree:true});
    setTimeout(()=>obs.disconnect(),8000);
  }

  document.readyState==='loading'
    ? document.addEventListener('DOMContentLoaded',install,{once:true})
    : install();
})();
