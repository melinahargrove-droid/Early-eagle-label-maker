const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 let rotations=0,draws=[];
 const ctx={fillRect(){},translate(){},rotate(){rotations++},drawImage(...a){draws.push(a.slice(1))},save(){},restore(){},setLineDash(){},strokeRect(){}};
 const c={TextEncoder,Uint8Array,Blob,atob,Math,document:{createElement:()=>({width:0,height:0,getContext:()=>ctx,toDataURL:()=> 'data:image/png;base64,AA=='})},Image:class{constructor(){this.naturalWidth=600;this.naturalHeight=1000}set src(s){this.onload()}}};c.window=c;c.rasterizeFinishedLabel=async()=> 'data:image/png;base64,AA==';vm.createContext(c);
 vm.runInContext(fs.readFileSync(path.join(root,'true-size-rotation-fix.js'),'utf8'),c);
 let pdf=fs.readFileSync(path.join(root,'pdf-print.js'),'utf8');pdf=pdf.replace(/ if\(document.readyState==='loading'\)[\s\S]*?\n\}\)\(\);$/, ' window.testRenderPage=renderPage;\n})();');vm.runInContext(pdf,c);
 await c.testRenderPage([{_rotated:true,x:.25,y:.25,_w:2,_h:3.375}],true);
 assert.equal(rotations,1);assert.deepEqual(draws.at(-1),[50,50,400,675]);
 rotations=0;await c.testRenderPage([{_rotated:false,x:.25,y:.25,_w:3.375,_h:2}],false);assert.equal(rotations,0);assert.deepEqual(draws.at(-1),[50,50,675,400]);console.log('PASS PDF applies exactly one rotation and preserves packed dimensions');
})().catch(e=>{console.error(e);process.exitCode=1});
