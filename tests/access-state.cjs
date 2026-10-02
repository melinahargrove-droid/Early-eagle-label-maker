const {JSDOM}=require('jsdom');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const dom=new JSDOM('<html><head></head><body><section id="home"></section><section id="account" class="hidden"></section><section id="passwordRecovery" class="hidden"></section></body></html>',{runScripts:'outside-only',url:'https://synthetic.invalid'});
 const w=dom.window,$=id=>w.document.getElementById(id),tick=()=>new Promise(r=>setImmediate(r));
 w.currentUser=null;w.cloudSession=null;w.SUPABASE_URL='https://synthetic.invalid';w.SUPABASE_PUBLISHABLE_KEY='synthetic-public';
 w.userIsPermanent=u=>!!u&&!u.is_anonymous&&!!u.email;
 w.show=id=>{for(const name of ['home','account','passwordRecovery'])$(name).classList.toggle('hidden',id!==name);w.LittleLabelsAccess?.onNavigate(id)};
 const requests=[];w.fetch=(url,options)=>new Promise(resolve=>requests.push({url,options,resolve}));
 const reply=(req,body,ok=true)=>req.resolve({ok,json:async()=>body});
 const session=(id,permanent=true)=>{w.currentUser={id,is_anonymous:!permanent,email:permanent?'synthetic@example.invalid':''};w.cloudSession={access_token:'synthetic-'+id};w.document.dispatchEvent(new w.Event('little-label-auth-updated'))};
 const gated=()=>!$('llAccessGate').classList.contains('lla-hidden');
 try{
 w.eval(fs.readFileSync(path.join(__dirname,'../commercial-access.js'),'utf8'));await tick();
 assert.ok(gated());assert.equal(requests.length,0);
 for(let n=0;n<3;n++){ $('llaAccount').click();assert.equal(gated(),false);$('llAccessGate').style.pointerEvents='none';w.show('home');assert.ok(gated());assert.equal($('llAccessGate').style.pointerEvents,'auto') }
 console.log('PASS immediate anonymous gate and repeated returns restore hit testing');
 session('paid');assert.ok(gated());const old=requests.shift();session('unpaid');const newer=requests.shift();reply(old,{active:true});await tick();assert.ok(gated());assert.equal(w.LittleLabelsAccess.isActive(),false);reply(newer,{active:false});await tick();assert.ok(gated());
 console.log('PASS stale purchased response cannot unlock changed identity');
 w.show('account');w.dispatchEvent(new w.Event('focus'));reply(requests.shift(),{active:false});await tick();assert.equal(gated(),false);w.show('home');assert.ok(gated());reply(requests.shift(),{active:true});await tick();assert.equal(gated(),false);assert.ok(w.LittleLabelsAccess.isActive());w.show('home');assert.equal(requests.length,0);
 console.log('PASS purchased return rechecks; protected navigation preserves verified access');
 w.show('passwordRecovery');w.dispatchEvent(new w.Event('focus'));reply(requests.shift(),{},false);await tick();assert.equal(gated(),false);w.show('home');reply(requests.shift(),{},false);await tick();assert.ok(gated());$('llaRetryAccess').click();reply(requests.shift(),{active:false});await tick();assert.ok(gated());
 console.log('PASS recovery survives refresh and errors fail closed with retry');
 $('llaCode').value='SYNTHETIC';$('llaActivate').click();const activation=requests.shift();w.dispatchEvent(new w.Event('focus'));assert.equal(requests.length,0);reply(activation,{success:true});await tick();assert.equal(gated(),false);
 console.log('PASS focus cannot discard successful activation');
 session('same',false);assert.ok(gated());session('same',true);assert.equal(requests.length,1);reply(requests.shift(),{active:false});await tick();assert.ok(gated());
 console.log('PASS same-ID conversion rechecks entitlement');
 }finally{w.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
