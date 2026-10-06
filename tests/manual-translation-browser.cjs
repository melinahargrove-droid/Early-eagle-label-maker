// Real Chromium/WebKit interactions with local assets and synthetic services only.
// The print observer captures the existing native-print handler and decoded rasters.
// This is frontend evidence, not a deployed billing, database/RLS, or provider test.
const playwright = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const engine = process.env.BROWSER_ENGINE || 'chromium';
const out = path.resolve(root, 'test-results/manual-first', engine);
fs.mkdirSync(out, { recursive: true });

(async () => {
  assert.ok(['chromium', 'webkit'].includes(engine), 'Supported browser engine');
  const server = http.createServer((req, res) => {
    try {
      let file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
      if (file !== root && !file.startsWith(root + path.sep)) throw Error('Outside fixture root');
      if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      const mime = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
      res.setHeader('Content-Type', mime[path.extname(file)] || 'text/html');
      res.end(fs.readFileSync(file));
    } catch { res.statusCode = 404; res.end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await playwright[engine].launch({ headless: true,
      ...(engine === 'chromium' && process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
    for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
      const page = await browser.newPage({ viewport, serviceWorkers: 'block', acceptDownloads: true });
      page.setDefaultTimeout(20000);
      const errors = [], dialogs = [], externalAI = [], blockedExternal = [], requests = [];
      const db = new Map(['A', 'B'].map(account => [account, { labels: new Map(), print_queue: new Map() }]));
      page.on('pageerror', error => errors.push(error.message));
      page.on('dialog', dialog => { dialogs.push(dialog.message()); void dialog.dismiss(); });
      const screenshot = name => page.screenshot({ path: path.join(out, `${name}-${viewport.width}.png`), fullPage: true });
      const counts = () => page.evaluate(() => Object.fromEntries(['quote', 'execute', 'status'].map(method => [method, __creditCalls.filter(call => call.method === method).length])));
      async function noOverflow(selector) {
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'No document horizontal overflow');
        assert.equal(await page.locator(selector).evaluate(el => el.scrollWidth <= el.clientWidth + 1), true, `No horizontal overflow in ${selector}`);
      }
      try {
        await page.addInitScript(() => {
          localStorage.setItem('littleLabelsWelcomeSeenV1', '1');
          window.__creditCalls = [];
          window.__balances = { A: 10, B: 20 };
          window.__loseNext = false;
          window.__holdNext = false;
          const operations = new Map();
          const wallet = accountId => ({ accountId, available_credits: window.__balances[accountId] ?? 0, reserved_credits: 0 });
          window.LittleLabelsCreditTestTransport = { kind: 'synthetic-test',
            async balance(p) { return wallet(p.ownerAccountId); },
            async quote(p) {
              window.__creditCalls.push({ method: 'quote', body: p });
              return { ...wallet(p.ownerAccountId), action: 'translation', units: 1, credits: 1,
                english: p.labels[0], language: p.language, catalogVersion: 'approved-2026-10-06' };
            },
            async execute(p) {
              window.__creditCalls.push({ method: 'execute', body: p });
              const key = p.ownerAccountId + ':' + p.operationId;
              if (operations.has(key)) return operations.get(key);
              if (!(window.__balances[p.ownerAccountId] >= 1)) throw Error('Synthetic insufficient credits');
              if (p.action !== 'translation' || p.labels.length !== 1 || p.confirmedCredits !== 1 || p.explicitAction !== true) throw Error('Invalid synthetic execution contract');
              window.__balances[p.ownerAccountId]--;
              const result = { ...wallet(p.ownerAccountId), operationId: p.operationId, state: 'settled', action: 'translation', units: 1, credits: 1,
                result: { english: p.labels[0], language: p.language, translation: 'Bloques de construcción' } };
              operations.set(key, result);
              if (window.__holdNext) { window.__holdNext = false; await new Promise(resolve => { window.__releaseCredit = resolve; }); }
              if (window.__loseNext) { window.__loseNext = false; throw Error('Synthetic lost response'); }
              return result;
            },
            async status(p) {
              window.__creditCalls.push({ method: 'status', body: p });
              return operations.get(p.ownerAccountId + ':' + p.operationId);
            }
          };
          window.__nativePrintCalls = 0;
          window.__nativePrintRasters = [];
          window.print = () => {
            window.__nativePrintCalls++;
            window.__nativePrintRasters = [...document.querySelectorAll('#printRoot img')].map(image => ({ src: image.src, complete: image.complete, width: image.naturalWidth, height: image.naturalHeight }));
          };
        });
        await page.route('**/*', async route => {
          const request = route.request(), url = new URL(request.url());
          if (url.origin === origin) return route.continue();
          const send = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
          if (url.pathname.includes('/functions/v1/')) { externalAI.push(url.href); return route.abort(); }
          if (url.hostname === 'ctmqvbsjliinlddfolti.supabase.co') {
            const authorization = request.headers().authorization;
            let account = authorization === 'Bearer synthetic-B' ? 'B' : authorization === 'Bearer synthetic-A' ? 'A' : null;
            if (url.pathname.includes('/auth/')) {
              const body = request.postDataJSON();
              account = account || (body?.refresh_token === 'synthetic-refresh-B' ? 'B' : 'A');
              return send({ access_token: 'synthetic-' + account, refresh_token: 'synthetic-refresh-' + account, expires_in: 3600,
                user: { id: account, is_anonymous: false, email: `synthetic-${account.toLowerCase()}@example.invalid`, identities: [{}] } });
            }
            requests.push({ account, method: request.method(), path: url.pathname });
            if (!account) return send({ error: 'Synthetic sign-in required' }, 401);
            if (url.pathname.includes('/rpc/')) return send({ active: true, is_admin: false });
            const table = db.get(account)[url.pathname.split('/').pop()];
            if (table) {
              if (request.method() === 'POST') {
                const rows = request.postDataJSON();
                for (const row of rows) if (!table.has(row.id)) table.set(row.id, row);
                return send(rows);
              }
              return send([...table.values()]);
            }
            return send([]);
          }
          blockedExternal.push(url.href);
          return route.abort();
        });
        await page.goto(origin + '/');
        await page.waitForFunction(() => window.LittleLabelSettings && cloudReady);
        await page.evaluate(() => LittleLabelsAccess.check());

        // Real input/review edits, including a blank optional second line, never invoke AI.
        await page.locator('#homeTypeBtn').click();
        await page.locator('#tlEnglish').fill('Building Blocks');
        await page.waitForTimeout(1000);
        assert.deepEqual(await counts(), { quote: 0, execute: 0, status: 0 });
        await page.locator('#tlNext').click();
        await page.locator('#preview').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#spanishInput').inputValue(), '');
        await page.locator('#englishInput').fill('Building Blocks');
        await page.locator('#spanishInput').fill('Bloques escritos a mano');
        await page.waitForTimeout(1000);
        assert.equal(await page.locator('#labelSpanish').textContent(), 'Bloques escritos a mano');
        assert.deepEqual(await counts(), { quote: 0, execute: 0, status: 0 });
        await page.locator('#previewBack').click();
        assert.equal(await page.locator('#tlSecond').inputValue(), 'Bloques escritos a mano');

        // Hold the actual explicit action through a double-click and a manual edit.
        await page.evaluate(() => { window.__holdNext = true; window.__releaseCredit = null; });
        await page.locator('#tlTranslationTools .ll-ai-translate').dblclick({ delay: 10 });
        await page.waitForFunction(() => typeof window.__releaseCredit === 'function');
        assert.equal((await counts()).execute, 1);
        assert.equal(await page.locator('#tlNext').isEnabled(), true);
        await page.locator('#tlSecond').fill('My manual correction');
        await page.evaluate(() => window.__releaseCredit());
        await page.locator('#tlTranslationTools .ll-ai-use').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#tlSecond').inputValue(), 'My manual correction');
        await page.locator('#tlTranslationTools .ll-ai-use').click();
        assert.equal(await page.locator('#tlSecond').inputValue(), 'Bloques de construcción');
        assert.equal((await counts()).execute, 1);
        assert.match(await page.locator('#tlTranslationTools').textContent(), /9 available/);
        await noOverflow('#typeLabelOverlay');
        await screenshot('typed-translation');

        // A dropped response is recovered through status for the same operation.
        await page.locator('#tlEnglish').fill('Counting Blocks');
        await page.evaluate(() => { window.__loseNext = true; });
        await page.locator('#tlTranslationTools .ll-ai-translate').click();
        await page.waitForFunction(() => document.querySelector('#tlTranslationTools .ll-ai-translate').textContent.includes('Check AI Translation'));
        await page.locator('#tlTranslationTools .ll-ai-translate').click();
        await page.waitForFunction(() => document.querySelector('#tlTranslationTools .ll-ai-note').textContent.includes('Translation ready'));
        assert.deepEqual(await counts(), { quote: 2, execute: 2, status: 1 });
        assert.equal(await page.evaluate(() => __creditCalls.find(call => call.method === 'status').body.operationId === __creditCalls.filter(call => call.method === 'execute')[1].body.operationId), true);
        assert.equal(await page.evaluate(() => __balances.A), 8);

        // Real settings controls change language without invoking AI on existing drafts.
        await page.locator('#tlBack').click();
        await page.locator('#littleLabelsSettingsBtn').click();
        for (const language of ['fr', 'none', 'es']) await page.locator('#llsLanguage').selectOption(language);
        await page.locator('#llsBack').click();
        await page.waitForTimeout(1000);
        assert.deepEqual(await counts(), { quote: 2, execute: 2, status: 1 });

        // Zero credits does not restrict manual edits, review, persistence, or printing.
        await page.evaluate(() => { window.__balances.A = 0; });
        await page.locator('#homeTypeBtn').click();
        await page.waitForFunction(() => document.querySelector('#tlTranslationTools .ll-ai-note').textContent.includes('0 AI credits'));
        assert.equal(await page.locator('#tlTranslationTools .ll-ai-translate').isDisabled(), true);
        await page.locator('#tlEnglish').fill('Manually Named Blocks');
        await page.locator('#tlSecond').fill('Texto manual');
        await noOverflow('#typeLabelOverlay');
        await screenshot('zero-credit-manual');
        await page.locator('#tlNext').click();
        await page.locator('#preview').waitFor({ state: 'visible' });
        await page.locator('#englishInput').fill('Final manual wording');
        await page.locator('#spanishInput').fill('Texto revisado manual');
        await page.waitForTimeout(1000);
        assert.equal(await page.locator('#labelEnglish').textContent(), 'Final manual wording');
        assert.equal(await page.locator('#labelSpanish').textContent(), 'Texto revisado manual');
        assert.equal(await page.locator('#singleTranslationTools .ll-ai-translate').isDisabled(), true);
        await noOverflow('#preview');
        await screenshot('manual-review');
        await page.locator('#chooseSetBtn').click();
        await page.locator('#sets').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#addToQueue').isEnabled(), true);
        await page.locator('#addToQueue').click();
        await page.locator('#queue').waitFor({ state: 'visible' });
        await page.waitForFunction(() => library.length === 1 && queue.length === 2);
        assert.deepEqual(await page.evaluate(() => [library[0].english, library[0].spanish]), ['Final manual wording', 'Texto revisado manual']);
        assert.equal(db.get('A').labels.size, 1);
        assert.equal(db.get('A').print_queue.size, 2);
        assert.equal([...db.get('A').print_queue.values()].every(row => row.english === 'Final manual wording' && row.spanish === 'Texto revisado manual'), true);
        assert.deepEqual(await counts(), { quote: 2, execute: 2, status: 1 });
        await page.locator('#mockSheets').click();
        await page.locator('#printPreview').waitFor({ state: 'visible' });
        await page.waitForFunction(() => {
          const images = [...document.querySelectorAll('#sheetPreviewPages img')];
          return images.length > 0 && images.every(image => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0);
        });
        await noOverflow('#printPreview');
        await screenshot('manual-print-preview');
        const expectedPrintRasters = await page.locator('#sheetPreviewPages img').evaluateAll(images => images.map(image => image.src));
        await page.locator('#printNowBtn').click();
        await page.waitForFunction(() => window.__nativePrintCalls === 1 && !document.getElementById('printNowBtn').disabled);
        const printResult = await page.evaluate(() => ({ calls: __nativePrintCalls, rasters: __nativePrintRasters, ariaHidden: document.getElementById('printRoot').getAttribute('aria-hidden') }));
        assert.equal(printResult.calls, 1, 'The real button invokes native print exactly once');
        assert.equal(printResult.ariaHidden, null);
        assert.ok(printResult.rasters.length > 0);
        assert.ok(printResult.rasters.every(image => image.complete && image.width > 0 && image.height > 0), 'Native print receives decoded rasters');
        assert.deepEqual(printResult.rasters.map(image => image.src), expectedPrintRasters, 'Native print matches the manual label preview');
        fs.writeFileSync(path.join(out, `manual-print-${viewport.width}.json`), JSON.stringify(printResult, null, 2));
        assert.deepEqual(await counts(), { quote: 2, execute: 2, status: 1 });

        // A delayed A result cannot enter B's draft, balance, labels, or queue.
        await page.locator('#printPreviewBack').click();
        await page.locator('#queueBack').click();
        await page.evaluate(() => { window.__balances.A = 5; });
        await page.locator('#homeTypeBtn').click();
        await page.locator('#tlEnglish').fill('Private account A draft');
        await page.waitForFunction(() => !document.querySelector('#tlTranslationTools .ll-ai-translate').disabled);
        await page.evaluate(() => { window.__holdNext = true; window.__releaseCredit = null; });
        await page.locator('#tlTranslationTools .ll-ai-translate').click();
        await page.waitForFunction(() => typeof window.__releaseCredit === 'function');
        assert.equal((await counts()).execute, 3);
        await page.evaluate(async () => {
          saveCloudSession({ access_token: 'synthetic-B', refresh_token: 'synthetic-refresh-B', expires_in: 3600,
            user: { id: 'B', is_anonymous: false, email: 'synthetic-b@example.invalid', identities: [{}] } });
          cloudReady = true; updateAccountUI(); show('home'); window.__releaseCredit(); await loadCloudData();
        });
        await page.locator('#homeTypeBtn').click();
        await page.waitForFunction(() => document.querySelector('#tlTranslationTools .ll-ai-balance').textContent.includes('20 available'));
        assert.equal(await page.locator('#tlEnglish').inputValue(), '');
        assert.equal(await page.locator('#tlSecond').inputValue(), '');
        assert.doesNotMatch(await page.locator('#tlTranslationTools').textContent(), /Private account A draft|Bloques de construcción/);
        assert.deepEqual(await page.evaluate(() => [library.length, queue.length]), [0, 0]);
        assert.equal(await page.locator('#tlTranslationTools .ll-ai-use').isVisible(), false);
        await screenshot('account-isolation');

        // Returning to A recovers the original operation without regeneration.
        await page.evaluate(async () => {
          saveCloudSession({ access_token: 'synthetic-A', refresh_token: 'synthetic-refresh-A', expires_in: 3600,
            user: { id: 'A', is_anonymous: false, email: 'synthetic-a@example.invalid', identities: [{}] } });
          cloudReady = true; updateAccountUI(); show('home'); await loadCloudData();
        });
        await page.locator('#homeTypeBtn').click();
        await page.locator('#tlEnglish').fill('Private account A draft');
        await page.locator('#tlTranslationTools .ll-ai-translate').click();
        await page.locator('#tlTranslationTools .ll-ai-use').waitFor({ state: 'visible' });
        await page.locator('#tlTranslationTools .ll-ai-use').click();
        assert.equal(await page.locator('#tlSecond').inputValue(), 'Bloques de construcción');
        assert.deepEqual(await counts(), { quote: 3, execute: 3, status: 2 });
        assert.equal(await page.evaluate(() => __balances.A), 4);
        assert.deepEqual(await page.evaluate(() => [library.length, queue.length]), [1, 2]);
        await screenshot('account-recovered');
        // Photo/Gallery now starts a complete manual image-label flow, even with
        // no credit bridge. This fixture never contacts a provider or production DB.
        await page.locator('#tlBack').click();
        const beforePhotoCredits = await counts();
        await page.evaluate(() => { window.LittleLabelsCreditTestTransport = null; });
        const photo = { name: 'synthetic-blocks.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="320" height="240" fill="#fff8e9"/><rect x="40" y="90" width="85" height="85" rx="8" fill="#669abe"/><rect x="145" y="75" width="100" height="100" rx="8" fill="#c88660"/><text x="160" y="215" text-anchor="middle" font-size="18" fill="#17375e">SYNTHETIC PHOTO</text></svg>') };
        assert.equal(await page.locator('#homeCameraInput').getAttribute('capture'), 'environment');
        for (const source of ['homeGalleryInput', 'homeCameraInput', 'galleryInput', 'cameraInput']) {
          if (source.startsWith('home')) {
            await page.evaluate(() => show('home'));
            const chooser = page.waitForEvent('filechooser');
            await page.locator(source === 'homeGalleryInput' ? '#homeGalleryBtn' : '#homePhotoBtn').click();
            await (await chooser).setFiles(photo);
          } else {
            await page.locator('#previewBack').click();
            await page.locator('#confirmBack').click();
            await page.locator('#' + source).setInputFiles(photo);
          }
          await page.locator('#preview').waitFor({ state: 'visible' });
          assert.equal(await page.locator('#englishInput').inputValue(), '');
          assert.equal(await page.locator('#spanishInput').inputValue(), '');
          assert.equal(await page.locator('#identifyPhotoBtn').isDisabled(), true);
          assert.match(await page.locator('#photoAIStatus').textContent(), /paid AI access and credits/);
          await page.locator('#englishInput').fill('Photo blocks');
          await page.locator('#spanishInput').fill('Bloques de la foto');
          await page.locator('#previewBack').click();
          await page.locator('#editIdentification').click();
          assert.equal(await page.locator('#englishInput').inputValue(), 'Photo blocks');
          assert.equal(await page.locator('#spanishInput').inputValue(), 'Bloques de la foto');
          assert.equal(await page.locator('#labelPhoto').evaluate(image => image.complete && image.naturalWidth === 320), true);
          assert.deepEqual(await counts(), beforePhotoCredits);
          assert.deepEqual(externalAI, []);
        }
        await noOverflow('#preview');
        await screenshot('photo-manual-review');
        // A cancelled picker and an invalid replacement cannot erase teacher edits.
        await page.evaluate(() => handlePhoto(undefined));
        await page.locator('#previewBack').click();await page.locator('#confirmBack').click();
        await page.locator('#galleryInput').setInputFiles({ name: 'invalid.png', mimeType: 'image/png', buffer: Buffer.from('synthetic invalid image') });
        await page.waitForFunction(() => document.getElementById('identifyStatus').textContent.includes("Couldn't read"));
        await page.locator('#returnToPhotoLabel').click();
        assert.equal(await page.locator('#englishInput').inputValue(), 'Photo blocks');
        assert.equal(await page.locator('#spanishInput').inputValue(), 'Bloques de la foto');
        await page.locator('#chooseSetBtn').click();await page.locator('#addToQueue').click();
        await page.locator('#queue').waitFor({ state: 'visible' });
        await page.waitForFunction(() => library.length === 2 && queue.length === 4);
        const savedPhoto = [...db.get('A').labels.values()].find(row => row.english === 'Photo blocks');
        assert.ok(savedPhoto?.photo_data.startsWith('data:image/jpeg'));
        assert.equal(savedPhoto.spanish, 'Bloques de la foto');
        await page.locator('#mockSheets').click();
        await page.locator('#printPreview').waitFor({ state: 'visible' });
        await page.waitForFunction(() => [...document.querySelectorAll('#sheetPreviewPages img')].every(image => image.complete && image.naturalWidth > 0));
        await noOverflow('#printPreview');await screenshot('photo-manual-print');
        await page.locator('#printNowBtn').click();
        await page.waitForFunction(() => __nativePrintCalls === 2 && !document.getElementById('printNowBtn').disabled);
        assert.equal(await page.evaluate(() => __nativePrintRasters.every(image => image.complete && image.width > 0)), true);
        assert.deepEqual(await counts(), beforePhotoCredits);

        assert.deepEqual(externalAI, [], 'No unmetered AI endpoint was attempted');
        assert.deepEqual(errors, [], 'No page JavaScript error');
        assert.deepEqual(dialogs.filter(message => !message.startsWith('Your print-ready PDF was created.')), [], 'No unexpected alert or confirmation');
        fs.writeFileSync(path.join(out, `results-${viewport.width}.json`), JSON.stringify({ engine, viewport, result: 'passed', creditCalls: await page.evaluate(() => __creditCalls), externalAI, blockedExternal, errors, dialogs, requests }, null, 2));
        console.log(`PASS ${engine} ${viewport.width}px manual edits/save/decoded native print, manual photo save/print with disabled AI, no auto AI, double-click/manual-edit protection, lost response, zero credits and account isolation/recovery`);
      } catch (error) {
        await screenshot('failure').catch(() => {});
        fs.writeFileSync(path.join(out, `failure-${viewport.width}.json`), JSON.stringify({ engine, viewport, error: error.stack, errors, dialogs, externalAI, blockedExternal, requests }, null, 2));
        throw error;
      } finally { await page.context().close(); }
    }
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
