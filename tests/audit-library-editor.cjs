// Exercise real saved-label controls with synthetic account/database responses.
const {fixture,tick,photo,reply,deferred}=require('./audit-fixture.cjs');
const assert=require('node:assert/strict');
const original={id:'synthetic-master',english:'Blocks',spanish:'Bloques',photo:''};
function seed(f){f.w.eval(`library=${JSON.stringify([original])};queue=${JSON.stringify([{id:'synthetic-copy',label_id:original.id,english:'Blocks',spanish:'Bloques',photo:'',size:'Business Card'}])};refreshLibrary();refreshQueue();show('library');`)}
function open(f){f.w.document.querySelector('#libraryItems button').click();}
function state(f,name){return JSON.parse(f.w.eval(`JSON.stringify(${name})`));}
async function settle(){await tick();await tick();await tick();}
let count=0;async function test(name,run){const f=await fixture(false);try{seed(f);await run(f);await settle();assert.deepEqual(f.errors,[]);assert.equal(f.ai().length,0);console.log('PASS '+name);count++;}finally{f.close()}}
(async()=>{
 await test('Save Changes updates only the master and leaves all queued snapshots untouched',async f=>{open(f);assert.match(f.$('llLibraryEditor').textContent,/Copies already in Ready to Print keep/);f.input('lleEnglish','Counting blocks');f.input('lleSecond','Teacher translation');f.$('lleSave').click();await settle();assert.equal(state(f,'library').length,1);assert.equal(state(f,'library')[0].id,original.id);assert.equal(state(f,'library')[0].english,'Counting blocks');assert.equal(state(f,'queue')[0].english,'Blocks');assert.match(f.$('librarySaveNotice').textContent,/kept unchanged/);});
 await test('Save Copy double click makes one new master without adding print copies',async f=>{open(f);f.input('lleEnglish','Copy of blocks');f.$('lleCopy').click();f.$('lleCopy').click();await settle();assert.equal(state(f,'library').length,2);assert.equal(state(f,'library')[0].english,'Blocks');assert.equal(state(f,'library')[1].english,'Copy of blocks');assert.notEqual(state(f,'library')[1].id,original.id);assert.equal(state(f,'queue').length,1);});
 await test('Cancel leaves the saved master and print snapshots unchanged',async f=>{open(f);f.input('lleEnglish','Not saved');f.$('lleCancel').click();open(f);assert.equal(f.$('lleEnglish').value,'Blocks');assert.equal(state(f,'queue')[0].english,'Blocks');});
 await test('repeated controls identify their labels without relying on row position',async f=>{for(const selector of ['#libraryItems button','#queueItems button'])for(const button of f.w.document.querySelectorAll(selector))assert.match(button.getAttribute('aria-label'),/Blocks/);});
 await test('rapid photo replacement keeps the newest photo and never calls a provider',async f=>{open(f);const first=deferred(),second=deferred();let n=0;f.w.compressImage=()=>++n===1?first.promise:second.promise;const select=()=>{Object.defineProperty(f.$('llePhotoInput'),'files',{value:[new f.w.File(['synthetic'],'synthetic.png',{type:'image/png'})],configurable:true});f.$('llePhotoInput').dispatchEvent(new f.w.Event('change'));};select();select();second.resolve(photo);await settle();first.resolve(photo+'stale');await settle();assert.equal(f.$('llePhoto').getAttribute('src'),photo);f.$('lleRemovePhoto').click();assert.equal(f.$('llePhotoWrap').hidden,true);});
 await test('failed replacement retains prior photo and wording',async f=>{f.w.eval(`library[0].photo=${JSON.stringify(photo)}`);open(f);f.input('lleEnglish','Teacher wording');f.w.compressImage=async()=>{throw Error('Synthetic decode failure')};Object.defineProperty(f.$('llePhotoInput'),'files',{value:[new f.w.File(['x'],'broken.png',{type:'image/png'})],configurable:true});f.$('llePhotoInput').dispatchEvent(new f.w.Event('change'));await settle();assert.equal(f.$('llePhoto').getAttribute('src'),photo);assert.equal(f.$('lleEnglish').value,'Teacher wording');assert.equal(f.$('lleSave').disabled,false);});
 await test('lost PATCH response is reconciled before retry and does not touch queue',async f=>{
  const row={id:original.id,english:'Blocks',spanish:'Bloques',photo_data:''};let patches=0,lost=true;f.w.eval('cloudReady=true');
  f.setHook(r=>{if(r.path.endsWith('/labels')){if(r.options.method==='PATCH'){patches++;Object.assign(row,r.body);if(lost){lost=false;throw Error('Synthetic lost response')}return reply([row]);}return reply([row]);}if(r.path.endsWith('/print_queue'))return reply([{id:'synthetic-copy',label_id:original.id,english:'Blocks',spanish:'Bloques',photo_data:'',size:'Business Card'}]);});
  open(f);f.input('lleEnglish','Cloud edit');f.$('lleSave').click();await settle();assert.match(f.$('lleStatus').textContent,/Retry/);f.$('lleSave').click();await settle();assert.equal(patches,1);assert.equal(state(f,'library')[0].english,'Cloud edit');assert.equal(state(f,'queue')[0].english,'Blocks');
 });
 await test('changed server master is kept and the stale draft may be saved as a copy',async f=>{
  const row={id:original.id,english:'Newer device wording',spanish:'Bloques',photo_data:''};let patches=0;f.w.eval('cloudReady=true');f.setHook(r=>{if(r.path.endsWith('/labels')){if(r.options.method==='PATCH')patches++;return reply([row]);}});open(f);f.input('lleEnglish','My older draft');f.$('lleSave').click();await settle();assert.equal(patches,0);assert.match(f.$('lleStatus').textContent,/changed elsewhere/);assert.equal(f.$('lleSave').disabled,true);assert.equal(f.$('lleCopy').disabled,false);f.$('lleCancel').click();open(f);assert.equal(f.$('lleEnglish').value,'Newer device wording');
 });
 await test('account replacement hides the draft and cannot hydrate an old completed write',async f=>{
  const wait=deferred();let patches=0;f.w.eval('cloudReady=true');f.setHook(r=>{if(r.path.endsWith('/labels')){if(r.options.method==='PATCH'){patches++;return wait.promise;}return reply([{id:original.id,english:'Blocks',spanish:'Bloques',photo_data:''}]);}});open(f);f.input('lleEnglish','Private old account');f.$('lleSave').click();await settle();assert.equal(patches,1);await f.switchAccount('customer-B');wait.resolve(reply([{id:original.id,english:'Private old account',spanish:'',photo_data:''}]));await settle();assert.equal(f.$('llLibraryEditor').classList.contains('hidden'),true);assert.equal(f.$('lleEnglish').value,'');assert.ok(!state(f,'library').some(x=>x.english==='Private old account'));
 });

 await test('renaming outside the current search returns focus to a visible search field',async f=>{f.input('librarySearch','Blocks');open(f);f.input('lleEnglish','Pencils');f.$('lleSave').click();await settle();assert.equal(f.w.document.activeElement.id,'librarySearch');assert.equal(f.$('llLibraryEditor').classList.contains('hidden'),true);});
 for(const outcome of ['success','lost','conflict'])await test('reopening a pending '+outcome+' save settles the active editor',async f=>{
  const hold=deferred(),row={id:original.id,english:'Blocks',spanish:'Bloques',photo_data:''};let patches=0;f.w.eval('cloudReady=true');
  f.setHook(r=>{if(r.path.endsWith('/labels')){if(outcome==='conflict'&&!patches){patches++;return hold.promise;}if(r.options.method==='PATCH'){patches++;Object.assign(row,r.body);return hold.promise;}return reply([row]);}if(r.path.endsWith('/print_queue'))return reply([]);});
  open(f);f.input('lleEnglish','Pending changes');f.$('lleSave').click();await settle();f.$('lleCancel').click();open(f);assert.equal(f.$('lleSave').disabled,true);
  if(outcome==='lost')hold.reject(Error('Synthetic lost response'));
  else if(outcome==='conflict')hold.resolve(reply([{...row,english:'Newer device wording'}]));
  else hold.resolve(reply([row]));
  await settle();
  if(outcome==='success')assert.equal(f.$('llLibraryEditor').classList.contains('hidden'),true);
  else if(outcome==='lost'){assert.equal(f.$('lleSave').disabled,false);assert.match(f.$('lleStatus').textContent,/Retry/);}
  else{assert.equal(f.$('lleCopy').disabled,false);f.$('lleCancel').click();assert.ok(f.w.document.activeElement.closest('#library'));}
 });

 await test('a disappeared cloud master keeps the draft available for explicit Save Copy',async f=>{f.w.eval('cloudReady=true');f.setHook(r=>r.path.endsWith('/labels')?reply([]):undefined);open(f);f.input('lleEnglish','Preserved draft');f.$('lleSave').click();await settle();assert.equal(f.$('lleCopy').disabled,false);assert.equal(f.$('lleSave').disabled,true);assert.equal(f.$('lleEnglish').value,'Preserved draft');assert.match(f.$('lleStatus').textContent,/no longer available/);assert.ok(!f.calls.some(r=>r.options.method==='PATCH'||r.options.method==='DELETE'));});
 await test('changed cloud photos require Save Copy while wording updates retain the original bytes',async f=>{f.w.eval('cloudReady=true');open(f);f.w.compressImage=async()=>photo;Object.defineProperty(f.$('llePhotoInput'),'files',{value:[new f.w.File(['synthetic'],'fixture.png',{type:'image/png'})],configurable:true});f.$('llePhotoInput').dispatchEvent(new f.w.Event('change'));await settle();assert.equal(f.$('lleSave').disabled,true);assert.equal(f.$('lleCopy').disabled,false);assert.equal(f.$('llePhotoPolicy').hidden,false);assert.ok(!f.calls.some(r=>r.options.method==='PATCH'));});

 await test('conditional wording update cannot overwrite a concurrent device edit after the read',async f=>{
  f.w.eval('cloudReady=true');const row={id:original.id,english:'Blocks',spanish:'Bloques',photo_data:''};let raced=false,patches=0;
  f.setHook(r=>{if(r.path.endsWith('/labels')){if(r.options.method==='PATCH'){patches++;const query=new URL(r.url).searchParams;assert.equal(JSON.parse(query.get('english').slice(3)),'Blocks');assert.equal(JSON.parse(query.get('spanish').slice(3)),'Bloques');return reply([]);}const result={...row};if(!raced){raced=true;row.english='Concurrent wording';}return reply([result]);}});
  open(f);f.input('lleEnglish','My wording');f.$('lleSave').click();await settle();assert.equal(patches,1);assert.equal(row.english,'Concurrent wording');f.$('lleSave').click();await settle();assert.equal(patches,1);assert.equal(f.$('lleCopy').disabled,false);assert.match(f.$('lleStatus').textContent,/changed elsewhere/);
 });
 console.log(`PASS ${count} saved-library editor scenarios; all I/O synthetic`);
})().catch(e=>{console.error(e);process.exitCode=1});
