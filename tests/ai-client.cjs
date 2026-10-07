const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../ai-client.js'),'utf8');let count=0;
const json=(x,status=200)=>new Response(JSON.stringify(x),{status});
(async()=>{
 const events=new Map(),calls=[],rpcCalls=[];let isOwner=true,baseActive=true,provider=async()=>json({success:true});
 const ctx={Headers,AbortController,setTimeout,clearTimeout,Date,document:{addEventListener:(name,fn)=>{if(!events.has(name))events.set(name,[]);events.get(name).push(fn)}},SUPABASE_URL:'https://project.test',SUPABASE_PUBLISHABLE_KEY:'public-key',currentUser:{id:'owner-A',is_anonymous:false},cloudSession:{access_token:'JWT-A'},userIsPermanent:u=>u?.is_anonymous===false};
 ctx.fetch=async(url,opts)=>{if(url.includes('/rpc/')){rpcCalls.push({url,opts});return json(url.endsWith('little_labels_admin_status')?{is_admin:isOwner}:{active:baseActive})}calls.push({url,opts});return provider(url,opts)};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 const endpoint='https://project.test/functions/v1/translate-label';
 const go=options=>ctx.littleLabelsAIFetch(endpoint,{method:'POST',body:'{"english":"Blocks"}',...options});
 const result=await go();assert.deepEqual(await result.json(),{success:true});assert.equal(calls[0].opts.headers.get('Authorization'),'Bearer JWT-A');assert.equal(calls[0].opts.headers.get('apikey'),'public-key');assert.ok(rpcCalls.every(x=>x.opts.headers.Authorization==='Bearer JWT-A'));count++;
 await assert.rejects(ctx.littleLabelsAIFetch('https://wrong.test/functions/v1/translate-label',{}),/Unrecognized/);assert.equal(calls.length,1);count++;
 isOwner=false;ctx.currentUser.user_metadata={is_admin:true};ctx.currentUser.email='claimed-owner@example.invalid';await assert.rejects(go(),/not available/);assert.equal(calls.length,1);count++;
 isOwner=true;baseActive=false;await assert.rejects(go(),/not available/);assert.equal(calls.length,1);baseActive=true;count++;
 ctx.currentUser={id:'anonymous',is_anonymous:true};await assert.rejects(go(),/permanent/);assert.equal(calls.length,1);count++;
 ctx.currentUser={id:'owner-A',is_anonymous:false};ctx.cloudSession={};await assert.rejects(go(),/permanent/);assert.equal(calls.length,1);count++;
 ctx.cloudSession={access_token:'JWT-A'};provider=async()=>json({},401);await assert.rejects(go(),/expired/);assert.equal(calls.length,2);count++;
 provider=async()=>{ctx.currentUser={id:'owner-B',is_anonymous:false};ctx.cloudSession={access_token:'JWT-B'};return json({success:true})};await assert.rejects(go(),/account changed/);count++;
 ctx.currentUser={id:'owner-A',is_anonymous:false};ctx.cloudSession={access_token:'JWT-A'};provider=async()=>{for(const fn of events.get('little-label-auth-updated')||[])fn();return json({success:true})};await assert.rejects(go(),/account changed/);count++;
 provider=async()=>json({success:true});const late=await go();ctx.currentUser={id:'owner-B',is_anonymous:false};await assert.rejects(late.json(),/account changed/);count++;
 ctx.currentUser={id:'owner-A',is_anonymous:false};const before=calls.length;await assert.rejects(go({isCurrent:()=>false}),/cancelled/);assert.equal(calls.length,before);count++;
 const controller=new AbortController();controller.abort();await assert.rejects(go({signal:controller.signal}),/cancelled/);assert.equal(calls.length,before);count++;
 for(const file of ['index.html','language-settings.js','make-list-isolated.js','make-list-hotfix.js','type-a-label.js']){const s=fs.readFileSync(path.resolve(__dirname,'..',file),'utf8');assert.ok(!/\bfetch\((?:FUNCTION_URL|TRANSLATE_URL|BATCH_LABELS_URL|WORDING_URL|PICTURE_URL|TRANSLATE),/.test(s),'AI caller bypasses helper: '+file);count++}
 console.log(`PASS ${count} owner-capability, JWT and account-race checks; synthetic transport only`);
})().catch(e=>{console.error(e);process.exitCode=1});
