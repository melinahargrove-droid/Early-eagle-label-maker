(()=>{
  function lang(){return window.LittleLabelSettings?.get?.().language||'es'}
  function langName(id){return window.LittleLabelSettings?.languages?.[id]||'Spanish'}
  function install(){
    if(typeof FUNCTION_URL==='undefined')return;
    const originalFetch=window.fetch.bind(window);
    window.fetch=async function(input,init){
      const url=typeof input==='string'?input:input?.url;
      if(url!==FUNCTION_URL||init?.method!=='POST'||!init.body)return originalFetch(input,init);
      let body;try{body=JSON.parse(init.body)}catch{return originalFetch(input,init)}
      if(!body.imageDataUrl&&!body.imageBase64)return originalFetch(input,init);
      const requestedLanguage=lang();
      body.target_language=requestedLanguage;body.targetLanguage=langName(requestedLanguage);body.language=requestedLanguage;
      // Never replay a failed/aborted paid AI request. Retry belongs to the visible UI.
      const response=await originalFetch(input,{...init,body:JSON.stringify(body)});
      if(!response.ok)return response;
      const data=await response.clone().json().catch(()=>null);
      if(!data?.identification)return response;
      const translated=data.identification.translation??data.identification.spanish??'';
      data.identification.spanish=requestedLanguage==='none'?'':translated;
      data.identification.translation=data.identification.spanish;
      return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers:response.headers});
    };
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',install,{once:true}):install();
})();
