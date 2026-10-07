(() => {
  const KEY='littleLabelsSettingsV3',OLD=['littleLabelsSettingsV2','littleLabelsSettingsV1'];
  const meta={business:{name:'Business Card',dims:'3.375 × 2 in',w:3.375,h:2,group:'Everyday'},small:{name:'Small Label',dims:'3 × 2 in',w:3,h:2,group:'Everyday'},'3x5-landscape':{name:'3 × 5 Landscape',dims:'5 × 3 in',w:5,h:3,group:'Everyday'},'3x5-portrait':{name:'3 × 5 Portrait',dims:'3 × 5 in',w:3,h:5,group:'Everyday'},'4x6-landscape':{name:'4 × 6 Landscape',dims:'6 × 4 in',w:6,h:4,group:'Everyday'},'4x6-portrait':{name:'4 × 6 Portrait',dims:'4 × 6 in',w:4,h:6,group:'Everyday'},'half-page':{name:'Half-Page Sign',dims:'8 × 5 in · printer-safe',w:8,h:5,group:'Signs & Large Labels'},'full-page':{name:'Full-Page Sign',dims:'8 × 10.5 in · printer-safe',w:8,h:10.5,group:'Signs & Large Labels'},cp:{name:'Fold-Over Basket Label',dims:'4.5 × 3 in · folds to 4.5 × 1.5 visible',w:4.5,h:3,group:'Specialty'}};const langs={none:'English Only',es:'Spanish',fr:'French',ar:'Arabic',zh:'Chinese',vi:'Vietnamese',de:'German',it:'Italian',pt:'Portuguese',ko:'Korean',ja:'Japanese',ht:'Haitian Creole'};
  const defaults={sizes:{business:true,small:false,'3x5-landscape':true,'3x5-portrait':false,'4x6-landscape':false,'4x6-portrait':false,'half-page':false,'full-page':false,cp:true},sets:[{id:'matching',name:'Two Matching Labels',items:[['business',2]]},{id:'different',name:'Business Card + Basket',items:[['business',1],['cp',1]]}],language:'es'};
  const MAX_COPIES=100;
  const clone=value=>JSON.parse(JSON.stringify(value));
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const known=id=>Object.prototype.hasOwnProperty.call(meta,id);
  const items=set=>Array.isArray(set?.items)?set.items:[];
  function load(){
    try{
      let raw=localStorage.getItem(KEY);
      if(!raw)for(const key of OLD){raw=localStorage.getItem(key);if(raw)break}
      const parsed=raw?JSON.parse(raw):{},saved=parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{};
      return {...saved,sizes:{...defaults.sizes,...(saved.sizes||{})},sets:Array.isArray(saved.sets)?saved.sets:clone(defaults.sets),language:saved.language||'es'};
    }catch{return clone(defaults)}
  }
  let state=load(),draft=null,returnFocus=null;
  function announce(message){if($('llsSettingsStatus'))$('llsSettingsStatus').textContent=message}
  function save(next){
    try{localStorage.setItem(KEY,JSON.stringify(next))}
    catch{announce('Changes could not be saved. Browser storage is unavailable.');return false}
    state=next;
    dispatchEvent(new CustomEvent('little-label-settings-changed',{detail:state}));
    announce('Saved on this browser.');
    return true;
  }
  const dimensions=id=>known(id)?`${meta[id].w} inches wide × ${meta[id].h} inches high`:String(id||'Unknown size');
  function unavailable(set){return [...new Set(items(set).filter(row=>!Array.isArray(row)||!known(row[0])||!state.sizes[row[0]]).map(row=>Array.isArray(row)?row[0]:'Unknown size'))]}
  function description(set){return items(set).map(row=>{
    if(!Array.isArray(row))return 'Unknown size';
    const [id,q]=row;
    return `${q} ${Number(q)===1?'copy':'copies'} of ${meta[id]?.name||id} · ${dimensions(id)}`;
  }).join(' + ')}
  function availabilityNote(set){
    const quantities=items(set).map(row=>Array.isArray(row)?Number(row[1]):NaN);
    if(!quantities.length||quantities.some(q=>!Number.isSafeInteger(q)||q<1))return 'Not available for new print jobs. Edit this combination to choose sizes and whole-number copy counts.';
    if(quantities.reduce((total,q)=>total+q,0)>MAX_COPIES)return `Not available for new print jobs. Edit this combination to use ${MAX_COPIES} copies or fewer in total. Your saved combination has not been changed.`;
    const off=unavailable(set);
    return off.length?'Not available for new print jobs. Turn on '+off.map(id=>meta[id]?.name||id).join(' and ')+' in Available label sizes, or edit this combination.':'';
  }
  function renderSizes(){
    const box=$('llsSizes');box.innerHTML='';let last='';
    for(const [id,m] of Object.entries(meta)){
      if(m.group!==last){last=m.group;const group=document.createElement('div');group.className='lls-group';group.textContent=last;box.append(group)}
      const row=document.createElement('label');row.className='lls-row';row.htmlFor='lls-size-'+id;
      const shapeWidth=56*m.w/Math.max(m.w,m.h),shapeHeight=56*m.h/Math.max(m.w,m.h);
      row.innerHTML=`<span class="lls-size-visual" aria-hidden="true"><span data-size-preview="${id}" class="lls-size-shape ${id==='cp'?'lls-fold-shape':''}" style="width:${shapeWidth}px;height:${shapeHeight}px"></span></span><span class="lls-size-copy"><strong>${esc(m.name)}</strong><small>${esc(dimensions(id))}</small>${id==='cp'?'<small>Before folding · 4.5 × 1.5 inches visible after folding</small>':id==='half-page'||id==='full-page'?'<small>Printer-safe label area on Letter paper</small>':''}<span class="lls-availability">Show when creating labels: <b>${state.sizes[id]?'On':'Off'}</b></span></span><span class="lls-switch"><input id="lls-size-${id}" data-size-id="${id}" type="checkbox" aria-label="Show ${esc(m.name)} when creating labels" ${state.sizes[id]?'checked':''}><span class="lls-track"><span class="lls-thumb"></span></span></span>`;
      const input=row.querySelector('input');
      input.onchange=()=>{
        const next={...state,sizes:{...state.sizes,[id]:input.checked}};
        if(!save(next)){input.checked=!!state.sizes[id];return}
        row.querySelector('.lls-availability b').textContent=input.checked?'On':'Off';
        renderSetList();updateEditorAvailability();
      };
      box.append(row);
    }
  }
  function renderSetList(){
    const box=$('llsSets');if(!box)return;box.innerHTML='';
    if(!state.sets.length){const empty=document.createElement('p');empty.className='lls-muted';empty.textContent='No saved combinations yet. You can still choose one label size when you review a label.';box.append(empty)}
    state.sets.forEach((set,index)=>{
      const card=document.createElement('div');card.className='lls-set';
      const title=document.createElement('strong');title.textContent=set?.name||'Unnamed combination';
      const detail=document.createElement('small');detail.textContent=description(set)||'No sizes in this combination.';
      card.append(title,detail);
      const note=availabilityNote(set);
      if(note){const warning=document.createElement('p');warning.className='lls-unavailable';warning.textContent=note;card.append(warning)}
      const edit=document.createElement('button');edit.type='button';edit.className='lls-edit-set secondary';edit.dataset.setIndex=index;edit.dataset.editSet=index;edit.textContent='Edit combination';edit.onclick=()=>editSet(index);card.append(edit);
      if(!['matching','different'].includes(set?.id)){
        const remove=document.createElement('button');remove.type='button';remove.className='danger lls-delete-set';remove.textContent='Remove combination';
        remove.onclick=()=>{if(draft)return;const next={...state,sets:state.sets.filter((_,i)=>i!==index)};if(save(next))renderSetList()};card.append(remove);
      }
      box.append(card);
    });
    box.hidden=!!draft;if($('llsAdd'))$('llsAdd').hidden=!!draft;
  }
  function rowChoices(selected){
    const values=Object.entries(meta).map(([id,m])=>`<option value="${id}" ${id===selected?'selected':''}>${esc(m.name)} · ${m.w} × ${m.h} in${state.sizes[id]?'':' (turned off)'}</option>`);
    if(selected&&!known(selected))values.unshift(`<option value="${esc(selected)}" selected>Unknown size: ${esc(selected)}</option>`);
    return values.join('');
  }
  function addRow(id,quantity=1){
    const selected=id||Object.keys(meta).find(key=>state.sizes[key])||Object.keys(meta)[0];
    const row=document.createElement('div');row.className='lls-editor-row';row.dataset.setRow='';
    const token='lls-row-'+(++addRow.sequence);
    row.innerHTML=`<div class="lls-editor-size"><label for="${token}-size">Label size</label><select class="lls-set-size lls-select" id="${token}-size">${rowChoices(selected)}</select></div><div class="lls-editor-quantity"><label for="${token}-quantity">Copies</label><input class="lls-set-quantity" id="${token}-quantity" type="number" inputmode="numeric" min="1" max="100" step="1" required value="${esc(quantity)}"></div><button type="button" class="lls-remove-row secondary" data-remove-row="">Remove size</button>`;
    row.querySelector('.lls-remove-row').onclick=()=>{row.remove();updateEditorAvailability();$('llsAddRow').focus()};
    row.querySelector('select').onchange=updateEditorAvailability;
    $('llsSetRows').append(row);
    return row;
  }
  addRow.sequence=0;
  function updateEditorAvailability(){
    if(!draft)return;
    $('llsSetRows').querySelectorAll('select').forEach(select=>{const value=select.value;select.innerHTML=rowChoices(value)});
    const ids=[...$('llsSetRows').querySelectorAll('select')].map(select=>select.value),off=[...new Set(ids.filter(id=>known(id)&&!state.sizes[id]))];
    $('llsEditorAvailability').textContent=off.length?'This combination will be unavailable for new print jobs until you turn on '+off.map(id=>meta[id].name).join(' and ')+'.':'';
  }
  function editSet(index=null){
    if(draft)return;
    const existing=index===null?null:state.sets[index];draft={index,id:existing?.id||null};returnFocus=index===null?'llsAdd':index;
    $('llsSetEditor').hidden=false;$('llsSets').hidden=true;$('llsAdd').hidden=true;
    $('llsEditorTitle').textContent=existing?'Edit size & copy combination':'Create size & copy combination';
    $('llsSetName').value=existing?.name||'';$('llsSetRows').innerHTML='';$('llsSetError').textContent='';
    if(existing)items(existing).forEach(row=>addRow(Array.isArray(row)?row[0]:'unknown',Array.isArray(row)?row[1]:''));else addRow();
    updateEditorAvailability();$('llsSetName').focus();
  }
  function cancelEditor(){
    if(!draft)return false;
    draft=null;$('llsSetEditor').hidden=true;$('llsSetRows').innerHTML='';$('llsSetError').textContent='';renderSetList();
    const target=typeof returnFocus==='number'?document.querySelector(`[data-edit-set="${returnFocus}"]`):$('llsAdd');target?.focus();returnFocus=null;
    return true;
  }
  function editorError(message,input){$('llsSetError').textContent=message;input?.focus()}
  function saveSet(){
    if(!draft||$('llsSaveSet').disabled)return;
    const name=$('llsSetName').value.trim();
    if(!name){editorError('Name this combination before saving.',$('llsSetName'));return}
    const rows=[...$('llsSetRows').querySelectorAll('.lls-editor-row')];
    if(!rows.length){editorError('Add at least one label size before saving.',$('llsAddRow'));return}
    const counts=new Map();
    for(const row of rows){
      const select=row.querySelector('select'),input=row.querySelector('input'),id=select.value,quantity=Number(input.value);
      if(!known(id)){editorError('Choose an available format for each size row.',select);return}
      if(!input.value.trim()||!Number.isSafeInteger(quantity)||quantity<1){editorError('Copies must be a whole number of 1 or more.',input);return}
      const total=(counts.get(id)||0)+quantity;
      if(!Number.isSafeInteger(total)){editorError('That copy count is too large. Enter a smaller whole number.',input);return}
      counts.set(id,total);
    }
    if([...counts.values()].reduce((total,q)=>total+q,0)>MAX_COPIES){editorError(`Use ${MAX_COPIES} copies or fewer in total for one combination.`,rows[0].querySelector('input'));return}
    const button=$('llsSaveSet');button.disabled=true;
    try{
      const nextSets=state.sets.slice(),index=draft.index;
      const saved={...(index===null?{}:state.sets[index]),id:draft.id||'custom-'+crypto.randomUUID(),name,items:[...counts]};
      if(index===null)nextSets.push(saved);else nextSets[index]=saved;
      if(save({...state,sets:nextSets})){cancelEditor();announce('Combination saved on this browser.')}
      else editorError('This combination could not be saved. Your edits are still here.');
    }finally{button.disabled=false}
  }
  function render(){
    $('llSettings').innerHTML=`<div class="lls"><div class="lls-head"><button id="llsBack" type="button">← Back</button><div><h1>Settings</h1><div class="lls-muted">Make Little Labels fit your classroom.</div></div></div><div id="llsSettingsStatus" class="lls-status" role="status" aria-live="polite">Changes save automatically in this browser. These settings and saved combinations do not sync across devices.</div><div class="lls-card"><h2>Language ♡</h2><p class="lls-muted">Choose what appears under the English wording on your classroom labels.</p><label for="llsLanguage"><strong>Second language</strong></label><select id="llsLanguage" class="lls-select">${Object.entries(langs).map(([id,name])=>`<option value="${id}" ${state.language===id?'selected':''}>${name}</option>`).join('')}</select><div class="lls-note">Choose English Only if you don't want a translated line.</div></div><div class="lls-card"><h2>Available label sizes ♡</h2><p class="lls-muted">Show the sizes you use when creating labels. Choose the actual size and copies for a print job when you review your labels.</p><div class="lls-note"><strong>Label size is separate from paper size.</strong><br>Print on full Letter sheets: 8.5 × 11 inches, then cut out the labels. These layouts are not alignment templates for pre-cut sticker or card stock. Label measurements below are width × height; shape pictures show proportions, not actual size.</div><div id="llsSizes"></div><div class="lls-note">Changing these switches does not resize labels already in Ready to Print. In the PDF print settings, use Letter paper and 100% / Actual Size.</div></div><div class="lls-card"><h2>Saved size &amp; copy combinations ♡</h2><p class="lls-muted">Save the sizes and number of copies you often print together for one label.</p><div id="llsSets"></div><button id="llsAdd" type="button" class="primary">＋ Create combination</button><div id="llsSetEditor" hidden><h3 id="llsEditorTitle"></h3><label for="llsSetName">Combination name</label><input id="llsSetName" autocomplete="off" placeholder="For example, Shelf and basket"><div id="llsSetRows"></div><button id="llsAddRow" type="button" class="secondary">＋ Add a size</button><p id="llsEditorAvailability" class="lls-unavailable"></p><div id="llsSetError" role="alert"></div><div class="lls-editor-actions"><button id="llsSaveSet" type="button" class="primary">Save combination</button><button id="llsCancelSet" type="button" class="secondary">Cancel</button></div><p class="lls-muted lls-small">Up to 100 copies total per combination. Changes are saved only when you choose Save combination.</p></div></div></div>`;
    renderSizes();renderSetList();
    $('llsLanguage').onchange=event=>{if(!save({...state,language:event.target.value}))event.target.value=state.language};
    $('llsBack').onclick=()=>{if(!cancelEditor())close()};$('llsAdd').onclick=()=>editSet();
    $('llsAddRow').onclick=()=>{const row=addRow();updateEditorAvailability();row.querySelector('select').focus()};
    $('llsSaveSet').onclick=saveSet;$('llsCancelSet').onclick=cancelEditor;
  }
  function open(){state=load();draft=null;returnFocus=null;render();$('llSettings').classList.remove('lls-hidden');window.LittleLabelsDialog?.open($('llSettings'),{onClose:()=>{if(!cancelEditor())close()},initialFocus:$('llsBack'),returnFocus:$('littleLabelsSettingsBtn')});$('llsBack').focus()}
  function close(){draft=null;returnFocus=null;$('llSettings').classList.add('lls-hidden');window.LittleLabelsDialog?.close($('llSettings'));$('littleLabelsSettingsBtn')?.focus()}
  function install(){
    const root=document.createElement('div');root.id='llSettings';root.className='lls-hidden';document.body.append(root);
    const home=$('home'),account=home?.querySelector('.home-account');
    if(home&&!$('littleLabelsSettingsBtn')){const button=document.createElement('button');button.id='littleLabelsSettingsBtn';button.className='soft';button.textContent='⚙ Settings';button.style.cssText='width:100%;margin-top:10px;padding:11px';button.onclick=open;(account||home).insertAdjacentElement('afterend',button)}
  }
  const css=document.createElement('style');
  css.textContent=`#llSettings{position:fixed;inset:0;z-index:12000;overflow:auto;background:#FCF8F0;color:#17375E;font-family:Arial,sans-serif}.lls{max-width:560px;margin:auto;padding:16px 16px 45px;box-sizing:border-box}.lls *{box-sizing:border-box}.lls [hidden]{display:none!important}.lls-head{display:flex;gap:12px;align-items:center}.lls-head button{width:auto!important;padding:8px 12px!important;border-radius:999px!important;background:#EEF7FD!important;border:1px solid #DDE6EC!important;font-size:.82rem!important;flex:0 0 auto}.lls h1,.lls h2,.lls h3{font-family:Georgia,serif;font-weight:500}.lls h1{margin:0}.lls h2{margin:0 0 10px}.lls h3{font-size:1.2rem}.lls-card{background:#FFFDF9;border:1px solid #DDE6EC;border-radius:23px;padding:16px;margin:14px 0;box-shadow:0 7px 22px rgba(23,55,94,.05)}.lls-muted{color:#61758A;line-height:1.45}.lls-status{min-height:20px;font-size:.8rem;color:#61758A;margin-top:12px}.lls-group{font-size:.72rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#557C9C;margin:18px 0 4px}.lls-row{display:flex;align-items:center;gap:10px;padding:14px 0;border-bottom:1px solid #E9EEF2;cursor:pointer}.lls-row:last-child{border:0}.lls-size-visual{flex:0 0 58px;display:flex;align-items:center;justify-content:center;height:60px}.lls-size-shape{display:block;background:#E8F2F9;border:1.5px solid #729DBC;border-radius:3px;position:relative}.lls-fold-shape:after{content:'';position:absolute;top:50%;left:0;right:0;border-top:1px dashed #557C9C}.lls-size-copy{min-width:0;flex:1}.lls-row small,.lls-set small{display:block;color:#61758A;margin-top:5px;line-height:1.4;overflow-wrap:anywhere}.lls-availability{display:block;font-size:.76rem;font-weight:400;color:#61758A;margin-top:6px}.lls-switch{position:relative;flex:0 0 46px;width:46px;height:44px}.lls-switch input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;z-index:1;cursor:pointer}.lls-track{position:absolute;inset:8px 0;background:#E8EDF1;border:1px solid #C2D0DB;border-radius:999px}.lls-thumb{position:absolute;width:20px;height:20px;left:3px;top:3px;border-radius:50%;background:#fff;box-shadow:0 1px 4px #17375E33}.lls-switch input:checked+.lls-track{background:#BFDDF2;border-color:#739DBF}.lls-switch input:checked+.lls-track .lls-thumb{transform:translateX(18px);background:#17375E}.lls-switch input:focus-visible+.lls-track{outline:3px solid #305F85;outline-offset:3px}.lls-set{border:1px solid #DDE6EC;border-radius:17px;padding:12px;margin:9px 0;overflow-wrap:anywhere}.lls-set strong{display:block}.lls-set button{margin-top:10px;min-height:44px}.lls .primary{background:#BEDBF0;color:#17375E}.lls .danger{color:#843535;background:#FFFDF9;border:1px solid #E8D4D4}.lls-note{padding:12px;background:#EEF7FD;border-radius:15px;color:#526A7C;font-size:.82rem;line-height:1.5;margin-top:12px}.lls-select,.lls input:not([type=checkbox]){display:block;width:100%;min-width:0;min-height:44px;padding:11px;border:1px solid #B7CAD9;border-radius:12px;background:#fff;color:#17375E;font-size:1rem}.lls label:not(.lls-row){display:block;font-weight:700;margin:12px 0 6px}.lls-unavailable{font-size:.82rem;line-height:1.45;color:#735B25;overflow-wrap:anywhere}.lls-unavailable:empty{display:none}.lls-editor-row{display:grid;grid-template-columns:minmax(0,1fr) 78px;gap:0 10px;border:1px solid #DDE6EC;border-radius:14px;padding:10px;margin:12px 0;background:#fff}.lls-remove-row{grid-column:1/-1;min-height:44px;margin-top:10px}.lls-editor-actions{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;margin-top:12px}.lls button{white-space:normal;overflow-wrap:anywhere}.lls-editor-actions button{min-height:44px}.lls-small{font-size:.8rem}#llsSetError{color:#8B3535;font-size:.88rem;margin-top:12px}.lls-hidden{display:none!important}@media(max-width:380px){.lls{padding-left:12px;padding-right:12px}.lls-card{padding:13px}.lls-size-visual{flex-basis:48px;transform:scale(.82)}.lls-row{gap:7px}}`;
  document.head.append(css);
  window.LittleLabelSettings={get:load,meta,languages:langs,open};
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',install,{once:true}):install();
})();
