// Synthetic, dependency-free renderer regression tests. No browser, account,
// network, or student data is used. The browser companion checks actual pixels.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const meta = vm.runInNewContext('(' + read('label-settings.js').match(/const meta=(\{.*?\});const langs=/s)[1] + ')');
const names = [
  'Mia', 'Alexandria', 'Alexandria Chrysanthemum Montgomery',
  'Jean Baptiste de la Fleur Étoile', 'Zoë Álvarez O’Neill',
  'E\u0301lodie Noe\u0308lle', 'AlexandriaChrysanthemumMontgomeryWinterbottom',
  '  Ana   María  de la   Cruz  ', 'gjpqy', 'JÁ'
];
const normalize = value => String(value || '').trim().replace(/\s+/g, ' ');
const near = (actual, expected, tolerance, message) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);

function fixture({ metrics = true, base = false, rotation = false } = {}) {
  const canvases = [], rasters = new Map(), delegated = [];
  function makeCanvas() {
    const canvas = { width: 0, height: 0, texts: [], draws: [], strokes: [], rotations: [] };
    let stack = [], currentPath = [];
    const ctx = {
      font: '10px Arial', textAlign: 'start', textBaseline: 'alphabetic', fillStyle: '#000',
      save() { stack.push({ font: this.font, textAlign: this.textAlign, textBaseline: this.textBaseline, fillStyle: this.fillStyle }); },
      restore() { Object.assign(this, stack.pop() || {}); },
      beginPath() { currentPath = []; }, closePath() {}, moveTo(...p) { currentPath.push(['M', ...p]); }, lineTo(...p) { currentPath.push(['L', ...p]); },
      arcTo() {}, roundRect() {}, rect() {}, ellipse() {}, arc() {}, fill() {}, fillRect() {}, clearRect() {}, clip() {}, strokeRect() {}, setLineDash() {},
      stroke() { canvas.strokes.push(currentPath.slice()); },
      createLinearGradient() { return { addColorStop() {} }; },
      translate() {}, scale() {}, rotate(value) { canvas.rotations.push(value); },
      drawImage(image, ...args) { canvas.draws.push({ source: image.src, args }); },
      measureText(value) {
        const text = String(value), size = Number(this.font.match(/([\d.]+)px/)?.[1] || 10);
        const width = [...text].reduce((sum, char) => sum + (/\p{Mark}/u.test(char) ? 0 : /\s/.test(char) ? .29 : /[MW]/.test(char) ? .82 : /[ilj]/.test(char) ? .28 : .58), 0) * size;
        if (!metrics) return { width };
        const offset = this.textAlign === 'center' ? width / 2 : this.textAlign === 'right' || this.textAlign === 'end' ? width : 0;
        return { width, actualBoundingBoxLeft: offset - size * .035, actualBoundingBoxRight: width - offset - size * .075,
          actualBoundingBoxAscent: size * (/[ÁÉëö\u0300-\u036f]/u.test(text) ? .86 : .72), actualBoundingBoxDescent: size * (/[gjpqy]/.test(text) ? .21 : .025) };
      },
      fillText(value, x, y, maxWidth) {
        const text = String(value), size = Number(this.font.match(/([\d.]+)px/)?.[1] || 10), measure = this.measureText(text);
        const width = measure.width;
        const left = measure.actualBoundingBoxLeft ?? (this.textAlign === 'center' ? width / 2 : 0);
        const right = measure.actualBoundingBoxRight ?? (this.textAlign === 'center' ? width / 2 : width);
        const ascent = measure.actualBoundingBoxAscent ?? size * .8, descent = measure.actualBoundingBoxDescent ?? size * .2;
        const baseline = this.textBaseline === 'middle' ? y + (ascent - descent) / 2 : this.textBaseline === 'top' ? y + ascent : y;
        canvas.texts.push({ text, x, y, size, maxWidth, font: this.font, baseline: this.textBaseline, left: x - left, right: x + right, top: baseline - ascent, bottom: baseline + descent });
      }
    };
    canvas.getContext = () => ctx;
    canvas.toDataURL = () => { const url = 'data:image/png;base64,' + Buffer.from('synthetic-canvas-' + canvases.indexOf(canvas)).toString('base64'); rasters.set(url, canvas); return url; };
    canvases.push(canvas); return canvas;
  }
  const c = { console, TextEncoder, Uint8Array, Blob, atob, Math, Intl,
    document: { readyState: 'loading', addEventListener() {}, createElement: tag => { assert.equal(tag, 'canvas'); return makeCanvas(); } },
    Image: class { set src(value) { this._src = value; const source = rasters.get(value); this.naturalWidth = source?.width || 64; this.naturalHeight = source?.height || 64; this.onload(); } get src() { return this._src; } },
    LittleLabelSettings: { meta, get: () => ({ sizes: Object.fromEntries(Object.keys(meta).map(id => [id, true])), sets: [] }) },
    labelDimensions: null, buildPrintLayout: null, sizesForBatchSet: null,
    rasterizeFinishedLabel: async item => { delegated.push(item); return 'data:image/png;base64,b3JpZ2luYWw='; }
  };
  c.window = c; vm.createContext(c);
  if (base) {
    const html = read('index.html'), start = html.indexOf('function escapePrintHtml('), end = html.indexOf('async function markCurrentSheetPrinted(', start);
    assert.ok(start >= 0 && end > start); vm.runInContext(html.slice(start, end), c);
  }
  vm.runInContext(read('sellable-label-wiring.js'), c);
  if (base) vm.runInContext(read('sellable-label-render.js'), c);
  vm.runInContext(read('name-only-render.js'), c);
  if (rotation) vm.runInContext(read('true-size-rotation-fix.js'), c);
  return { c, canvases, rasters, delegated };
}
function checkName(canvas, name, format, withMetrics = true) {
  const width = Math.round(format.w * 300), height = Math.round(format.h * 300), faceY = format.type === 'cp' ? height / 2 : 0, faceH = height - faceY;
  assert.equal(canvas.width, width); assert.equal(canvas.height, height);
  const text = canvas.texts.filter(line => line.text.trim());
  assert.ok(text.length >= 1 && text.length <= 2, 'One or two whole-name lines');
  assert.equal(normalize(text.map(line => line.text).join(' ')), normalize(name), 'No dropped words, accents, apostrophes or graphemes');
  assert.ok(text.every(line => !line.maxWidth), 'The name is fitted by font size, never horizontally squeezed by fillText maxWidth');
  const bounds = { left: Math.min(...text.map(t => t.left)), right: Math.max(...text.map(t => t.right)), top: Math.min(...text.map(t => t.top)), bottom: Math.max(...text.map(t => t.bottom)) };
  if (withMetrics) {
    const inset = Math.min(width, faceH) * .025;
    assert.ok(bounds.left >= inset && bounds.right <= width - inset, 'All glyphs fit inside horizontal padding');
    assert.ok(bounds.top >= faceY + inset && bounds.bottom <= height - inset, 'All glyphs fit inside the visible face');
    near((bounds.left + bounds.right) / 2, width / 2, 1.1, 'Combined ink is horizontally centered');
    near((bounds.top + bounds.bottom) / 2, faceY + faceH / 2, 1.1, 'Combined ink is vertically centered');
    for (const line of text) near((line.left + line.right) / 2, width / 2, 1.1, 'Each line is independently centered');
    if (name === 'Mia') assert.ok(bounds.bottom - bounds.top >= Math.min(width, faceH) * .28, 'Short names visibly use the label body');
  }
  assert.ok(text.every(line => Number.isFinite(line.x) && Number.isFinite(line.y) && line.size > 0), 'Finite positive layout, including fallback metrics');
  if (format.type === 'cp') {
    assert.ok(text.every(line => line.top >= height / 2), 'Fold-behind half has no name text');
    assert.ok(canvas.strokes.some(stroke => stroke.some(point => point[0] === 'M' && point[2] === height / 2) && stroke.some(point => point[0] === 'L' && point[2] === height / 2)), 'Fold guide stays at exactly 1.5 inches');
  }
}

