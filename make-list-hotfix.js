(()=>{
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
    progress.textContent=`Creating ${items.length} label draft${items.length===1?"":"s"}…`;
    progress.className="status loading";
    progress.classList.remove("hidden");

    try{
      const headers={"Content-Type":"application/json"};
      if(typeof SUPABASE_PUBLISHABLE_KEY!=="undefined" && SUPABASE_PUBLISHABLE_KEY){
        headers.apikey=SUPABASE_PUBLISHABLE_KEY;
      }
      if(typeof cloudSession!=="undefined" && cloudSession?.access_token){
        headers.Authorization=`Bearer ${cloudSession.access_token}`;
      }

      let response=await fetch(BATCH_LABELS_URL,{
        method:"POST",
        headers,
        body:JSON.stringify({mode:"list",items})
      });

      // If the session expired, refresh it once using the app's existing helper and retry.
      if(response.status===401 && typeof cloudSession!=="undefined" && cloudSession?.refresh_token && typeof refreshCloudSession==="function"){
        await refreshCloudSession(cloudSession.refresh_token);
        const retryHeaders={"Content-Type":"application/json"};
        if(typeof SUPABASE_PUBLISHABLE_KEY!=="undefined" && SUPABASE_PUBLISHABLE_KEY){
          retryHeaders.apikey=SUPABASE_PUBLISHABLE_KEY;
        }
        if(cloudSession?.access_token){
          retryHeaders.Authorization=`Bearer ${cloudSession.access_token}`;
        }
        response=await fetch(BATCH_LABELS_URL,{
          method:"POST",
          headers:retryHeaders,
          body:JSON.stringify({mode:"list",items})
        });
      }

      let data={};
      try{ data=await response.json(); }catch{}
      if(!response.ok || !data.success){
        throw new Error(data.error || data.details || `Request failed (${response.status})`);
      }

      batchMode="list";
      batchDrafts=(data.items||[]).map((x,i)=>({
        id:crypto.randomUUID(),
        original:items[i] || x.english || "",
        english:x.english || items[i] || "",
        spanish:x.spanish || "",
        photo:x.photo_data || "",
        image_source:x.image_source || "generated",
        notes:x.notes || ""
      }));

      if(!batchDrafts.length){
        throw new Error("The label service returned no label drafts.");
      }

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
    if(!btn || btn.dataset.listFixInstalled==="1") return;
    btn.dataset.listFixInstalled="1";
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
