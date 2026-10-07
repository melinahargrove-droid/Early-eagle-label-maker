// Synthetic captions only. Fixed bounds describe the accepted 300-DPI artwork,
// independent of the new fitting helper's requested boxes.
const boxes={business:{x:19,y:415.6,w:975,h:180},small:{x:489,y:54,w:357,h:492},
 '3x5-landscape':{x:805,y:82,w:613,h:736},'3x5-portrait':{x:82,y:979,w:736,h:439},
 '4x6-landscape':{x:963,y:108,w:729,h:984},'4x6-portrait':{x:108,y:1168,w:984,h:524},
 'half-page':{x:1279,y:136,w:985,h:1228},'full-page':{x:216,y:2025,w:1968,h:909},
 cp:{x:573,y:475,w:752,h:400}};
const samples=[
 {name:'confirmed-truncation',english:'A classroom collection of carefully sorted building materials for collaborative planning and creative construction FINALWORD',spanish:''},
 {name:'bilingual-long',english:'A classroom collection of carefully sorted building materials for collaborative planning and creative construction FINALWORD',spanish:'Una colección de materiales de construcción cuidadosamente organizados para la planificación colaborativa y la construcción creativa ÚLTIMA'},
 {name:'unbroken-tokens',english:'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.repeat(5)+'FINALWORD',spanish:'ÁÉÍÓÚñ'.repeat(20)+'ÚLTIMA'},
 {name:'arabic',english:'Classroom building and construction materials for collaborative learning FINALWORD',spanish:'مَجْمُوعَةٌ مِنْ مَوَادِّ الْبِنَاءِ الْمُرَتَّبَةِ لِلتَّعَلُّمِ وَالتَّعَاوُنِ وَالتَّخْطِيطِ وَالْإِبْدَاعِ النِّهَايَةُ'},
 {name:'cjk',english:'Classroom art and building materials FINALWORD',spanish:'教室裡精心分類的建築材料可用於合作規劃與創意建造'.repeat(4)+'最後文字'},
 {name:'combining-accents',english:'E\u0301lodie Noe\u0308lle and the collaborative classroom materials collection FINALWORD',spanish:('Cre\u0300me bru\u0302le\u0301e, re\u0301serve de mate\u0301riaux cre\u0301atifs ').repeat(4)+'FINALE'},
 {name:'long-unicode-graphemes',english:('A\u0301B\u0308👩‍👩‍👧‍👦').repeat(15)+'FINALWORD',spanish:'教材'.repeat(45)+'最後'}
];
const shorts=[{name:'short-bilingual',english:'Blocks',spanish:'Bloques'},{name:'short-english',english:'Paint',spanish:''},{name:'short-accents',english:'Crayons',spanish:'Lápices'}];
// Without a Unicode grapheme segmenter the safe contract is stronger: every
// whitespace-delimited token must stay on one line, even if it needs smaller type.
const fallbackSamples=[
 ['flags','🇺🇸🇨🇦🇯🇵'.repeat(12)],
 ['skin-tones','👍🏽👩🏿👨🏻'.repeat(12)],
 ['hangul','\u1112\u1161\u11ab\u1100\u1173\u11af'.repeat(12)],
 ['zwj','👩‍👩‍👧‍👦'.repeat(12)],
 ['accents','A\u0301E\u0308I\u0300'.repeat(24)]
].map(([name,token])=>({name:'no-segmenter-'+name,noSegmenter:true,english:'Classroom '+token+' FINALWORD',spanish:'Manual '+token+' FINAL'}));
const compact=value=>String(value||'').replace(/\s/gu,'');
module.exports={boxes,samples,shorts,fallbackSamples,compact};
