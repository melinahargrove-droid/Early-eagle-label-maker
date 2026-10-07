const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto'),vm=require('vm');
const root=path.resolve(__dirname,'../dist'),source=JSON.parse(fs.readFileSync(path.join(root,'../SOURCE-CHECKPOINT.json'),'utf8'));
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
assert.match(html,/Content-Security-Policy/);assert.match(html,/worker-src 'none'/);assert.match(html,/form-action 'none'/);assert.match(html,/connect-src 'self'/);
assert.doesNotMatch(html,/<link[^>]+rel="manifest"/);
assert.doesNotMatch(html,/<script[^>]+src="\.\/(commercial-access|little-labels-admin|onboarding-help|pwa-version-fix)/);
assert.doesNotMatch(html,/await initCloud\(\)/);assert.match(html,/LittleLabelsPreview.initialize/);
for(const name of fs.readdirSync(root)){
 const raw=fs.readFileSync(path.join(root,name)),text=raw.toString();
 assert.doesNotMatch(text,/ctmqvbsjliinlddfolti|sb_publishable_/,'Production backend/key absent: '+name);
 if(name.endsWith('.js'))new vm.Script(text,{filename:name});
 if(source.served_sha256[name])assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),source.served_sha256[name],'served digest '+name);
}
for(const m of html.matchAll(/<script src="([^"?]+)/g))assert.ok(fs.existsSync(path.join(root,m[1])),'Local module '+m[1]);
for(const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
assert.ok(!fs.existsSync(path.join(root,'supabase')));assert.ok(!fs.existsSync(path.join(root,'service-worker.js')));
console.log('PASS static isolation, scripts, local references and served source hashes');
