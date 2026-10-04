// Run in CI or an already-authorized Chromium environment. Do not weaken the
// browser sandbox to work around a local launch denial.
// This isolated harness loads shipped rendering and name-preview code only.
// It has no auth/activation/cloud client and uses synthetic names exclusively.
// It verifies the PDF generator, not the production button's competing handlers.
const { chromium, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html');
const start = html.indexOf('function escapePrintHtml('), end = html.indexOf('async function markCurrentSheetPrinted(', start);
assert.ok(start >= 0 && end > start, 'The exact shipped print functions are available');
const dependencies = new Set(['name-labels.js', 'name-labels-queue.js', 'label-settings.js', 'sellable-label-wiring.js', 'sellable-label-render.js', 'name-only-render.js', 'true-size-rotation-fix.js', 'pdf-print.js']);
const scripts = [...html.matchAll(/<script\s+src=["']\.\/([^"'?]+)(?:\?[^"']*)?["']/g)].map(match => match[1]).filter(file => dependencies.has(file));
assert.equal(scripts.length, dependencies.size);
assert.ok(scripts.indexOf('sellable-label-render.js') < scripts.indexOf('name-only-render.js'));
assert.ok(scripts.indexOf('name-only-render.js') < scripts.indexOf('true-size-rotation-fix.js'));
const markup = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${html.match(/<style>[\s\S]*?<\/style>/)?.[0] || ''}
<style>#sheetPreviewPages{max-width:680px;margin:auto}.home-create-grid{max-width:500px}.nl-app{box-sizing:border-box}.nl-app *{box-sizing:border-box}</style>
</head><body><div class="home-create-grid"></div><section id="printPreview"><label><input id="cutLinesToggle" type="checkbox">Cut lines</label><button id="printNowBtn">Open Print PDF</button><p class="tiny"></p><div id="printSheetSummary"></div><div id="sheetPreviewPages"></div></section><div id="printRoot"></div>
<script>var currentUser=null;var printLayoutPages=[];var printBatchIds=[];var queue=[];var sizesForBatchSet;var $=id=>document.getElementById(id);var show=()=>{};
${html.slice(start, end)}
</script>
${scripts.map(file => `${file === 'name-only-render.js' ? '<script>window.__priorRenderer=window.rasterizeFinishedLabel;</script>' : ''}<script src="/${file}"></script>`).join('\n')}
</body></html>`;
const names = ['Mia', 'Alexandria', 'Alexandria Chrysanthemum Montgomery', 'Jean Baptiste de la Fleur Étoile', 'Zoë Álvarez O’Neill', 'E\u0301lodie Noe\u0308lle', 'AlexandriaChrysanthemumMontgomeryWinterbottom', '  Ana   María  de la   Cruz  ', 'gjpqy', 'JÁ'];
const normalize = value => String(value || '').trim().replace(/\s+/g, ' ');
const near = (actual, expected, tolerance, label) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);

(async () => {
  const unexpected = [], errors = [];
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/__name-only-test.html') { res.setHeader('Content-Type', 'text/html'); res.end(markup); return; }
    const file = pathname.slice(1);
    if (!dependencies.has(file)) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', 'text/javascript'); res.end(read(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === origin) return route.continue();
      unexpected.push({ url: url.origin + url.pathname, method: route.request().method() }); return route.abort();
    });
    const page = await context.newPage(); page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.stack || error.message));
    page.on('dialog', async dialog => { errors.push('Unexpected dialog: ' + dialog.message()); await dialog.dismiss(); });
    await page.goto(origin + '/__name-only-test.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.LittleLabelNameOnly && window.LittleLabelSettings && document.getElementById('nlNames'));
    await page.evaluate(() => {
      const meta = LittleLabelSettings.meta;
      localStorage.setItem('littleLabelsSettingsV3', JSON.stringify({ sizes: Object.fromEntries(Object.keys(meta).map(id => [id, true])), language: 'none', sets: [] }));
      dispatchEvent(new CustomEvent('little-label-settings-changed'));
      window.__textCalls = [];
      const fillText = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function(text, ...args) {
        if (window.__captureText) window.__textCalls.push({ text: String(text), font: this.font, args });
        return fillText.call(this, text, ...args);
      };
      window.__scanRaster = async src => {
        const img = new Image(); img.src = src; await img.decode();
        const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let left = canvas.width, top = canvas.height, right = -1, bottom = -1, ink = 0, upperInk = 0;
        for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
          const p = (y * canvas.width + x) * 4;
          // Dark-blue name pixels exclude the pale border, art and fold guide.
          if (pixels[p + 3] > 200 && pixels[p] < 75 && pixels[p + 1] < 135 && pixels[p + 2] > 75) {
            left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); ink++;
            if (y < canvas.height / 2 - 2) upperInk++;
          }
        }
        return { width: canvas.width, height: canvas.height, left, right, top, bottom, ink, upperInk };
      };
    });
    const meta = await page.evaluate(() => LittleLabelSettings.meta);
    assert.equal(Object.keys(meta).length, 9);
    let checked = 0;
    for (const [id, m] of Object.entries(meta)) for (const name of names) {
      const result = await page.evaluate(async ({ name, m }) => {
        window.__textCalls = []; window.__captureText = true;
        const src = await rasterizeFinishedLabel({ english: name, spanish: '', photo: '', size: m.name });
        window.__captureText = false;
        return { bounds: await __scanRaster(src), text: __textCalls };
      }, { name, m });
      const b = result.bounds, faceTop = id === 'cp' ? b.height / 2 : 0, faceH = b.height - faceTop, padding = Math.min(b.width, faceH) * .025;
      assert.equal(b.width, Math.round(m.w * 300)); assert.equal(b.height, Math.round(m.h * 300));
      assert.ok(b.ink > 0, `${id}: name has visible ink`);
      assert.ok(result.text.length >= 1 && result.text.length <= 2);
      assert.equal(normalize(result.text.map(call => call.text).join(' ')), normalize(name), `${id}: complete name survives wrapping`);
      assert.ok(b.left >= padding && b.right < b.width - padding && b.top >= faceTop + padding && b.bottom < b.height - padding, `${id}/${name}: visible face contains all ink`);
      near((b.left + b.right + 1) / 2, b.width / 2, 2.5, `${id}/${name}: ink centered horizontally`);
      near((b.top + b.bottom + 1) / 2, faceTop + faceH / 2, 2.5, `${id}/${name}: ink centered vertically`);
      if (name === 'Mia') assert.ok(b.bottom - b.top >= Math.min(b.width, faceH) * .28, `${id}: short name fills the body`);
      if (id === 'cp') assert.equal(b.upperInk, 0, 'Fold-behind flap has no name ink');
      checked++;
    }
    console.log(`PASS browser pixels: ${checked} synthetic name/format cases centered, large, complete and unclipped`);

    const preserved = await page.evaluate(async () => {
      const photoCanvas = document.createElement('canvas'); photoCanvas.width = photoCanvas.height = 30;
      const photoContext = photoCanvas.getContext('2d'); photoContext.fillStyle = '#cf7733'; photoContext.fillRect(0, 0, 30, 30);
      const photo = photoCanvas.toDataURL('image/png'), results = [];
      for (const [id, m] of Object.entries(LittleLabelSettings.meta)) {
        for (const content of [{ photo, spanish: '' }, { photo: '', spanish: 'Texto sintético' }, { photo, spanish: 'Texto sintético' }]) {
          const item = { english: 'Synthetic classroom object', size: m.name, ...content };
          results.push({ id, equal: await rasterizeFinishedLabel(item) === await __priorRenderer(item) });
        }
      }
      return results;
    });
    assert.equal(preserved.length, 27); assert.ok(preserved.every(result => result.equal), 'Photo/bilingual PNGs byte-identical to previous renderer');
    console.log('PASS photo and bilingual raster preservation for all 9 formats');

    await page.locator('.home-action').click();
    await expect(page.locator('#nameLabelsOverlay')).toBeVisible();
    await page.locator('#nlNames').fill('Zoë Álvarez O’Neill');
    for (const [id, m] of Object.entries(meta)) {
      await page.locator(`#nameLabelsOverlay [data-type="${id}"]`).click();
      const expected = await page.evaluate(async ({ id, m }) => LittleLabelNameOnly.render({ english: 'Zoë Álvarez O’Neill' }, { w: m.w, h: m.h, type: id }), { id, m });
      await expect(page.locator('#nlPreview img')).toHaveAttribute('src', expected);
      const fits = await page.locator('#nlPreview img').evaluate(img => { const image = img.getBoundingClientRect(), box = img.parentElement.getBoundingClientRect(); return image.left >= box.left - 1 && image.right <= box.right + 1 && image.top >= box.top - 1 && image.bottom <= box.bottom + 1; });
      assert.ok(fits, `${id}: preview fits mobile container`);
    }
    // Deliberately finish an older render after a newer input; it must not win.
    await page.evaluate(() => {
      window.__realNameRender = LittleLabelNameOnly.render;
      LittleLabelNameOnly.render = function(item, dimensions) {
        const rendered = __realNameRender(item, dimensions);
        if (item.english === 'Delayed synthetic name') return new Promise(resolve => { window.__finishOldPreview = () => rendered.then(resolve); });
        return rendered;
      };
    });
    await page.locator('#nlNames').fill('Delayed synthetic name');
    await page.waitForFunction(() => typeof window.__finishOldPreview === 'function');
    await page.locator('#nlNames').fill('Mia');
    await page.locator('#nameLabelsOverlay [data-type="business"]').click();
    const finalPreview = await page.evaluate(() => __realNameRender({ english: 'Mia' }, { ...LittleLabelSettings.meta.business, type: 'business' }));
    await expect(page.locator('#nlPreview img')).toHaveAttribute('src', finalPreview);
    await page.evaluate(async () => { await __finishOldPreview(); await Promise.resolve(); LittleLabelNameOnly.render = __realNameRender; });
    await expect(page.locator('#nlPreview img')).toHaveAttribute('src', finalPreview);
    await page.locator('#nameLabelsOverlay [data-style="photo"]').click();
    await expect(page.locator('#nlPreview')).not.toHaveClass(/nl-name-only/);
    await page.locator('#nameLabelsOverlay [data-style="name"]').click();
    await expect(page.locator('#nlPreview img')).toHaveAttribute('src', finalPreview);
    await page.locator('#nlNames').fill('<img src=x onerror=alert(1)>');
    const escapedPreview = await page.evaluate(() => LittleLabelNameOnly.render({ english: '<img src=x onerror=alert(1)>' }, { ...LittleLabelSettings.meta.business, type: 'business' }));
    await expect(page.locator('#nlPreview img')).toHaveAttribute('src', escapedPreview);
    await expect(page.locator('#nlPreview img')).toHaveCount(1);
    console.log('PASS all 9 Name Only mobile previews use exact print renderer, safe text, and latest-input/mode handling');

    const artifacts = path.resolve(process.env.NAME_ONLY_ARTIFACTS || path.join(root, 'test-results'));
    fs.mkdirSync(artifacts, { recursive: true });
    await page.locator('#nlNames').fill('Alexandria Chrysanthemum Montgomery');
    await page.locator('#nameLabelsOverlay [data-type="business"]').click();
    await page.locator('#nlPreview').scrollIntoViewIfNeeded();
    await page.locator('#nlPreview img').evaluate(img => img.decode());
    await page.screenshot({ path: path.join(artifacts, 'name-only-business-mobile.png') });
    await page.locator('#nameLabelsOverlay [data-type="cp"]').click();
    const cpExpected = await page.evaluate(() => LittleLabelNameOnly.render({ english: 'Alexandria Chrysanthemum Montgomery' }, { ...LittleLabelSettings.meta.cp, type: 'cp' }));
    await expect(page.locator('#nlPreview img')).toHaveAttribute('src', cpExpected);
    await page.locator('#nlPreview').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(artifacts, 'name-only-fold-over-mobile.png') });
    await page.locator('#nlBack').click();
    const preview = await page.evaluate(async () => {
      const items = Object.entries(LittleLabelSettings.meta).map(([id, m]) => ({ id: 'synthetic-' + id, english: 'Zoë Álvarez O’Neill', spanish: '', photo: '', size: m.name }));
      printLayoutPages = buildPrintLayout(items); printBatchIds = items.map(item => item.id);
      await renderPrintSheets();
      return {
        packed: printLayoutPages.flat().map(item => ({ id: item.id, x: item.x, y: item.y, width: item._w, height: item._h, rotated: item._rotated })),
        preview: [...document.querySelectorAll('#sheetPreviewPages img')].map(img => img.src),
        print: [...document.querySelectorAll('#printRoot img')].map(img => img.src),
        exact: [...document.querySelectorAll('#printRoot .raster-print-label')].map(element => ({ width: element.style.width, height: element.style.height }))
      };
    });
    assert.equal(preview.preview.length, 9); assert.deepEqual(preview.preview, preview.print, 'Screen sheet and print DOM consume identical PNGs');
    for (let i = 0; i < preview.packed.length; i++) assert.deepEqual(preview.exact[i], { width: preview.packed[i].width + 'in', height: preview.packed[i].height + 'in' });
    assert.ok(preview.packed.some(item => item.rotated), 'Mixed formats cover rotation');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator('#sheetPreviewPages').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(artifacts, 'name-only-print-preview.png') });
    await page.evaluate(() => {
      window.__pdfDraws = []; window.__pdfBlob = null;
      const drawImage = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function(image, ...args) {
        if (this.canvas.width === 1700 && this.canvas.height === 2200) window.__pdfDraws.push({ source: image.src, args });
        return drawImage.call(this, image, ...args);
      };
      const createObjectURL = URL.createObjectURL.bind(URL);
      URL.createObjectURL = blob => { if (blob.type === 'application/pdf') window.__pdfBlob = blob; return createObjectURL(blob); };
      // Capture the synthetic PDF without opening a viewer or changing its generator.
      window.open = () => ({ document: { write() {} }, location: { href: '' } });
    });
    await page.locator('#printNowBtn').click();
    await page.waitForFunction(() => window.__pdfBlob && !document.getElementById('printNowBtn').disabled);
    const pdf = await page.evaluate(async () => ({ draws: __pdfDraws, text: new TextDecoder('latin1').decode(await __pdfBlob.arrayBuffer()) }));
    assert.deepEqual(pdf.draws.map(draw => draw.source), preview.preview, 'PDF consumes the same finished name rasters as screen/print');
    for (let i = 0; i < pdf.draws.length; i++) {
      const item = preview.packed[i];
      assert.deepEqual(pdf.draws[i].args, [item.x * 200, item.y * 200, item.width * 200, item.height * 200], 'PDF packed dimensions retained without extra rotation');
    }
    assert.ok(pdf.text.startsWith('%PDF-1.4')); assert.ok(pdf.text.includes('/MediaBox [0 0 612 792]'), 'Letter PDF at true size');
    assert.deepEqual(errors, [], 'No runtime errors or unsafe-name execution');
    assert.deepEqual(unexpected, [], 'No remote/auth/activation/AI/write requests');
    console.log('PASS all-format screen/print/PDF raster parity, true dimensions and single packed rotation');
    await context.close();
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
