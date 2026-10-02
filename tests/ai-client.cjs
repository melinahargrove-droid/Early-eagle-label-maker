const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../ai-client.js'),'utf8');let count=0;
async function run(){
 let listener;const calls=[];let response=json({success:true});
 const ctx={Headers,document:{addEventListener:(name,fn)=>listener=fn},SUPABASE_URL:'https://project.test',SUPABASE_PUBLISHABLE_KEY:'public-key',currentUser:{id:'owner-A',is_anonymous:false},cloudSession:{access_token:'JWT-A'},userIsPermanent:u=>u?.is_anonymous===false,fetch:async(url,opts)=>{calls.push({url,opts});return response}};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 const endpoint='https://project.test/functions/v1/translate-label';
 const go=()=>ctx.littleLabelsAIFetch(endpoint,{method:'POST',body:'{"english":"Blocks"}'});
 const r=await go();assert.deepEqual(await r.json(),{success:true});assert.equal(calls[0].opts.headers.get('Authorization'),'Bearer JWT-A');assert.equal(calls[0].opts.headers.get('apikey'),'public-key');count++;
 await assert.rejects(ctx.littleLabelsAIFetch('https://wrong.test/functions/v1/translate-label',{}),/Unrecognized/);assert.equal(calls.length,1);count++;
 ctx.currentUser={id:'anonymous',is_anonymous:true};await assert.rejects(go(),/permanent/);assert.equal(calls.length,1);count++;
 ctx.currentUser={id:'owner-A',is_anonymous:false};ctx.cloudSession={};await assert.rejects(go(),/permanent/);assert.equal(calls.length,1);count++;
 ctx.cloudSession={access_token:'JWT-A'};ctx.fetch=async()=>{calls.push({});return json({},401)};await assert.rejects(go(),/expired/);assert.equal(calls.length,2);count++;
 ctx.fetch=async()=>{ctx.currentUser={id:'owner-B',is_anonymous:false};ctx.cloudSession={access_token:'JWT-B'};return json({success:true})};await assert.rejects(go(),/account changed/);count++;
 ctx.currentUser={id:'owner-A',is_anonymous:false};ctx.cloudSession={access_token:'JWT-A'};ctx.fetch=async()=>{listener();return json({success:true})};await assert.rejects(go(),/account changed/);count++;
 ctx.fetch=async()=>json({success:true});const late=await go();ctx.currentUser={id:'owner-B',is_anonymous:false};await assert.rejects(late.json(),/account changed/);count++;
 for(const file of ['index.html','language-settings.js','make-list-isolated.js','make-list-hotfix.js','type-a-label.js']){const s=fs.readFileSync(path.resolve(__dirname,'..',file),'utf8');assert.ok(!/\bfetch\((?:FUNCTION_URL|TRANSLATE_URL|BATCH_LABELS_URL|WORDING_URL|PICTURE_URL|TRANSLATE),/.test(s),'AI caller bypasses helper: '+file);count++}
 console.log(`PASS ${count} AI client JWT and account-race checks`);
}
function json(x,status=200){return new Response(JSON.stringify(x),{status})}run().catch(e=>{console.error(e);process.exitCode=1});
