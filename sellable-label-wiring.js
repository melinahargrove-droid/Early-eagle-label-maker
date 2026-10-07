(()=>{
  const PAGE_W=8.5,PAGE_H=11,MARGIN=.25,GAP=.08,EPS=.0001;
  const api=()=>window.LittleLabelSettings;
  const settings=()=>api()?.get?.()||{sizes:{business:true},sets:[]};
  const meta=()=>api()?.meta||{};
  const enabledIds=()=>Object.keys(settings().sizes||{}).filter(id=>settings().sizes[id]&&meta()[id]);
  const cleanDims=m=>String(m?.dims||'').split(' · ')[0];
  const sizeString=id=>{const m=meta()[id];if(!m)return id;if(id==='cp')return 'Fold-Over Basket Label · 4.5 × 3 in (folds to 4.5 × 1.5 visible)';return `${m.name} · ${cleanDims(m)}`};
  const sizesFromSet=set=>{const out=[];(set?.items||[]).forEach(([id,q])=>{for(let i=0;i<Number(q||0);i++)out.push(sizeString(id))});return out};
  const eligibleSets=()=>{const s=settings(),on=s.sizes||{};return (s.sets||[]).filter(set=>(set.items||[]).every(([id])=>on[id]&&meta()[id]))};
  function idFromSize(value){const v=String(value||'').toLowerCase();for(const [id,m] of Object.entries(meta())){if(v.includes(String(m.name).toLowerCase()))return id}if(v.includes('cp basket')||v.includes('fold-over basket'))return 'cp';if(v.includes('business card'))return 'business';return 'business'}
  function dimensionFor(item){const id=idFromSize(item?.size);const m=meta()[id]||meta().business||{w:3.375,h:2};return {w:Number(m.w),h:Number(m.h),type:id==='cp'?'cp':id}}

  try{labelDimensions=dimensionFor}catch{}

  function intersects(a,b){return !(a.x+a.w+GAP<=b.x+EPS||b.x+b.w+GAP<=a.x+EPS||a.y+a.h+GAP<=b.y+EPS||b.y+b.h+GAP<=a.y+EPS)}
  function candidates(placed){const pts=[{x:MARGIN,y:MARGIN}];placed.forEach(p=>{pts.push({x:p.x+p.w+GAP,y:p.y});pts.push({x:p.x,y:p.y+p.h+GAP})});const seen=new Set();return pts.filter(p=>{const k=`${p.x.toFixed(4)},${p.y.toFixed(4)}`;if(seen.has(k)||p.x>PAGE_W-MARGIN+EPS||p.y>PAGE_H-MARGIN+EPS)return false;seen.add(k);return true}).sort((a,b)=>(a.y-b.y)||(a.x-b.x))}
  function fits(x,y,w,h,placed){if(x+w>PAGE_W-MARGIN+EPS||y+h>PAGE_H-MARGIN+EPS)return false;return !placed.some(p=>intersects({x,y,w,h},p))}
  function placement(item,placed){const d=dimensionFor(item);const rotatable=d.type!=='cp';const os=rotatable?[{w:d.w,h:d.h,r:false},{w:d.h,h:d.w,r:true}]:[{w:d.w,h:d.h,r:false}];let best=null;for(const pt of candidates(placed))for(const o of os){if(!fits(pt.x,pt.y,o.w,o.h,placed))continue;const rightWaste=(PAGE_W-MARGIN)-(pt.x+o.w),bottomWaste=(PAGE_H-MARGIN)-(pt.y+o.h);const score=pt.y*1000+pt.x*100+rightWaste+bottomWaste*.01;if(!best||score<best.score)best={x:pt.x,y:pt.y,w:o.w,h:o.h,rotated:o.r,score}}return best}
  function smartLayout(items){let pending=items.slice(),pages=[];while(pending.length){const placed=[],used=new Set();const order=pending.map((item,index)=>({item,index,d:dimensionFor(item)})).sort((a,b)=>(b.d.w*b.d.h-a.d.w*a.d.h));let changed=true;while(changed){changed=false;for(const e of order){if(used.has(e.index))continue;const p=placement(e.item,placed);if(!p)continue;placed.push({...e.item,x:p.x,y:p.y,_w:p.w,_h:p.h,_type:e.d.type,_rotated:p.rotated,w:p.w,h:p.h,_sourceIndex:e.index});used.add(e.index);changed=true}}if(!placed.length){const item=pending[0],d=dimensionFor(item);placed.push({...item,x:MARGIN,y:MARGIN,_w:d.w,_h:d.h,_type:d.type,_rotated:false});used.add(0)}pages.push(placed.map(({w,h,_sourceIndex,...p})=>p));pending=pending.filter((_,i)=>!used.has(i))}return pages}
  try{buildPrintLayout=smartLayout}catch{}

  let chosen={mode:'set',id:null};
  const allSets=()=>settings().sets||[];
  const setItems=set=>Array.isArray(set?.items)?set.items:[];
  function unavailableReason(set){
    const quantities=setItems(set).map(([,q])=>Number(q));
    if(!quantities.length||quantities.some(q=>!Number.isSafeInteger(q)||q<1))return 'Edit this combination in Settings to choose sizes and whole-number copy counts.';
    if(quantities.reduce((total,q)=>total+q,0)>100)return 'Edit this combination in Settings to use 100 copies or fewer in total. The saved combination has not been changed.';
    const on=settings().sizes||{},off=[...new Set(setItems(set).filter(([id])=>!on[id]||!meta()[id]).map(([id])=>id))];
    return off.length?'Turn on '+off.map(id=>meta()[id]?.name||id).join(' and ')+' in Settings → Available label sizes to use this combination.':'';
  }
  const selectableSets=()=>eligibleSets().filter(set=>!unavailableReason(set));
  function setDetails(set){return setItems(set).map(([id,q])=>`${q} ${Number(q)===1?'copy':'copies'} of ${meta()[id]?.name||id} · ${cleanDims(meta()[id])}`).join(' + ')}
  function combinationChoice(set,selected,choose){
    const reason=unavailableReason(set),button=document.createElement('button');button.type='button';button.className='choice ll-dynamic-choice'+(selected&&!reason?' selected':'');
    button.disabled=!!reason;button.setAttribute('aria-disabled',String(!!reason));button.setAttribute('aria-pressed',String(selected&&!reason));button.dataset.combinationId=set.id;
    const title=document.createElement('strong');title.textContent=set.name;
    const detail=document.createElement('span');detail.textContent=setDetails(set);button.append(title,detail);
    if(reason){const note=document.createElement('span');note.className='ll-combination-note';note.textContent='Unavailable. '+reason;button.append(note)}
    button.onclick=choose;return button;
  }
  function singleChoice(selected,choose){
    const button=document.createElement('button');button.type='button';button.className='choice ll-dynamic-choice'+(selected?' selected':'');
    button.dataset.singleChoice='true';button.setAttribute('aria-pressed',String(selected));
    button.innerHTML='<strong>Just One Label</strong><span>Choose from your available label sizes</span>';button.onclick=choose;return button;
  }
  function focusChoice(container,id){[...document.getElementById(container).querySelectorAll('button')].find(button=>id===null?button.dataset.singleChoice==='true':button.dataset.combinationId===String(id))?.focus()}
  function setSummary(){
    const box=document.getElementById('setSummary');if(!box)return;let lines=[],name='';
    if(chosen.mode==='single'){const id=document.getElementById('singleSize')?.value;if(meta()[id]){lines=[sizeString(id)];name='1 label'}}
    else{const set=selectableSets().find(s=>s.id===chosen.id)||selectableSets()[0];if(set){chosen.id=set.id;lines=setItems(set).map(([id,q])=>`${q} ${Number(q)===1?'copy':'copies'} · ${sizeString(id)}`);name=set.name}}
    box.innerHTML='';const title=document.createElement('strong');title.textContent=name||'Choose an available combination or Just One Label';box.append(title);
    lines.forEach(line=>{box.append(document.createElement('br'),document.createTextNode(line.replace(' · ',' — ')))});
    if(!enabledIds().length){const note=document.createElement('p');note.textContent='Turn on at least one size in Settings → Available label sizes.';box.append(note)}
  }

  function renderCreateChoices(){
    const sec=document.getElementById('sets');if(!sec)return;sec.querySelectorAll(':scope .choice[data-set]').forEach(x=>x.style.display='none');
    let wrap=document.getElementById('llDynamicSets');const singleWrap=document.getElementById('singleSizeWrap');
    if(!wrap){wrap=document.createElement('div');wrap.id='llDynamicSets';singleWrap?.before(wrap)}wrap.innerHTML='';
    const sets=selectableSets();if(chosen.mode==='set'&&!sets.some(s=>s.id===chosen.id))chosen.id=sets[0]?.id||null;
    allSets().forEach(set=>wrap.append(combinationChoice(set,chosen.mode==='set'&&chosen.id===set.id,()=>{chosen={mode:'set',id:set.id};renderCreateChoices();setSummary();focusChoice('llDynamicSets',set.id)})));
    wrap.append(singleChoice(chosen.mode==='single',()=>{chosen={mode:'single',id:null};renderCreateChoices();setSummary();focusChoice('llDynamicSets',null)}));
    if(singleWrap){singleWrap.classList.toggle('hidden',chosen.mode!=='single');const sel=document.getElementById('singleSize');
      if(sel){const old=sel.value;sel.innerHTML='';enabledIds().forEach(id=>{const option=document.createElement('option');option.value=id;option.textContent=`${meta()[id].name} · ${cleanDims(meta()[id])}`;sel.append(option)});if(enabledIds().includes(old))sel.value=old;sel.onchange=setSummary}}
    const p=sec.querySelector('.card>p.muted');if(p)p.textContent='Choose a saved size-and-copy combination, or make just one label. Unavailable combinations stay here so you can see which sizes to turn on.';setSummary();window.LittleLabelWorkflowSave.lockSingle();
  }

  async function saveCurrent(sizes) { return window.LittleLabelWorkflowSave.single(sizes); }
  function selectedCreateSizes(){if(chosen.mode==='single'){const id=document.getElementById('singleSize')?.value;return id?[sizeString(id)]:[]}const set=selectableSets().find(s=>s.id===chosen.id)||selectableSets()[0];return sizesFromSet(set)}

  function populateBatch(){
    const select=document.getElementById('batchSetSelect');if(!select)return;const old=select.value;select.innerHTML='';
    const unavailable=[];
    allSets().forEach(set=>{const reason=unavailableReason(set),option=document.createElement('option');option.value='set:'+set.id;option.disabled=!!reason;option.textContent=`${set.name} · ${setDetails(set)}${reason?' · Unavailable':''}`;select.append(option);if(reason)unavailable.push(`${set.name}: ${reason}`)});
    enabledIds().forEach(id=>{const option=document.createElement('option');option.value='single:'+id;option.textContent=`Single · ${meta()[id].name} · ${cleanDims(meta()[id])}`;select.append(option)});
    const previous=[...select.options].find(option=>option.value===old&&!option.disabled),fallback=[...select.options].find(option=>!option.disabled);select.value=(previous||fallback)?.value||'';
    let note=document.getElementById('llBatchAvailability');if(!note){note=document.createElement('p');note.id='llBatchAvailability';note.className='ll-combination-note';select.after(note)}
    note.textContent=unavailable.join(' ');note.hidden=!unavailable.length;
    lockBatchSaveControls();
  }

  try{sizesForBatchSet=function(){const v=document.getElementById('batchSetSelect')?.value||'';if(v.startsWith('single:'))return [sizeString(v.slice(7))];if(v.startsWith('set:'))return sizesFromSet(selectableSets().find(s=>s.id===v.slice(4)));return sizesFromSet(selectableSets()[0])}}catch{}

  const reprintPreferenceKey='littleLabelsReprintChoiceV1';
  let reprintChoice={mode:'set',id:null},reprintSize='';
  try{const saved=JSON.parse(localStorage.getItem(reprintPreferenceKey)||'null');if(saved&&['set','single'].includes(saved.mode)){reprintChoice={mode:saved.mode,id:typeof saved.id==='string'?saved.id:null};reprintSize=typeof saved.size==='string'?saved.size:''}}catch{}
  function rememberReprint(){try{localStorage.setItem(reprintPreferenceKey,JSON.stringify({...reprintChoice,size:reprintSize}))}catch{}}
  function reprintSizes(){return reprintChoice.mode==='single'?[sizeString(document.getElementById('reprintSingleSize')?.value)]:sizesFromSet(selectableSets().find(s=>s.id===reprintChoice.id)||selectableSets()[0])}
  function updateReprintSummary(){
    const button=document.getElementById('reprintQueueBtn');if(!button)return;
    let summary=document.getElementById('llReprintSummary');if(!summary){summary=document.createElement('p');summary.id='llReprintSummary';summary.className='ll-combination-note';summary.setAttribute('role','status');button.before(summary)}
    const count=enabledIds().length?(reprintSaveJob&&!reprintSaveJob.complete?reprintSaveJob.sizes.length:reprintSizes().length):0;
    summary.textContent=`${count} ${count===1?'copy':'copies'} will be added to Ready to Print. Your last choice is remembered in this browser.`;
    if(!reprintSaveJob||reprintSaveJob.complete)button.textContent=`Add ${count} ${count===1?'Copy':'Copies'} to Print`;
  }
  function renderReprint(){
    const root=document.getElementById('reprint');if(!root)return;root.querySelectorAll('.reprint-choice').forEach(x=>x.style.display='none');
    let wrap=document.getElementById('llReprintSets');const single=document.getElementById('reprintSingleWrap');
    if(!wrap){wrap=document.createElement('div');wrap.id='llReprintSets';single?.before(wrap)}wrap.innerHTML='';
    const sets=selectableSets();if(reprintChoice.mode==='set'&&!sets.some(s=>s.id===reprintChoice.id))reprintChoice.id=sets[0]?.id||null;
    allSets().forEach(set=>wrap.append(combinationChoice(set,reprintChoice.mode==='set'&&reprintChoice.id===set.id,()=>{reprintChoice={mode:'set',id:set.id};rememberReprint();renderReprint();focusChoice('llReprintSets',set.id)})));
    wrap.append(singleChoice(reprintChoice.mode==='single',()=>{reprintChoice={mode:'single',id:null};rememberReprint();renderReprint();focusChoice('llReprintSets',null)}));
    if(single){single.classList.toggle('hidden',reprintChoice.mode!=='single');const select=document.getElementById('reprintSingleSize');
      if(select){const old=reprintSize||select.value;select.innerHTML='';enabledIds().forEach(id=>{const option=document.createElement('option');option.value=id;option.textContent=`${meta()[id].name} · ${cleanDims(meta()[id])}`;select.append(option)});if(enabledIds().includes(old))select.value=old;select.onchange=()=>{reprintSize=select.value;rememberReprint();updateReprintSummary()}}}
    updateReprintSummary();window.LittleLabelWorkflowSave.lockReprint();
  }

  async function saveReprint(){
    const sizes=reprintSizes();
    if(!sizes.length||!enabledIds().length)return alert('Choose an available combination or turn on a size in Settings first.');
    return window.LittleLabelWorkflowSave.reprint(sizes);
  }


  function install(){const choiceStyles=document.createElement('style');choiceStyles.textContent='.ll-dynamic-choice{text-align:left;font:inherit;white-space:normal;overflow-wrap:anywhere}.ll-dynamic-choice:disabled{opacity:1;cursor:not-allowed;border-style:dashed!important;background:#F7F5F0!important;color:#61758A!important}.ll-combination-note{display:block;font-size:.82rem;line-height:1.45;color:#735B25;margin-top:8px}.ll-dynamic-choice:focus-visible{outline:3px solid #305F85;outline-offset:2px}';document.head.append(choiceStyles);const choose=document.getElementById('chooseSetBtn');choose?.addEventListener('click',()=>setTimeout(renderCreateChoices,0));document.getElementById('addToQueue')?.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();const sizes=selectedCreateSizes();if(!sizes.length)return alert('Choose a label set first.');saveCurrent(sizes)},{capture:true});document.getElementById('reprintQueueBtn')?.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();saveReprint()},{capture:true});const obs=new MutationObserver(()=>{if(!document.getElementById('batchReview')?.classList.contains('hidden'))populateBatch();if(!document.getElementById('reprint')?.classList.contains('hidden'))renderReprint()});['batchReview','reprint'].forEach(id=>{const el=document.getElementById(id);if(el)obs.observe(el,{attributes:true,attributeFilter:['class']})});addEventListener('little-label-settings-changed',()=>{renderCreateChoices();populateBatch();renderReprint()});renderCreateChoices();populateBatch()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
