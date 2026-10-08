// Physical print baseline from accepted build 110, with bounded amendments:
// 2026-10-07 CI run 37674109611 reproduced missing trailing photo-caption words.
// The index renderer and sellable-label-render.js hashes below include its bounded
// complete-text fallback. All sizes, packing, margins, photo geometry and colors
// remain frozen. caption-fit-browser.cjs additionally requires exact short-caption
// PNG equality to the pre-fix renderer fixture and actual glyph/pixel bounds.
// Previous hashes: index print region 9645eab07b25ba3026c1a89d3a5cf98c5ebb7e650edd3115281e1f7edb2a02df;
// sellable renderer b6c1dcbf38f447276bc9749470ed1e4bfe8f85c2d3a7ee7ce6c557c190e167cd.
// 2026-10-07 re-audit reproduced one queued label yielding two mixed-cut sheets
// when initial render and a cut-line toggle completed out of order. The index
// region now includes latest-render cancellation, atomic publication and retry.
// reaudit-print-race.cjs exercises deferred success/error, close/reopen and account
// changes plus unchanged 1/14-copy and all-nine-format positions/raster inputs.
// Rasterization/geometry code and all external artwork renderer hashes remain unchanged.
// Previous index print region: 463a9a41e1ba7f0a4db4103395dfe2d9c72597052e4f4e327c74af017f0e4cd5.
// 2026-10-08 native handoff re-audit also reproduced an old held image decode
// printing zero/replacement labels and re-enabling a newer pending render. The
// ready-render identity now cancels image/frame waits and limits each explicit
// Print click and control restoration to that identity. reaudit-native-print.cjs
// covers held/rejected image waits, both frame boundaries, dismissal/account
// replacement and retry. The exact print CSS, dimensions and rasters are frozen.
// Previous print-blank-fix.js: ee0b7d69670e88f18126c8f8634e2eb888d08e2703195cf60963eac096ea4fca;
// previous index coordination region: 738d8c70c042f8cf5ae2525f2789f09332b50363b5b2ed6fb3c18b78d17cae0b.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const files={
  "tests/fixtures/caption-print-baseline.js": "765dc5ecf8c5e31a29f01d727e43d213d6b359b758efea4a842a48bdb64149de",
  "pdf-print.js": "71e2cf933d3f588ddc15372a5905e6667110b7d15036a4342e368da09eb4197b",
  "print-blank-fix.js": "4d847288db2ccf0250b31ac1a334cc2499cde7e2fa00fb999df615df118da3e2",
  "sellable-label-render.js": "8e60aee0e59fe68a29069256b29eaf3cd13a7a193a07c5ca8e1f3f7c4874fb9f",
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
    "hash": "6158fa68ebc1e5fb2331a83228f3a54511ebca6e3640d23569ffa2198ef1054e"
  },
  {
    "file": "sellable-label-wiring.js",
    "start": "(()=>{",
    "end": "  let chosen=",
    "hash": "7d58d54a5526711251bb9e00bfba37c144c420c49a6f5118bfe85a8b3fdd1fa1"
  }
];
for(const {file,start,end,hash:expected} of regions){const source=fs.readFileSync(path.join(root,file),'utf8');const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a,`Missing print boundary in ${file}`);assert.equal(hash(source.slice(a,b)),expected,`${file} print implementation changed`);}
// Settings now has an editable UI. Its original format registry and default
// combinations remain frozen independently, so UI copy/layout can evolve without
// relaxing the physically accepted dimensions or packing/PDF checks above.
const settingsSource=fs.readFileSync(path.join(root,'label-settings.js'),'utf8');
for(const {name,hash:expected} of [{"name": "meta", "hash": "cd9001db72eef7789c46d3a5a41a6cd1d513ef697b6abd5d41c69ffbc1dc391f"}, {"name": "defaults", "hash": "49a8a4575bf05f9e6c6f5e4d82e266126fb95790bd7dad9520202d0d4695b72d"}]){
  const match=settingsSource.match(new RegExp('const '+name+'=(\\{.*?\\});','s'));
  assert.ok(match,`Missing settings ${name} boundary`);
  assert.equal(hash(match[1]),expected,`Settings ${name} changed from the accepted print baseline`);
}
console.log('PASS accepted physical print baseline with caption and render-coordination amendments: 8 files, 3 inline/layout regions, exact format registry and default combinations');
