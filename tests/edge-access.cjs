const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {stripTypeScriptTypes} = require('node:module');
const root=path.resolve(__dirname,'..');
const slugs=['identify-material','translate-label','batch-labels','batch-wording','label-picture'];
const strip=s=>stripTypeScriptTypes(s.replace(/^import[^;]+;\s*/gm,'').replace(/\bexport\s+(?=(?:async\s+)?(?:function|class|const))/g,''));
const shared=strip(fs.readFileSync(path.join(root,'supabase/functions/_shared/access.ts'),'utf8'));
const json=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'Content-Type':'application/json'}});
let total=0;
async function run(slug,scenario,mode="list_wording"){
  let handler;const calls=[];
  const ctx={Request,Response,AbortSignal,URL,Uint8Array,TextDecoder,TextEncoder,btoa,console,isIP:require('node:net').isIP,setTimeout,clearTimeout,Deno:{env:{get:k=>({SUPABASE_URL:'https://supabase.test',SUPABASE_ANON_KEY:'public-test-key',OPENAI_API_KEY:'mock-only-key'}[k])},serve:fn=>handler=fn},fetch:async(url,options)=>{
    calls.push(String(url));
    if(String(url).endsWith('/auth/v1/user')){
      assert.equal(options.headers.Authorization,'Bearer test-user-token');
      if(scenario==='auth-down')throw new Error('offline');
      if(scenario==='invalid'||scenario==='expired'||scenario==='apikey-only')return json({},401);
      if(scenario==='anonymous')return json({id:'synthetic-user',is_anonymous:true});
      if(scenario==='unknown-permanence')return json({id:'synthetic-user'});
      return json({id:'synthetic-user',is_anonymous:false});
    }
    if(String(url).endsWith('/rpc/little_labels_access_status')){
      assert.equal(options.headers.Authorization,'Bearer test-user-token');
      if(scenario==='status-down')return json({},500);
      if(scenario==='status-invalid-json')return new Response('oops');
      return json({active:!['no-entitlement','disabled','cross-owner'].includes(scenario)});
    }
    if(String(url).endsWith('/rpc/consume_little_labels_ai_quota')){ assert.equal(options.headers.Authorization,'Bearer test-user-token');assert.equal(JSON.parse(options.body).category_input,(slug==='label-picture'||slug==='batch-labels'&&mode==='image')?'picture':'text');if(scenario==='quota-down')return json({},500);if(scenario==='quota-revoked')return json({allowed:false,reason:'access'});if(scenario==='quota-minute'||scenario==='quota-day')return json({allowed:false,reason:scenario==='quota-minute'?'minute_limit':'daily_limit',retry_after:60});return json({allowed:true}); }
    if(String(url).startsWith('https://api.openai.com/')){
      assert.equal(scenario,'valid');
      if(slug==='label-picture'||slug==='batch-labels'&&mode==='image')return json({data:[{b64_json:'c3ludGhldGlj'}]});
      if(slug==='batch-labels'&&mode==='url')return json({output:[{content:[{type:'output_text',text:JSON.stringify({english:'Blocks',translation:'Bloques'})}]}]});
      if(slug==='translate-label')return json({output:[{content:[{type:'output_text',text:'Bloques'}]}]});
      const output=slug==='identify-material'?{english:'Blocks',translation:'Bloques',category:'Toy',confidence:'high',notes:''}:{items:[{english:'Blocks',spanish:'Bloques',translation:'Bloques'}]};
      return json({output:[{content:[{type:'output_text',text:JSON.stringify(output)}]}]});
    }
    if(url==='https://retailer.example.com/product')return new Response('<html><title>Synthetic blocks</title></html>');
    throw new Error('Unmocked external request denied: '+url);
  }};
  vm.createContext(ctx);if(slug==='batch-labels'){vm.runInContext(strip(fs.readFileSync(path.join(root,'supabase/functions/batch-labels/product-network.ts'),'utf8')),ctx);ctx.fetchProductContent=async(url)=>{calls.push(url);assert.equal(scenario,'valid');return {url,bytes:new TextEncoder().encode('<html><title>Synthetic blocks</title></html>')}};}vm.runInContext(shared+'\n'+strip(fs.readFileSync(path.join(root,'supabase/functions',slug,'index.ts'),'utf8')),ctx);
  const method=scenario==='preflight'?'OPTIONS':scenario==='wrong-method'?'GET':'POST';
  const headers=scenario==='apikey-only'?{apikey:'public-test-key'}:scenario==='missing'?{}:{Authorization:'Bearer test-user-token','Content-Type':'application/json'};
  const payload={...(scenario==='client-claims'?{explicitAction:true,credits:99999,paidAI:true,entitlement:'paid'}:{}),english:'Blocks',imageDataUrl:'data:image/png;base64,c3ludGhldGlj',mode,url:'https://retailer.example.com/product',items:['Blocks']};
  const req=new Request('https://edge.test/'+slug,{method,headers,...(method==='POST'?{body:scenario==='bad-json-before-auth'?'not-json':JSON.stringify(payload)}:{})});
  if(scenario==='bad-json-before-auth')req.headers.delete('Authorization');
  const response=await handler(req);
  let expected={valid:200,preflight:200,'wrong-method':405,missing:401,'bad-json-before-auth':401,invalid:401,expired:401,'apikey-only':401,anonymous:403,'unknown-permanence':403,'no-entitlement':403,disabled:403,'cross-owner':403,'auth-down':503,'status-down':503,'status-invalid-json':503,'quota-minute':429,'quota-day':429,'quota-down':503,'quota-revoked':403}[scenario];
  if(slug==='identify-material'&&['valid','quota-minute','quota-day','quota-down','quota-revoked','client-claims'].includes(scenario))expected=503;
  if(slug==='identify-material')assert.equal(calls.some(x=>x.includes('consume_little_labels_ai_quota')),false,'No quota consumed without a paid credit operation');
  assert.equal(response.status,expected,`${slug} ${scenario}`);
  const upstream=calls.filter(x=>x.includes('api.openai.com')).length;
  assert.equal(upstream,scenario==='valid'&&slug!=='identify-material'?1:0,`${slug} ${scenario} upstream must remain guarded`);
  if(response.status===429)assert.equal(response.headers.get('Retry-After'),'60');
  if(['missing','apikey-only','preflight','wrong-method','bad-json-before-auth'].includes(scenario))assert.equal(calls.length,0);
  total++;
}
(async()=>{await run('identify-material','client-claims');for(const slug of slugs)for(const scenario of ['valid','preflight','wrong-method','missing','bad-json-before-auth','invalid','expired','apikey-only','anonymous','unknown-permanence','no-entitlement','disabled','cross-owner','auth-down','status-down','status-invalid-json','quota-minute','quota-day','quota-down','quota-revoked'])await run(slug,scenario);for(const mode of ['url','image'])for(const scenario of ['valid','missing','no-entitlement','quota-minute','quota-day'])await run('batch-labels',scenario,mode);console.log(`PASS ${total} edge access cases; all upstream calls mocked`);})().catch(e=>{console.error(e);process.exitCode=1;});
