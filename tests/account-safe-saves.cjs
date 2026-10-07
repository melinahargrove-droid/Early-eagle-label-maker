// Synthetic only: load the real app and click its production handlers. No live API traffic.
const {JSDOM,ResourceLoader,VirtualConsole}=require('jsdom');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const tick=()=>new Promise(resolve=>setTimeout(resolve,8));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};};
const response=(data=[],status=200)=>({ok:status<400,status,json:async()=>data});
class Local extends ResourceLoader{fetch(url){const u=new URL(url);return u.hostname==='labels.test'&&u.pathname.endsWith('.js')?Promise.resolve(fs.readFileSync(path.join(root,u.pathname))):null;}}
async function fixture({slowStartup=false}={}){
  const startupAuth=deferred();
  const errors=[],alerts=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
  const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/const SUPABASE_PUBLISHABLE_KEY\s*=\s*[^;]+;/,'const SUPABASE_PUBLISHABLE_KEY="synthetic-public-key";'),{
    url:'https://labels.test/',runScripts:'dangerously',resources:new Local(),pretendToBeVisual:true,virtualConsole:vc,
    beforeParse(w){w.fetch=async()=>{if(slowStartup)return {ok:true,status:200,json:()=>startupAuth.promise};throw Error('Synthetic offline');};
      if(slowStartup)w.localStorage.setItem('eea_label_maker_supabase_session_v1',JSON.stringify({access_token:'stored-A',refresh_token:'stored-r',user:{id:'stored-A',is_anonymous:false,email:'synthetic@example.invalid'}}));w.scrollTo=()=>{};w.alert=m=>alerts.push(String(m));w.confirm=()=>true;w.TextEncoder=TextEncoder;
      w.localStorage.setItem('littleLabelsWelcomeSeenV1','1');w.Image=class{constructor(){this.naturalWidth=this.naturalHeight=1;}set src(v){queueMicrotask(()=>this.onload?.());}};
      w.HTMLCanvasElement.prototype.getContext=()=>({fillRect(){},drawImage(){}});w.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/jpeg;base64,U1lOVEhFVElD';}
  });
  const w=dom.window;await new Promise(r=>w.addEventListener('load',r));await tick();
  w.eval(`window.setAccount=(id,suffix='')=>{saveCloudSession({access_token:'token-'+id+suffix,refresh_token:'refresh-'+id+suffix,user:{id,is_anonymous:false,email:'synthetic@example.invalid',identities:[{}]}});cloudReady=true;updateAccountUI();};${slowStartup?'':"setAccount('A');"}`);
  await tick();
  const $=id=>w.document.getElementById(id),click=id=>$(id).click(),input=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new w.Event('input',{bubbles:true}));};
  const db={labels:new Map(),print_queue:new Map(),posts:[],fail:null,before:null,failReads:false};
  w.fetch=async(url,o={})=>{
    const table=new URL(url).pathname.split('/').pop();
    if(!db[table] || !(db[table] instanceof Map))return response({active:true,is_admin:true});
    if(o.method==='POST'){
      const rows=JSON.parse(o.body);assert.ok(Array.isArray(rows),'Stable insert uses row array');
      assert.match(o.headers.Prefer,/resolution=ignore-duplicates/);
      assert.match(url,/on_conflict=id/);
      const record={table,rows,token:o.headers.Authorization};db.posts.push(record);
      if(db.before)await db.before(record);
      const fail=db.fail&&db.fail.table===table?db.fail:null;if(fail)db.fail=null;
      if(fail?.when==='before')throw Error('Synthetic rejected write');
      for(const row of rows){assert.ok(row.id);if(!db[table].has(row.id))db[table].set(row.id,{...row});}
      if(fail?.when==='after')throw Error('Synthetic lost committed response');
      return response(null,204);
    }
    if(db.failReads)throw Error('Synthetic read unavailable');
    return response([...db[table].values()].map(x=>({...x})));
  };
  if(!slowStartup)await w.LittleLabelsOwnerAI.check(true);
  w.prepareCloudPhoto=async value=>value;
  async function typed(name='Synthetic Label',second='Synthetic Translation'){
    w.show('home');click('homeTypeBtn');input('tlEnglish',name);input('tlSecond',second);click('tlNext');await tick();click('chooseSetBtn');await tick();
  }
  async function product(items){
    w.callBatchFunction=async()=>({success:true,items:items.map(x=>({...x,photo_data:x.photo||'data:image/jpeg;base64,U1lOVEhFVElD'}))});
    input('batchListInput',items.map(x=>x.english).join('\n'));await w.createListDrafts();await tick();
  }
  async function reprint(id='master-1'){
    if(!db.labels.has(id))db.labels.set(id,{id,english:'Synthetic '+id,spanish:'Translation',photo_data:''});
    await w.loadCloudData();w.eval(`openReprint(library.find(x=>x.id===${JSON.stringify(id)}))`);await tick();
  }
  async function seedCopy(){
    db.print_queue.set('source',{id:'source',label_id:'master-1',english:'Synthetic Copy',spanish:'',photo_data:'',size:'Business Card'});
    await w.loadCloudData();
  }
  const copyButton=()=>[...w.document.querySelectorAll('#queueItems .queue-actions button')].find(b=>/Copy|Adding/.test(b.textContent));
  return {w,dom,$,click,input,db,typed,product,reprint,seedCopy,copyButton,alerts,errors,startupAuth};
}
let count=0;
async function run(name,fn){const f=await fixture();try{await fn(f);await tick();assert.deepEqual(f.errors,[]);console.log('PASS '+name);count++;}finally{f.w.close();}}
(async()=>{
  {
    const f=await fixture({slowStartup:true});
    try{
      assert.equal(f.w.eval('currentUser'),null,'Stored identity stays provisional until refresh verifies it');
      assert.equal(f.$('llaCheckingPane').classList.contains('lla-hidden'),false);
      assert.equal(f.$('llaCheckingTitle').textContent,'Opening Little Labels…');
      let checks=0;const status=deferred(),base=f.w.fetch;
      f.w.fetch=(url,options)=>{if(url.includes('/rpc/little_labels_access_status')){checks++;return status.promise;}return base(url,options);};
      assert.equal(checks,0);
      f.startupAuth.resolve({access_token:'verified-A',refresh_token:'verified-r',user:{id:'stored-A',is_anonymous:false,email:'synthetic@example.invalid'}});await tick();
      assert.equal(checks,2);assert.equal(f.$('llaCheckingPane').classList.contains('lla-hidden'),false);
      status.resolve(response({active:false}));await tick();assert.equal(f.$('llaActivatePane').classList.contains('lla-hidden'),false);assert.deepEqual(f.errors,[]);
      console.log('PASS slow restored session stays account-gated until verified, then checks purchase once');count++;
    }finally{f.w.close();}
  }
  {
    const f=await fixture({slowStartup:true});
    try{
      f.startupAuth.resolve({access_token:'wrong-owner',refresh_token:'wrong-r',user:{id:'different-owner',is_anonymous:false}});await tick();
      assert.equal(f.w.eval('currentUser'),null);assert.equal(f.w.eval('cloudReady'),false);
      assert.equal(JSON.parse(f.w.localStorage.getItem('eea_label_maker_supabase_session_v1')).user.id,'stored-A');
      assert.equal(f.$('llaAccountPane').classList.contains('lla-hidden'),false);assert.deepEqual(f.errors,[]);
      console.log('PASS restored refresh cannot publish a different owner than the cached session');count++;
    }finally{f.w.close();}
  }
  for(const same of [false,true])await run('delayed 401 cannot replay into '+(same?'replacement same-user':'another-user')+' session',async({w})=>{
    const wait=deferred(),calls=[];w.fetch=async(url,o)=>{if(url.includes('/rpc/'))return response({active:true,is_admin:true});calls.push(o.headers.Authorization);return wait.promise;};
    const pending=w.restFetch('labels',{method:'POST',body:'[]'}).catch(e=>e);w.setAccount(same?'A':'B','-new');wait.resolve(response({},401));
    assert.equal((await pending).code,'SESSION_CHANGED');assert.deepEqual(calls,['Bearer token-A']);
  });
  for(const stage of ['refresh','json'])await run('switch during '+stage+' cannot publish old session/data',async({w})=>{
    const wait=deferred();let reads=0;w.fetch=async(url)=>{
      if(url.includes('/rpc/'))return response({active:true,is_admin:true});
      if(url.includes('/auth/'))return {ok:true,status:200,json:()=>wait.promise};
      if(stage==='refresh'&&++reads===1)return response({},401);
      return {ok:true,status:200,json:()=>wait.promise};
    };
    const pending=w.restFetch('labels').catch(e=>e);await tick();w.setAccount('B');
    wait.resolve(stage==='refresh'?{access_token:'old-A',refresh_token:'old-refresh',user:{id:'A'}}:[{id:'old-row'}]);
    assert.equal((await pending).code,'SESSION_CHANGED');assert.equal(w.eval('cloudSession.user.id'),'B');
    assert.equal(JSON.parse(w.localStorage.getItem('eea_label_maker_supabase_session_v1')).user.id,'B');
  });
  await run('parallel expiry shares one refresh and delayed 401 uses rotated same-session token',async({w})=>{
    const auth=deferred(),late=deferred();let refreshes=0;const seen=[];
    w.fetch=async(url,o)=>{
      if(url.includes('/auth/')){refreshes++;return {ok:true,status:200,json:()=>auth.promise};}
      if(url.includes('/rpc/'))return response({active:true,is_admin:true});
      seen.push([url,o.headers.Authorization]);
      if(o.headers.Authorization==='Bearer token-A')return url.endsWith('late')?late.promise:response({},401);
      return response([]);
    };
    const jobs=[w.restFetch('labels'),w.restFetch('print_queue'),w.restFetch('late')];await tick();assert.equal(refreshes,1);
    auth.resolve({access_token:'token-A-rotated',refresh_token:'refresh-A-rotated',user:{id:'A'}});await tick();late.resolve(response({},401));await Promise.all(jobs);
    assert.equal(refreshes,1);assert.equal(seen.filter(x=>x[1]==='Bearer token-A-rotated').length,3);
  });
  await run('signout invalidates old refresh before waiting for logout',async({w})=>{
    const auth=deferred(),logout=deferred();w.fetch=async(url)=>{
      if(url.includes('/rpc/'))return response({active:true,is_admin:true});
      if(url.includes('grant_type=refresh_token'))return {ok:true,status:200,json:()=>auth.promise};
      if(url.includes('logout'))return logout.promise;
      if(url.includes('signup'))return response({access_token:'anon',refresh_token:'anon-r',user:{id:'anonymous'}});
      return response({},401);
    };
    const old=w.restFetch('labels').catch(e=>e);await tick();const signingOut=w.signOutPermanent();
    auth.resolve({access_token:'old-A',refresh_token:'old-r',user:{id:'A'}});assert.equal((await old).code,'SESSION_CHANGED');assert.equal(w.eval('currentUser'),null);
    logout.resolve(response({},204));await signingOut;assert.notEqual(w.eval('currentUser?.id'),'A');
  });
  await run('cross-tab replacement invalidates draft and old request',async({w,$,typed})=>{
    await typed();const wait=deferred();w.fetch=async(url)=>url.includes('/rpc/')?response({active:true}):wait.promise;
    const old=w.restFetch('labels').catch(e=>e);
    const next={access_token:'token-B',refresh_token:'refresh-B',user:{id:'B'}};
    w.dispatchEvent(new w.StorageEvent('storage',{key:'eea_label_maker_supabase_session_v1',newValue:JSON.stringify(next)}));
    wait.resolve(response([]));assert.equal((await old).code,'SESSION_CHANGED');assert.equal($('englishInput').value,'');assert.equal($('labelPhoto').getAttribute('src'),null);
  });
  await run('newer overlapping cloud read wins; read during a write cannot replace state',async({w,db})=>{
    const waits=[];const base=w.fetch;w.fetch=(url,o)=>{if(url.includes('/rpc/'))return response({active:true,is_admin:true});if(o.method==='POST')return base(url,o);const d=deferred();waits.push(d);return d.promise;};
    const first=w.loadCloudData(),second=w.loadCloudData();await tick();
    waits[2].resolve(response([{id:'new-queue'}]));waits[3].resolve(response([{id:'new-master'}]));await second;
    waits[0].resolve(response([{id:'old-queue'}]));waits[1].resolve(response([{id:'old-master'}]));assert.equal(await first,false);assert.equal(w.eval('queue[0].id'),'new-queue');
    const read=w.loadCloudData();await tick();await w.restFetch('labels?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates'},body:JSON.stringify([{id:'saved',english:'Synthetic'}])});
    waits[4].resolve(response([]));waits[5].resolve(response([]));assert.equal(await read,false);assert.equal(w.eval('queue[0].id'),'new-queue');assert.equal(db.labels.size,1);
  });
  await run('stale init failure cannot turn a newly signed-in account into local-only mode',async({w})=>{
    const waits=[];w.fetch=async(url)=>{
      if(url.includes('/auth/'))return response({access_token:'refreshed-A',refresh_token:'refreshed-r',user:{id:'A'}});
      if(url.includes('/rpc/'))return response({active:true,is_admin:true});const d=deferred();waits.push(d);return d.promise;
    };
    const init=w.initCloud();await tick();w.setAccount('B');for(const d of waits)d.resolve(response([]));await init;
    assert.equal(w.eval('currentUser.id'),'B');assert.equal(w.eval('cloudReady'),true);
  });
  for(const table of ['labels','print_queue'])for(const when of ['before','after'])await run('actual single save '+table+' '+when+'-commit retry is duplicate-proof',async({w,db,typed,click,$})=>{
    await typed();db.fail={table,when};click('addToQueue');click('addToQueue');await tick();
    assert.match($('singleSaveStatus').textContent,/Retry/);assert.equal(w.eval('singleSaveJob.complete'),false);
    click('addToQueue');await tick();assert.equal(db.labels.size,1);assert.equal(db.print_queue.size,2);assert.equal(w.eval('singleSaveJob.complete'),true);
    assert.equal(new Set(db.posts.filter(x=>x.table==='labels').flatMap(x=>x.rows.map(r=>r.id))).size,1);
    assert.equal(new Set(db.posts.filter(x=>x.table==='print_queue').flatMap(x=>x.rows.map(r=>r.id))).size,2);
  });
  await run('failed single retry keeps the real Back-to-Review wording and photo controls immutable',async({db,typed,click,$})=>{
    await typed('Original wording','Original translation');db.fail={table:'print_queue',when:'after'};click('addToQueue');await tick();click('setsBack');
    assert.equal($('englishInput').disabled,true);assert.equal($('spanishInput').disabled,true);assert.equal($('llCleanupToggle').disabled,true);
    click('chooseSetBtn');await tick();click('addToQueue');await tick();assert.equal(db.labels.size,1);assert.equal(db.print_queue.size,2);assert.equal([...db.labels.values()][0].english,'Original wording');
    assert.equal($('englishInput').disabled,false);
  });
  await run('read failure after both commits retries hydration without more inserts',async({w,db,typed,click})=>{
    await typed();db.failReads=true;click('addToQueue');await tick();assert.equal(db.posts.length,2);db.failReads=false;click('addToQueue');await tick();assert.equal(db.posts.length,2);assert.equal(w.eval('singleSaveJob.complete'),true);
  });
  await run('same-account automatic refresh continues a single save with stable IDs',async({w,db,typed,click})=>{
    await typed();const base=w.fetch;let expired=true,refreshes=0;
    w.fetch=async(url,o)=>{
      if(url.includes('/auth/')){refreshes++;return response({access_token:'token-A-new',refresh_token:'refresh-A-new',user:{id:'A'}});}
      if(expired&&o.method==='POST'&&url.includes('/labels?')){expired=false;return response({},401);}return base(url,o);
    };
    click('addToQueue');await tick();assert.equal(refreshes,1);assert.equal(db.labels.size,1);assert.equal(db.print_queue.size,2);assert.equal(w.eval('singleSaveJob.complete'),true);
  });
  await run('explicit new typed operation gets fresh queue IDs and a changed photo gets its own master',async({w,db,typed,click})=>{
    await typed();click('addToQueue');await tick();await typed();click('addToQueue');await tick();assert.equal(db.labels.size,1);assert.equal(db.print_queue.size,4);
    w.eval(`beginSingleDraft();currentCreationSource='photo';photoDataUrl='synthetic-new-photo';activePhotoDataUrl=photoDataUrl;show('sets');`);click('addToQueue');await tick();assert.equal(db.labels.size,2);assert.equal(db.print_queue.size,6);
  });
  await run('new typed review during old save remains independently saveable',async({w,db,typed,click})=>{
    await typed('Old','Old translation');const hold=deferred();let first=true;w.prepareCloudPhoto=value=>first?(first=false,hold.promise):Promise.resolve(value);
    click('addToQueue');await typed('New','New translation');hold.resolve('');await tick();click('addToQueue');await tick();assert.equal(db.labels.size,2);assert.equal(db.print_queue.size,4);
  });
  for(const table of ['labels','print_queue'])await run('actual multi-product partial '+table+' commit retries original stable snapshot',async({w,db,product,click,$})=>{
    await product([{english:'One',spanish:'Uno'},{english:'Two',spanish:'Dos'}]);db.fail={table,when:'after'};click('saveAllBatchBtn');click('saveAllBatchBtn');await tick();
    assert.equal($('batchSetSelect').disabled,true);w.eval(`batchDrafts[0].english='Changed after save';`);
    click('saveAllBatchBtn');await tick();assert.equal(db.labels.size,2);assert.equal(db.print_queue.size,4);assert.ok([...db.labels.values()].some(x=>x.english==='One'));assert.ok(![...db.labels.values()].some(x=>x.english==='Changed after save'));
  });
  await run('whole product validation occurs before any row is written',async({db,product,click})=>{
    await product([{english:'Valid',spanish:'Valido'},{english:'Invalid',spanish:''}]);click('saveAllBatchBtn');await tick();assert.equal(db.posts.length,0);
  });
  await run('reprint lost response is stable; selecting a different master is a separate operation',async({db,reprint,click})=>{
    await reprint('one');db.fail={table:'print_queue',when:'after'};click('reprintQueueBtn');await tick();await reprint('two');click('reprintQueueBtn');await tick();
    assert.equal(db.print_queue.size,4);await reprint('one');click('reprintQueueBtn');await tick();assert.equal(db.print_queue.size,4);
    await reprint('one');click('reprintQueueBtn');await tick();assert.equal(db.print_queue.size,6);
  });
  await run('copy lock and lost-response retry survive rerender; later intentional copy is new',async({w,db,seedCopy,copyButton})=>{
    await seedCopy();const hold=deferred();db.before=()=>hold.promise;db.fail={table:'print_queue',when:'after'};
    copyButton().click();w.refreshQueue();assert.equal(copyButton().disabled,true);copyButton().click();assert.equal(db.posts.length,1);
    db.before=null;hold.resolve();await tick();w.refreshQueue();assert.match(copyButton().textContent,/Retry/);copyButton().click();await tick();assert.equal(db.print_queue.size,2);
    copyButton().click();await tick();assert.equal(db.print_queue.size,3);
  });
  for(const kind of ['single','product'])await run(kind+' preparation interrupted by account change makes zero writes',async({w,db,typed,product,click,$})=>{
    if(kind==='single')await typed();else await product([{english:'Private A',spanish:'Privado'}]);const hold=deferred();w.prepareCloudPhoto=()=>hold.promise;
    click(kind==='single'?'addToQueue':'saveAllBatchBtn');w.setAccount('B');hold.resolve('synthetic-A-photo');await tick();assert.equal(db.posts.length,0);assert.equal($('englishInput').value,'');assert.equal($('batchReviewItems').textContent,'');
  });
  await run('photo compression is account-bound before identification can transmit it',async({w})=>{
    const hold=deferred();let sends=0;w.compressImage=()=>hold.promise;w.littleLabelsAIFetch=async()=>{sends++;return response({});};const pending=w.handlePhoto({name:'synthetic.png'});w.setAccount('B');hold.resolve('synthetic-private-photo');await pending;assert.equal(sends,0);assert.equal(w.eval('photoDataUrl'),'');
  });
  await run('same-ID verified anonymous conversion preserves an in-progress save',async({w,db,typed,click,$})=>{
    await typed();const hold=deferred();w.prepareCloudPhoto=()=>hold.promise;click('addToQueue');
    $('accountEmail').value='synthetic@example.invalid';$('accountCode').value='123456';w.authFetch=async()=>({access_token:'converted-A',refresh_token:'converted-r',user:{id:'A',is_anonymous:false,email:'synthetic@example.invalid'}});
    await w.verifyAccountEmail();hold.resolve('');await tick();assert.equal(db.labels.size,1);assert.equal(db.print_queue.size,2);
  });
  for(const kind of ['list','name'])await run(kind+' in-flight account reset clears rendered drafts and isolates newer controls',async({w,$,input,click})=>{
    if(kind==='list'){input('makeListInput','Private A');click('makeListCreateBtn');}
    else{input('nlNames','Private A');$('nameLabelsOverlay').classList.remove('hide');}
    const old=deferred(),fresh=deferred();let n=0;w.prepareCloudPhoto=()=>++n===1?old.promise:fresh.promise;
    click(kind==='list'?'mliPrint':'nlNext');w.setAccount('B');
    if(kind==='list'){assert.equal($('makeListInput').value,'');assert.equal($('mliItems').textContent,'');assert.ok($('mlIsolated').classList.contains('mli-hidden'));input('makeListInput','Fresh B');click('makeListCreateBtn');}
    else{assert.equal($('nlNames').value,'');assert.ok($('nameLabelsOverlay').classList.contains('hide'));input('nlNames','Fresh B');$('nameLabelsOverlay').classList.remove('hide');}
    const button=kind==='list'?'mliPrint':'nlNext';assert.equal($(button).disabled,false);click(button);assert.equal($(button).disabled,true);
    old.resolve('');await tick();assert.equal($(button).disabled,true,'Older finally cannot unlock the new save');fresh.resolve('');await tick();
    assert.equal(w.eval("queue.every(x=>x.english==='Fresh B')"),true);
  });
  await run('single in-flight account reset immediately restores a fresh account save button',async({w,typed,click,$})=>{
    await typed('Private A','Private second');const old=deferred();w.prepareCloudPhoto=()=>old.promise;click('addToQueue');w.setAccount('B');
    assert.equal($('addToQueue').disabled,false);await typed('Fresh B','Fresh second');old.resolve('');await tick();assert.equal($('addToQueue').disabled,false);
  });
  await run('account change clears print output and cancels a pending preview without changing renderer geometry',async({w,db,$})=>{
    db.print_queue.set('private-A',{id:'private-A',english:'Private A',spanish:'',photo_data:'',size:'Business Card'});await w.loadCloudData();
    const raster=deferred();w.rasterizeFinishedLabel=()=>raster.promise;const pending=w.createPrintSheets();
    w.setAccount('B');raster.resolve('data:image/png;base64,U1lOVEhFVElD');await pending;
    assert.equal($('printRoot').textContent,'');assert.equal($('printRoot').querySelectorAll('img').length,0);assert.equal($('sheetPreviewPages').textContent,'');assert.equal(w.eval('printBatchIds.length+printLayoutPages.length'),0);
  });
  await run('manual photo and save handler retries a lost queue response without AI',async({w,db,click,input})=>{
    w.compressImage=async()=> 'synthetic-photo-A';w.littleLabelsAIFetch=async()=>{throw Error('Photo must not call AI')};
    await w.handlePhoto({name:'synthetic.png'});input('englishInput','Photo label');input('spanishInput','Photo second');click('chooseSetBtn');await tick();db.fail={table:'print_queue',when:'after'};click('addToQueue');await tick();click('addToQueue');await tick();
    assert.equal(db.labels.size,1);assert.equal(db.print_queue.size,2);assert.equal([...db.labels.values()][0].photo_data,'synthetic-photo-A');
  });
  await run('account replacement clears synthetic password and verification form values',async({w,$})=>{
    const ids=['signInPassword','newAccountPassword','newAccountPassword2','recoveryPassword','recoveryPassword2','accountCode'];for(const id of ids)$(id).value='synthetic-placeholder';w.setAccount('B');for(const id of ids)assert.equal($(id).value,'');
  });
  console.log(`PASS ${count} synthetic account-bound persistence regression scenarios`);
})().catch(e=>{console.error(e);process.exitCode=1;});
