(()=>{
  const LIST_CHUNK_SIZE=1;
  const LIST_CONCURRENCY=3;
  let sessionRefreshPromise=null;

  function batchHeaders(){
    const headers={"Content-Type":"application/json"};
    if(typeof SUPABASE_PUBLISHABLE_KEY!=="undefined" && SUPABASE_PUBLISHABLE_KEY){
      headers.apikey=SUPABASE_PUBLISHABLE_KEY;
    }
    if(typeof cloudSession!=="undefined" && cloudSession?.access_token){
      headers.Authorization=`Bearer ${cloudSession.access_token}`;
    }
    return headers;
  }

  async function refreshSessionOnce(){
    if(typeof cloudSession==="undefined" || !cloudSession?.refresh_token || typeof refreshCloudSession!=="function") return;
    if(!sessionRefreshPromise){
      sessionRefreshPromise=refreshCloudSession(cloudSession.refresh_token).finally(()=>{sessionRefreshPromise=null;});
    }
    await sessionRefreshPromise;
  }

  async function callListChunk(items){
    let response=await fetch(BATCH_LABELS_URL,{
      method:"POST",
      headers:batchHeaders(),
      body:JSON.stringify({mode:"list",items})
    });

    if(response.status===401){
      await refreshSessionOnce();
      response=await fetch(BATCH_LABELS_URL,{
        method:"POST",
        headers:batchHeaders(),
        body:JSON.stringify({mode:"list",items})
      });
    }

    let data={};
    try{data=await response.json();}catch{}
    if(!response.ok || !data.success){
      throw new Error(data.error || data.details || `Request failed (${response.status})`);
    }
    return data.items||[];
  }

  async function createListDraftsFromHome(){
    const input=document.getElementById("makeListInput");
    const btn=document.getElementById("makeListCreateBtn");
    const progress=document.getElementById("makeListProgress");
    if(!input||!btn||!progress) return;

    const items=input.value
      .split(/\n+/)
      .map(x=>x.trim())
      .filter(Boolean);

    if(!items.length){
      alert("Add at least one material to the list.");
      return;
    }
    if(items.length>25){
      alert("For now, make batches of 25 items or fewer.");
      return;
    }

    const oldText=btn.textContent;
    btn.disabled=true;
    btn.textContent="Creating…";
    progress.textContent=items.length===1
      ? "Creating 1 label…"
      : `Creating ${items.length} labels — up to ${Math.min(LIST_CONCURRENCY,items.length)} at a time…`;
    progress.className="status loading";
    progress.classList.remove("hidden");

    try{
      const chunks=[];
      for(let start=0;start<items.length;start+=LIST_CHUNK_SIZE){
        chunks.push({start,items:items.slice(start,start+LIST_CHUNK_SIZE)});
      }

      const results=new Array(chunks.length);
      let nextChunk=0;
      let completed=0;

      async function worker(){
        while(true){
          const chunkIndex=nextChunk++;
          if(chunkIndex>=chunks.length) return;
          const chunk=chunks[chunkIndex];
          const chunkItems=await callListChunk(chunk.items);
          results[chunkIndex]=chunkItems;
          completed+=chunk.items.length;
          const shown=Math.min(completed,items.length);
          progress.textContent=`Created ${shown} of ${items.length} label${items.length===1?"":"s"}…`;
        }
      }

      const workerCount=Math.min(LIST_CONCURRENCY,chunks.length);
      await Promise.all(Array.from({length:workerCount},()=>worker()));

      const returned=[];
      results.forEach((chunkItems,chunkIndex)=>{
        const source=chunks[chunkIndex];
        source.items.forEach((original,i)=>{
          const x=chunkItems?.[i]||{};
          returned.push({original,x});
        });
      });

      batchMode="list";
      batchDrafts=returned.map(({original,x})=>({
        id:crypto.randomUUID(),
        original,
        english:x.english || original,
        spanish:x.spanish || "",
        photo:x.photo_data || "",
        image_source:x.image_source || "generated",
        notes:x.notes || ""
      }));

      if(!batchDrafts.length){
        throw new Error("The label service returned no label drafts.");
      }

      progress.textContent=`Finished ${batchDrafts.length} label${batchDrafts.length===1?"":"s"}. Opening review…`;
      progress.className="status ok";
      progress.classList.remove("hidden");

      if(typeof renderBatchReview!=="function" || typeof show!=="function"){
        throw new Error("The label review screen is unavailable.");
      }
      renderBatchReview();
      show("batchReview");
    }catch(err){
      console.error("Make a List error:",err);
      progress.textContent="I couldn't create the labels: "+(err?.message||"Unknown error");
      progress.className="status error";
      progress.classList.remove("hidden");
    }finally{
      btn.disabled=false;
      btn.textContent=oldText;
    }
  }

  function installMakeListFix(){
    const btn=document.getElementById("makeListCreateBtn");
    if(!btn || btn.dataset.listFixInstalled==="3") return;
    btn.dataset.listFixInstalled="3";
    btn.addEventListener("click",event=>{
      event.preventDefault();
      event.stopImmediatePropagation();
      createListDraftsFromHome();
    },true);
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",installMakeListFix,{once:true});
  }else{
    installMakeListFix();
  }
})();