(async () => {
  const html = read('index.html'), scriptNames = [...html.matchAll(/<script\s+src=["']\.\/([^"'?]+)(?:\?[^"']*)?["']/g)].map(match => match[1]);
  assert.ok(scriptNames.indexOf('name-only-render.js') > scriptNames.indexOf('sellable-label-render.js'), 'Name renderer loads after the existing generic rasterizer');
  assert.ok(scriptNames.indexOf('name-only-render.js') < scriptNames.indexOf('true-size-rotation-fix.js'), 'Rotation wraps the completed name raster exactly once');
  const f = fixture(); assert.equal(typeof f.c.LittleLabelNameOnly?.render, 'function');
  assert.equal(Object.keys(meta).length, 9, 'All accepted formats are in the regression matrix');
  let checked = 0;
  for (const [id, m] of Object.entries(meta)) for (const name of names) {
    const d = { w: m.w, h: m.h, type: id }, item = { english: name, spanish: '', photo: '', size: m.name };
    const input = JSON.stringify(item), src = await f.c.LittleLabelNameOnly.render(item, d);
    checkName(f.rasters.get(src), name, d); assert.equal(JSON.stringify(item), input, 'Rendering never mutates saved content'); checked++;
  }
  console.log(`PASS ${checked} synthetic name/format combinations fit and center by glyph bounds, including accents and long names`);
  const item = { english: 'Mia', spanish: '', photo: '', size: meta.business.name };
  const src = await f.c.rasterizeFinishedLabel(item); checkName(f.rasters.get(src), 'Mia', { ...meta.business, type: 'business' });
  for (const empty of [{}, { photo: '', spanish: '' }, { photo: ' \t', spanish: ' \n ' }]) {
    const legacy = { english: 'Mia', size: meta.business.name, ...empty };
    assert.equal(f.c.LittleLabelNameOnly.matches(legacy), true);
    const legacySrc = await f.c.rasterizeFinishedLabel(legacy);
    checkName(f.rasters.get(legacySrc), 'Mia', { ...meta.business, type: 'business' });
  }
  for (const ordinary of [
    { english: 'Synthetic photo', spanish: '', photo: 'data:image/png;base64,cGhvdG8=', size: meta.business.name },
    { english: 'Synthetic bilingual', spanish: 'Texto sintético', photo: '', size: meta.business.name }
  ]) {
    assert.equal(f.c.LittleLabelNameOnly.matches(ordinary), false);
    assert.equal(await f.c.rasterizeFinishedLabel(ordinary), 'data:image/png;base64,b3JpZ2luYWw=');
    assert.equal(f.delegated.at(-1), ordinary, 'Photo and bilingual labels retain their original renderer and input');
  }
  const fallback = fixture({ metrics: false });
  for (const [id, m] of Object.entries(meta)) {
    const d = { ...m, type: id }, src = await fallback.c.LittleLabelNameOnly.render({ english: names[2], spanish: '', photo: '' }, d);
    checkName(fallback.rasters.get(src), names[2], d, false);
  }
  console.log('PASS legacy/whitespace text-only routing, ordinary-label delegation and missing-TextMetrics fallback');
  const chain = fixture({ base: true, rotation: true });
  for (const [id, m] of Object.entries(meta)) {
    const item = { english: 'Zoë Álvarez O’Neill', spanish: '', photo: '', size: m.name, _rotated: id !== 'cp' };
    const src = await chain.c.rasterizeFinishedLabel(item), canvas = chain.rasters.get(src);
    assert.equal(canvas.width, Math.round((item._rotated ? m.h : m.w) * 300));
    assert.equal(canvas.height, Math.round((item._rotated ? m.w : m.h) * 300));
    if (item._rotated) {
      assert.equal(canvas.rotations.length, 1); near(canvas.rotations[0], Math.PI / 2, 1e-12, 'Exactly one 90 degree rotation');
      checkName(chain.rasters.get(canvas.draws[0].source), item.english, { ...m, type: id });
    } else checkName(canvas, item.english, { ...m, type: id });
  }
  console.log('PASS actual rasterizer chain preserves all 9 dimensions and single rotation');
})().catch(error => { console.error(error); process.exitCode = 1; });
