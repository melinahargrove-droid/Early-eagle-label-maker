// Manual saved-master editing. Existing print copies remain independent snapshots.
(() => {
  const $ = id => document.getElementById(id), pending = new Map();
  let draft = null, photoRevision = 0;
  const words = item => ({english:item.english || '',spanish:item.spanish || '',photo:item.photo || item.photo_data || ''});
  const same = (a,b) => ['english','spanish','photo'].every(key => a[key] === b[key]);
  const key = (id,context) => `${context.revision}|${context.owner || ''}|${id}`;
  function current(d) { try { assertCloudContext(d.context); return draft === d; } catch { return false; } }
  function focusLibrary(id,preferred){
    if($('library')?.classList.contains('hidden'))return;
    const edit=[...$('libraryItems').querySelectorAll('button')].find(x=>x.dataset.labelId===id);
    const target=preferred?.isConnected?preferred:edit||$('librarySearch')||$('libraryBack');target?.focus();
  }
  function close(restoreFocus = true) {
    photoRevision++; const old = draft; draft = null;
    $('llLibraryEditor')?.classList.add('hidden');
    window.LittleLabelsDialog?.close($('llLibraryEditor'),{restoreFocus});
    if(restoreFocus)focusLibrary(old?.id,old?.trigger);
    for (const id of ['lleEnglish','lleSecond']) if ($(id)) $(id).value='';
    $('llePhoto')?.removeAttribute('src');
  }
  function message(text) { $('lleStatus').textContent = text; }
  function render() {
    if (!draft) return;
    const d = draft, locked = !!d.job || d.reading;
    $('lleEnglish').value=d.value.english;$('lleSecond').value=d.value.spanish;
    $('llePhotoWrap').hidden=!d.value.photo;
    if (d.value.photo) $('llePhoto').src=d.value.photo; else $('llePhoto').removeAttribute('src');
    $('lleUpload').textContent=d.value.photo?'Change Photo':'Add Photo';
    $('lleRemovePhoto').hidden=!d.value.photo;
    for (const id of ['lleEnglish','lleSecond','lleUpload','lleRemovePhoto','lleSave','lleCopy']) $(id).disabled=locked;
    if (d.job && !d.job.busy) $(d.job.mode==='copy'?'lleCopy':'lleSave').disabled=false;
    if(d.conflict||(d.context.cloud&&d.value.photo!==d.baseline.photo))$('lleSave').disabled=true;
    $('llePhotoPolicy').hidden=!(d.context.cloud&&d.value.photo!==d.baseline.photo);
    $('lleSave').textContent=d.job?.mode==='change'?'Retry Save Changes':'Save Changes';
    $('lleCopy').textContent=d.job?.mode==='copy'?'Retry Save Copy':'Save Copy';
    if (d.job?.busy) $(d.job.mode==='copy'?'lleCopy':'lleSave').textContent='Saving…';
  }
  function ensure() {
    if ($('llLibraryEditor')) return;
    const el=document.createElement('div');el.id='llLibraryEditor';el.className='hidden';
    el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-labelledby','lleTitle');
    el.innerHTML='<div class="lle-app"><button id="lleBack" class="secondary" type="button">← My Labels</button><div class="lle-card"><h2 id="lleTitle">Edit Label</h2><p class="lle-help">Edit your saved wording or photo.</p><label for="lleEnglish">English wording</label><input id="lleEnglish" autocomplete="off"><label for="lleSecond">Second-language wording (optional)</label><input id="lleSecond" autocomplete="off"><div id="llePhotoWrap"><img id="llePhoto" alt="Saved label photo preview"></div><div class="lle-photo-actions"><button id="lleUpload" class="secondary" type="button">Add Photo</button><button id="lleRemovePhoto" class="secondary" type="button">Remove Photo</button></div><input id="llePhotoInput" type="file" accept="image/*" hidden><p class="lle-policy">Save Changes updates this saved label for future reprints. Copies already in Ready to Print keep their original wording and photo. Save Copy creates a separate saved label.</p><p id="llePhotoPolicy" class="lle-policy" hidden>Save Copy keeps your changed photo as a new saved label. The original saved photo stays intact. Save Changes is available for wording-only edits.</p><div id="lleStatus" role="status" aria-live="polite"></div><button id="lleSave" class="primary" type="button">Save Changes</button><button id="lleCopy" class="secondary" type="button">Save Copy</button><button id="lleCancel" class="secondary" type="button">Cancel</button></div></div>';
    document.body.append(el);
    $('lleBack').onclick=$('lleCancel').onclick=()=>close();
    for (const [id,field] of [['lleEnglish','english'],['lleSecond','spanish']]) $(id).addEventListener('input',()=>{if(draft&&!draft.job)draft.value[field]=$(id).value;});
    $('lleUpload').onclick=()=>{if(!draft||draft.job)return;$('llePhotoInput').value='';$('llePhotoInput').click();};
    $('llePhotoInput').onchange=async event=>{
      const file=event.target.files?.[0],d=draft;if(!file||!d||d.job)return;
      const revision=++photoRevision;d.reading=true;message('Preparing your photo…');render();
      try {
        if(file.size>20_000_000)throw Error('Choose a photo smaller than 20 MB.');
        const photo=await compressImage(file);
        if(!current(d)||revision!==photoRevision)return;
        d.value.photo=photo;message('Photo ready. Save when your label is ready.');
      } catch(error) { if(current(d)&&revision===photoRevision)message('That photo could not be prepared. Your previous photo and wording are still here. '+error.message); }
      finally { if(current(d)&&revision===photoRevision){d.reading=false;render();} }
    };
    $('lleRemovePhoto').onclick=()=>{if(draft&&!draft.job){photoRevision++;draft.value.photo='';render();message('Photo removed from this draft. Save to apply the change.');}};
    $('lleSave').onclick=()=>save('change');$('lleCopy').onclick=()=>save('copy');
  }
  function open(item,trigger) {
    if(!library.some(x=>x.id===item.id))return;
    ensure();const context=captureCloudContext(),saved=pending.get(key(item.id,context));
    draft={id:item.id,context,trigger,baseline:words(item),value:words(item),job:saved||null,reading:false};
    if(saved){draft.baseline=saved.baseline;draft.value={...saved.value};}
    $('llLibraryEditor').classList.remove('hidden');render();
    message(saved?'A save is waiting to be confirmed. Retry finishes that same save.':'');
    window.LittleLabelsDialog?.open($('llLibraryEditor'),{onClose:()=>close(),initialFocus:$('lleEnglish'),returnFocus:trigger});
    if(!window.LittleLabelsDialog)$('lleEnglish').focus();
  }
  async function save(mode) {
    const d=draft;if(!d||d.reading||d.job?.busy||(mode==='change'&&d.conflict))return;
    if(d.job&&d.job.mode!==mode)return;
    if(mode==='change'&&d.context.cloud&&d.value.photo!==d.baseline.photo){message('Choose Save Copy to keep the changed photo as a separate saved label.');return;}
    try { assertCloudContext(d.context); } catch { close(false);return; }
    if(!d.value.english.trim()){message('Add English wording before saving.');$('lleEnglish').focus();return;}
    if(!d.job){
      d.job={mode,baseline:{...d.baseline},value:{english:d.value.english.trim(),spanish:d.value.spanish.trim(),photo:d.value.photo},busy:false,written:false,prepared:false};
      if(mode==='copy'){d.job.copy=LittleLabelWorkflowSave.create([d.job.value],[],{context:d.context});d.job.copy.prepared=d.job.value.photo===d.job.baseline.photo;}
      pending.set(key(d.id,d.context),d.job);
    }
    const job=d.job;job.busy=true;render();message('Saving your label…');
    const shown=()=>draft&&draft.job===job&&current(draft)?draft:null;let settledView=null;
    try {
      if(mode==='copy') await LittleLabelWorkflowSave.save(job.copy,false);
      else {
        if(!job.prepared){if(job.value.photo!==job.baseline.photo)job.value.photo=await prepareCloudPhoto(job.value.photo);assertCloudContext(d.context);job.prepared=true;}
        if(d.context.cloud){
          if(!job.written){
            const rows=await restFetch(`labels?id=eq.${encodeURIComponent(d.id)}&select=id,english,spanish,photo_data`,{},true,d.context);
            assertCloudContext(d.context);
            if(!Array.isArray(rows)||rows.length>1)throw Error('The saved label could not be checked. Retry to confirm it.');
            if(!rows.length){library=library.filter(x=>x.id!==d.id);refreshLibrary();const missing=Error('This saved label is no longer available. Your draft is kept; choose Save Copy to save it separately.');missing.code='LABEL_CHANGED';throw missing;}
            const latest=words(rows[0]);
            if(!same(latest,job.value)){
              if(!same(latest,job.baseline)){
                const master=library.find(x=>x.id===d.id);if(master)Object.assign(master,latest);refreshLibrary();
                const conflict=Error('This saved label changed elsewhere. Cancel and reopen the latest label, or save your draft as a separate copy.');conflict.code='LABEL_CHANGED';throw conflict;
              }
              const patch={};
              for(const field of ['english','spanish','photo'])if(job.value[field]!==job.baseline[field])patch[field==='photo'?'photo_data':field]=job.value[field];
              const filters=['english','spanish'].map(field=>`${field}=${rows[0][field]==null?'is.null':'eq.'+encodeURIComponent(JSON.stringify(rows[0][field]))}`).join('&');
              const updated=await restFetch(`labels?id=eq.${encodeURIComponent(d.id)}&${filters}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(patch)},true,d.context);
              assertCloudContext(d.context);
              if(!Array.isArray(updated)||updated.length!==1)throw Error('The saved label could not be confirmed. Retry to check it.');
            }
            job.written=true;
          }
          if(await loadCloudData()===false)throw Error('Another save is still syncing. Retry to refresh this label.');
          assertCloudContext(d.context);
        } else {
          const master=library.find(x=>x.id===d.id);
          if(!master)throw Error('This saved label is no longer available.');
          if(!same(words(master),job.baseline)&&!same(words(master),job.value))throw Error('This saved label changed. Reopen it before editing.');
          Object.assign(master,job.value);refreshLibrary();
        }
      }
      pending.delete(key(d.id,d.context));
      if(shown()){
        close(false);refreshLibrary();
        const notice=$('librarySaveNotice');notice.className='status ok';
        notice.textContent=(mode==='copy'?'A separate copy was saved.':'Saved label updated.')+' Existing Ready to Print copies were kept unchanged.'+(d.context.cloud?'':' This is saved only for this session.');
        focusLibrary(mode==='copy'?job.copy.labels[0].id:d.id);
      }
    } catch(error) {
      if(error.code==='SESSION_CHANGED'){pending.delete(key(d.id,d.context));if(shown())close(false);return;}
      settledView=shown();
      if(error.code==='LABEL_CHANGED'){pending.delete(key(d.id,d.context));d.job=null;d.conflict=true;if(settledView){settledView.job=null;settledView.conflict=true;}}
      if(settledView)message('Saving could not finish. Your draft is kept; Retry checks the same save without making another copy. '+error.message);
    } finally { job.busy=false;if(shown()||current(settledView))render(); }
  }
  document.addEventListener('little-label-account-changed',()=>{pending.clear();if(draft)close(false);});
  document.addEventListener('little-label-navigation',()=>{if(draft)close(false);});
  const css=document.createElement('style');css.textContent='#llLibraryEditor{position:fixed;inset:0;z-index:14500;overflow:auto;background:#FCF8F0;color:#17375E}.lle-app{max-width:560px;margin:auto;padding:18px 16px 40px}.lle-app>button{width:auto;padding:9px 14px;border-radius:999px}.lle-card{margin-top:14px;background:#FFFDF9;border:1px solid #DDE6EC;border-radius:23px;padding:18px}.lle-card h2{font:500 1.7rem Georgia,serif;margin:0 0 12px}.lle-card label{display:block;margin:14px 0 6px;font-weight:700}.lle-card input:not([type=file]){width:100%;padding:12px;border:1px solid #B7CAD9;border-radius:12px;font:inherit;background:#fff;color:#17375E}.lle-card button{margin-top:10px;min-height:44px}.lle-card [hidden]{display:none!important}.lle-photo-actions{display:flex;gap:8px}.lle-help,.lle-policy{color:#526A7C;line-height:1.45}.lle-policy{padding:12px;background:#EEF7FD;border-radius:15px;font-size:.87rem}#llePhoto{display:block;width:100%;max-height:220px;object-fit:contain;margin-top:14px}#lleStatus{color:#17375E;line-height:1.45}';document.head.append(css);
  window.LittleLabelsLibraryEditor={open,close};
})();
