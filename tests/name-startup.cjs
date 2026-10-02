const {JSDOM,VirtualConsole}=require('jsdom'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
const dom=new JSDOM('<html><head></head><body></body></html>',{runScripts:'outside-only',virtualConsole:vc});
try{const w=dom.window;w.currentUser={id:'synthetic-fast-login'};w.eval(fs.readFileSync(path.join(__dirname,'../name-labels.js'),'utf8'));w.NLReset();w.document.dispatchEvent(new w.CustomEvent('little-label-account-changed'));assert.deepEqual(errors,[]);console.log('PASS fast auth/account change before name-label DOM installation')}finally{dom.window.close()}
