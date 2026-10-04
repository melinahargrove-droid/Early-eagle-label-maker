// Frozen print baseline from the physically accepted build 110.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const files={
  "label-settings.js": "47d478744f467f4104211aae8e8490515021190eeafb906528e2d0f07ab09249",
  "pdf-print.js": "71e2cf933d3f588ddc15372a5905e6667110b7d15036a4342e368da09eb4197b",
  "print-blank-fix.js": "ee0b7d69670e88f18126c8f8634e2eb888d08e2703195cf60963eac096ea4fca",
  "sellable-label-render.js": "b6c1dcbf38f447276bc9749470ed1e4bfe8f85c2d3a7ee7ce6c557c190e167cd",
  "smart-print-layout.js": "db4da3ef20e9756c2ab26a63fe9d1e2511810314d9439de5d9012c2490c6891b",
  "true-size-rotation-fix.js": "e990784a9587f25b996c2182c4a229fadc405935ec19ed76cd442e80c36e130b",
  "tests/packing.cjs": "3857bfbac33d1fcf4a10f9e446492d53afe775888b74f1f4828736eb22a8b8a1",
  "tests/pdf-rotation.cjs": "2e6c90b43c5e7e5be3fb40268e0b39656e911d309012b5f277d0fb5377acc85b"
};
for(const [file,expected] of Object.entries(files))assert.equal(hash(fs.readFileSync(path.join(root,file))),expected,`${file} changed from the accepted print baseline`);
const regions=[
  {
    "file": "index.html",
    "start": "    @media print{",
    "end": "    textarea{",
    "hash": "96c7a7c618d1b77611144e79bed4f2e6d1af9a79a52e6ce37eb28dc1d642fb85"
  },
  {
    "file": "index.html",
    "start": "function escapePrintHtml(",
    "end": "async function markCurrentSheetPrinted(",
    "hash": "9645eab07b25ba3026c1a89d3a5cf98c5ebb7e650edd3115281e1f7edb2a02df"
  },
  {
    "file": "sellable-label-wiring.js",
    "start": "(()=>{",
    "end": "  let chosen=",
    "hash": "7d58d54a5526711251bb9e00bfba37c144c420c49a6f5118bfe85a8b3fdd1fa1"
  }
];
for(const {file,start,end,hash:expected} of regions){const source=fs.readFileSync(path.join(root,file),'utf8');const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a,`Missing print boundary in ${file}`);assert.equal(hash(source.slice(a,b)),expected,`${file} print implementation changed`);}
console.log('PASS accepted print baseline: 8 files and 3 inline/layout regions are byte-identical');
