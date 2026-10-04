// Account-bound, retry-safe persistence. A job is one explicit user operation,
// not a content fingerprint: retries reuse its IDs; a later operation gets new IDs.
(() => {
  function create(items, sizes, options={}) {
    const context=options.context || captureCloudContext();
    assertCloudContext(context);
    return {
      context, owner:context.owner, cloud:context.cloud, queueOnly:!!options.queueOnly,
      reuseMasters:!!options.reuseMasters,
      labels:items.map(item=>({id:options.queueOnly?item.id:crypto.randomUUID(),
        english:(item.english||'').trim(),spanish:item.spanish||'',photo:item.photo||''})),
      sizes:[...sizes],queueRows:null,prepared:false,busy:false,complete:false,
      labelsWritten:false,queueWritten:false,addToPrint:null
    };
  }
  const checkOwner=job=>assertCloudContext(job.context);
  async function save(job,addToPrint) {
    if(job.busy || job.complete)return false;
    job.busy=true;
    try {
      checkOwner(job);
      if(job.addToPrint===null)job.addToPrint=!!addToPrint;
      if(!job.prepared){
        for(const label of job.labels){
          if(!job.queueOnly)label.photo=await prepareCloudPhoto(label.photo);
          checkOwner(job);
          if(job.reuseMasters){
            const existing=library.find(x=>x.id && (x.english||'').toLowerCase()===label.english.toLowerCase()
              && (x.spanish||'').toLowerCase()===label.spanish.toLowerCase() && (x.photo||'')===label.photo);
            if(existing){label.id=existing.id;label.existing=true;}
          }
        }
        job.prepared=true;
      }
      if(!job.queueRows)job.queueRows=job.labels.flatMap(label=>job.sizes.map(size=>({
        id:crypto.randomUUID(),label_id:label.id||null,english:label.english,
        spanish:label.spanish,photo_data:label.photo,size
      })));
      checkOwner(job);
      if(job.cloud){
        const options=rows=>({method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify(rows)});
        if(!job.queueOnly && !job.labelsWritten){
          const rows=job.labels.filter(x=>!x.existing).map(({photo,existing,...label})=>({...label,photo_data:photo}));
          if(rows.length)await restFetch('labels?on_conflict=id',options(rows),true,job.context);
          checkOwner(job);job.labelsWritten=true;
        }
        if(job.addToPrint && !job.queueWritten){
          await restFetch('print_queue?on_conflict=id',options(job.queueRows),true,job.context);
          checkOwner(job);job.queueWritten=true;
        }
        const loaded=await loadCloudData();
        checkOwner(job);
        if(loaded===false)throw new Error('Another save is still syncing. Retry to refresh this completed save.');
      }else{
        if(!job.queueOnly)for(const {existing,...label} of job.labels)if(!library.some(x=>x.id===label.id))library.push(label);
        if(job.addToPrint)for(const {photo_data,...row} of job.queueRows)if(!queue.some(x=>x.id===row.id))queue.push({...row,photo:photo_data});
        refreshLibrary();refreshQueue();
      }
      job.complete=true;
      return true;
    }catch(error){checkOwner(job);throw error;}finally{job.busy=false;}
  }
  const retryMessage=error=>error.code==='SESSION_CHANGED'?error.message:
    'Saving could not finish. Some records may already be saved. Retry finishes the same save without adding duplicates. '+error.message;

  const locks=new WeakMap();
  function lockControls(selector,locked){
    document.querySelectorAll(selector).forEach(el=>{
      if(locked){if(!locks.has(el))locks.set(el,el.disabled);el.disabled=true;}
      else if(locks.has(el)){el.disabled=locks.get(el);locks.delete(el);}
    });
  }
  function lockSingle(){lockControls('#llDynamicSets button,#singleSize,#englishInput,#spanishInput,#llCleanupToggle,#useOriginalBtn,#useCleanedBtn,#normalCleanupBtn,#strongCleanupBtn,#retryCleanupBtn',!!singleSaveJob&&!singleSaveJob.complete);}
  function lockReprint(){lockControls('#llReprintSets button,#reprintSingleSize',!!reprintSaveJob&&!reprintSaveJob.complete);}
  async function single(sizes){
    if(singleSaveJob?.busy || singleSaveJob?.complete)return;
    const btn=document.getElementById('addToQueue'),status=document.getElementById('singleSaveStatus');
    const nav=workflowNavigationVersion,source=currentCreationSource;
    let job;
    try{
      if(!singleDraftContext)throw sessionChangedError();
      assertCloudContext(singleDraftContext);
      if(!singleSaveJob)singleSaveJob=create([{
        english:document.getElementById('englishInput').value.trim()||'Material',
        spanish:document.getElementById('spanishInput').value.trim(),photo:activePhotoDataUrl||photoDataUrl
      }],sizes,{context:singleDraftContext,reuseMasters:true});
      job=singleSaveJob;clearTimeout(translationTimer);translationRequestId++;lockSingle();btn.disabled=true;btn.textContent='Saving…';
      if(status)status.textContent=job.cloud?'Saving to My Labels and Ready to Print…':'Adding for this session only…';
      if(await save(job,true)){
        if(nav===workflowNavigationVersion){
          if(status)status.textContent=job.cloud?'Saved to your account.':'Added for this session only.';
          if(source==='typed')window.LittleLabelsTypedLabel?.reset();
          show('queue');showWorkflowSaveNotice('queue',job.queueRows.length,job.cloud);
        }
      }
    }catch(error){
      console.error(error);
      if(status&&nav===workflowNavigationVersion)status.textContent=retryMessage(error);
      else if(error.code!=='SESSION_CHANGED')alert(retryMessage(error));
    }finally{
      if(!job || singleSaveJob===job){btn.disabled=false;btn.textContent=job&&!job.complete?'Retry Save':'Save & Add to Print';lockSingle();}
    }
  }
  async function reprint(sizes){
    if(reprintSaveJob?.busy || reprintSaveJob?.complete)return;
    if(!selectedLibraryLabel)return;
    const btn=document.getElementById('reprintQueueBtn'),nav=workflowNavigationVersion;
    let job;
    try{
      if(!reprintDraftContext)throw sessionChangedError();
      assertCloudContext(reprintDraftContext);
      if(!reprintSaveJob){reprintSaveJob=create([selectedLibraryLabel],sizes,{context:reprintDraftContext,queueOnly:true});reprintSaveJobs.set(selectedLibraryLabel.id,reprintSaveJob);}
      job=reprintSaveJob;lockReprint();btn.disabled=true;btn.textContent='Adding…';
      if(await save(job,true) && nav===workflowNavigationVersion)show('queue');
    }catch(error){console.error(error);alert(retryMessage(error));}
    finally{if(!job || reprintSaveJob===job){btn.disabled=false;btn.textContent=job&&!job.complete?'Retry Add to Print':'Add to Print';lockReprint();}}
  }
  const copies=new Map();
  document.addEventListener('little-label-account-changed',()=>copies.clear());
  function copyState(item,context){
    const key=context.revision+'|'+(item.id||'');
    return {key,job:copies.get(key)};
  }
  async function copy(item,button,context){
    const {key}=copyState(item,context);
    let job=copies.get(key);
    if(job?.busy)return;
    try{
      assertCloudContext(context);
      if(!job){
        // The source can be re-rendered, but the operation is shared by its row ID.
        if(!queue.some(row=>row.id===item.id))throw Error('This label is no longer in Ready to Print.');
        job=create([{...item,id:item.label_id||null}],[item.size||''],{context,queueOnly:true});
        copies.set(key,job);
      }
      button.disabled=true;button.textContent='Adding…';
      const saving=save(job,true);refreshQueue();
      if(await saving)copies.delete(key);
    }catch(error){console.error(error);alert(retryMessage(error));}
    finally{
      button.disabled=false;button.textContent=job&&!job.complete?'Retry Copy':'+ Copy';
      try{assertCloudContext(context);refreshQueue();}catch{}
    }
  }
  const buildRasterPages=buildRasterPrintPages,renderSheets=renderPrintSheets;
  buildRasterPrintPages=async function(){
    const context=captureCloudContext();
    const pages=await buildRasterPages.apply(this,arguments);
    assertCloudContext(context);
    return pages;
  };
  renderPrintSheets=async function(){
    try{return await renderSheets.apply(this,arguments);}
    catch(error){if(error.code!=='SESSION_CHANGED')throw error;}
  };
  window.LittleLabelWorkflowSave={create,save,single,reprint,copy,copyState,retryMessage,lockSingle,lockReprint};
})();
