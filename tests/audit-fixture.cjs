// Production handlers with synthetic accounts, images and responses only.
const {JSDOM,ResourceLoader,VirtualConsole}=require('jsdom');
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),tick=()=>new Promise(r=>setTimeout(r,15));
const photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP88OEDAwMDEwMDAwMDAwAh6gLUcoFD3wAAAABJRU5ErkJggg==';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};
const reply=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'Content-Type':'application/json'}});
class Local extends ResourceLoader{fetch(url){const u=new URL(url);return u.hostname==='labels.test'&&u.pathname.endsWith('.js')?Promise.resolve(fs.readFileSync(path.join(root,u.pathname))):null}}
async function fixture(owner=true,stored={}){
 const errors=[],calls=[],prompts=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));let hook=null,account='owner-A';
 const session=id=>({access_token:'synthetic-'+id,refresh_token:'synthetic-r-'+id,expires_in:3600,user:{id,is_anonymous:false,email:id+'@example.invalid',identities:[{}]}});
 const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'https://labels.test/',resources:new Local(),runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  w.Headers=Headers;w.Response=Response;w.AbortController=AbortController;w.TextEncoder=TextEncoder;w.scrollTo=()=>{};w.alert=()=>{};w.confirm=text=>{prompts.push(text);return true};w.localStorage.setItem('littleLabelsWelcomeSeenV1','1');for(const [k,v] of Object.entries(stored))w.localStorage.setItem(k,v);w.localStorage.setItem('eea_label_maker_supabase_session_v1',JSON.stringify(session(account)));
  w.Image=class{constructor(){this.naturalWidth=this.naturalHeight=2}set src(v){queueMicrotask(()=>this.onload?.())}};
  w.HTMLCanvasElement.prototype.getContext=()=>({fillRect(){},drawImage(){}});w.HTMLCanvasElement.prototype.toDataURL=()=>photo;
  w.fetch=async(url,options={})=>{
   const p=new URL(url).pathname,record={url:String(url),path:p,options,body:options.body?JSON.parse(options.body):null};calls.push(record);
   if(hook){const value=await hook(record);if(value!==undefined)return value;}
   if(p.includes('/auth/'))return reply(session(account));
   if(p.endsWith('/little_labels_access_status'))return reply({active:true});
   if(p.endsWith('/little_labels_admin_status'))return reply({is_admin:owner&&account==='owner-A'});
   if(p.includes('/rpc/'))return reply({is_admin:false});
   if(p.endsWith('/identify-material'))return reply({success:true,identification:{english:'Blocks',translation:'Bloques',spanish:'Bloques',language:'es'}});
   if(p.endsWith('/translate-label'))return reply({success:true,translation:'Traducido',language:record.body.target_language});
   if(p.endsWith('/batch-wording'))return reply({success:true,items:record.body.items.map(english=>({english,translation:'Manual-ready '+english}))});
   if(p.endsWith('/label-picture'))return reply({success:true,photo_data:photo});
   if(p.endsWith('/batch-labels'))return reply({success:true,items:[{english:'Product blocks',translation:'Bloques',spanish:'Bloques',target_language:record.body.target_language,photo_data:photo,image_source:'product',needs_product_image:false}]});
   if(p.includes('/rest/'))return reply([]);
   throw Error('Unmocked request '+p);
  };
 }});
 const w=dom.window;await new Promise(r=>w.addEventListener('load',r));await tick();await w.LittleLabelsOwnerAI.check(true);w.eval('cloudReady=false;');
 const $=id=>w.document.getElementById(id),input=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new w.Event('input',{bubbles:true}))};
 return{w,$,input,calls,prompts,errors,ai:()=>calls.filter(x=>x.path.includes('/functions/')),setHook:fn=>hook=fn,setOwner:value=>owner=value,async switchAccount(id){account=id;w.eval(`saveCloudSession(${JSON.stringify(session(id))});cloudReady=false;updateAccountUI();`);await tick()},close:()=>w.close()};
}
module.exports={fixture,tick,photo,reply,deferred};
