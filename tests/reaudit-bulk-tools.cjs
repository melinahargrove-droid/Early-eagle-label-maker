const assert=require('node:assert/strict');
const {fixture,tick,photo,reply,deferred}=require('./audit-fixture.cjs');
const open=f=>{f.w.show('makeList');f.input('makeListInput','Synthetic Blocks\nSynthetic Paper');f.$('makeListCreateBtn').click();};
const settle=async()=>{await tick();await tick();};
async function expand(f,value=true){f.$('mliOptionalTools').open=value;await settle();}
let count=0;
async function test(name,fn,owner=true){const f=await fixture(owner);try{open(f);await settle();await fn(f);await settle();assert.deepEqual(f.errors,[]);console.log('PASS '+name);count++;}finally{f.close()}}
(async()=>{
 await test('owner text-only review starts with closed optional tools and manual controls',async f=>{
  const tools=f.$('mliOptionalTools');assert.equal(tools.hidden,false);assert.equal(tools.open,false);assert.equal(tools.querySelector('summary').textContent,'Optional AI tools');
  assert.equal(f.$('mliTranslate').classList.contains('mli-primary'),false);assert.equal(f.$('mliAllPics').classList.contains('mli-primary'),false);
  assert.ok([...f.w.document.querySelectorAll('.mli-picbtn')].every(x=>x.hidden));assert.equal(f.w.document.querySelectorAll('.mli-upload').length,2);
  assert.equal(f.$('mliSave').disabled,false);assert.equal(f.$('mliPrint').disabled,false);assert.equal(f.ai().length,0);
 });
 await test('opening and closing tools preserves manual edits and does not dispatch AI',async f=>{
  f.input('mliEnglish-0','Teacher wording');f.input('mliTranslation-0','Manual second line');const input=f.$('mliEnglish-0');
  await expand(f);assert.ok([...f.w.document.querySelectorAll('.mli-picbtn')].every(x=>!x.hidden));assert.equal(f.$('mliEnglish-0'),input);
  await expand(f,false);assert.ok([...f.w.document.querySelectorAll('.mli-picbtn')].every(x=>x.hidden));assert.equal(f.$('mliEnglish-0').value,'Teacher wording');assert.equal(f.$('mliTranslation-0').value,'Manual second line');assert.equal(f.ai().length,0);
 });
 await test('an explicit expanded owner action still requests consent and executes once',async f=>{
  await expand(f);f.$('mliTranslate').click();await settle();assert.equal(f.ai().filter(x=>x.path.endsWith('/batch-wording')).length,1);assert.ok(f.prompts.some(x=>/AI processing/.test(x)));assert.match(f.$('mliTranslation-0').value,/Manual-ready/);
 });
 await test('collapsing an in-flight action keeps Cancel available and stops later results',async f=>{
  const hold=deferred();f.setHook(r=>r.path.endsWith('/label-picture')?hold.promise:undefined);await expand(f);f.$('mliAllPics').click();await settle();assert.equal(f.ai().length,1);
  await expand(f,false);assert.equal(f.$('mliCancel').hidden,false);assert.equal(f.$('mliCancel').closest('details'),null);assert.equal(f.w.document.querySelector('.mli-time-note').hidden,false);
  f.$('mliCancel').click();hold.resolve(reply({success:true,photo_data:photo}));await settle();assert.equal(f.ai().length,1);assert.equal(f.w.document.querySelectorAll('.mli-preview img').length,0);assert.equal(f.$('mliSave').disabled,false);
 });
 await test('returning to a draft closes optional tools but preserves manual wording',async f=>{
  f.input('mliEnglish-0','Keep this wording');await expand(f);f.$('mliBack').click();f.$('makeListCreateBtn').click();await settle();assert.equal(f.$('mliOptionalTools').open,false);assert.equal(f.$('mliEnglish-0').value,'Keep this wording');assert.equal(f.ai().length,0);
 });
 await test('nonowner retains manual controls and the single truthful unlock entry',async f=>{
  assert.equal(f.$('mliOptionalTools').hidden,true);assert.equal(f.$('mliUnlock').hidden,false);assert.ok([...f.w.document.querySelectorAll('.mli-picbtn')].every(x=>x.hidden));f.$('mliSave').click();await settle();assert.equal(f.w.eval('library.length'),2);assert.equal(f.ai().length,0);
 },false);
 await test('losing owner capability hides and closes optional tools without losing manual rows',async f=>{
  await expand(f);f.input('mliEnglish-0','Keep manual row');f.setOwner(false);await f.w.LittleLabelsOwnerAI.check(true);await settle();assert.equal(f.$('mliOptionalTools').hidden,true);assert.equal(f.$('mliOptionalTools').open,false);assert.equal(f.$('mliEnglish-0').value,'Keep manual row');assert.equal(f.ai().length,0);
 });
 console.log(`PASS ${count} optional bulk-tool hierarchy and intent scenarios; synthetic I/O only`);
})().catch(error=>{console.error(error);process.exitCode=1});
