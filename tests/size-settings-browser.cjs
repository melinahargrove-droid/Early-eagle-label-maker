// Run in CI or another supported Chromium environment. Local runtime launch
// failures are real failures, never a reason to disable sandbox restrictions.
// Every non-local request is intercepted. Only synthetic auth and read-only
// entitlement/data responses are fulfilled; activation and writes are forbidden.
const { chromium, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const artifacts = path.resolve(process.env.SIZE_SETTINGS_ARTIFACTS || path.join(root, 'test-results'));
const KEY = 'littleLabelsSettingsV3';
const sizes = { business: true, small: false, '3x5-landscape': true, '3x5-portrait': false, '4x6-landscape': false, '4x6-portrait': false, 'half-page': false, 'full-page': false, cp: true };
const defaults = {
  sizes, language: 'es',
  sets: [{ id: 'matching', name: 'Two Matching Labels', items: [['business', 2]] }, { id: 'different', name: 'Business Card + Basket', items: [['business', 1], ['cp', 1]] }]
};
const user = { id: 'synthetic-settings-owner', email: 'synthetic-settings@example.invalid', is_anonymous: false, identities: [{ provider: 'email' }] };
const session = { access_token: 'synthetic-settings-token', refresh_token: 'synthetic-settings-refresh', expires_in: 3600, user };

(async () => {
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    try {
      const type = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.png') ? 'image/png' : file.endsWith('.webmanifest') ? 'application/manifest+json' : file.endsWith('.css') ? 'text/css' : 'text/html';
      res.setHeader('Content-Type', type); res.end(fs.readFileSync(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
    async function fixture({ seed = defaults, key = KEY } = {}) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
      const page = await context.newPage(); page.setDefaultTimeout(8000);
      const model = { errors: [], dialogs: [], unexpected: [], requests: [], statusReads: 0 };
      page.on('pageerror', error => model.errors.push(error.stack || error.message));
      page.on('dialog', async dialog => { model.dialogs.push({ type: dialog.type(), message: dialog.message() }); await dialog.dismiss(); });
      await context.addInitScript(({ session, key, seed }) => {
        localStorage.setItem('littleLabelsWelcomeSeenV1', '1');
        localStorage.setItem('eea_label_maker_supabase_session_v1', JSON.stringify(session));
        // Seed once, so reload genuinely tests the app's persisted result.
        if (!sessionStorage.getItem('synthetic-settings-seeded')) {
          localStorage.setItem(key, JSON.stringify(seed));
          sessionStorage.setItem('synthetic-settings-seeded', '1');
        }
      }, { session, key, seed });
      await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin === origin) return route.continue();
        if (!url.hostname.endsWith('.supabase.co')) return route.abort();
        const record = { path: url.pathname, method: request.method(), body: request.postDataJSON() };
        model.requests.push(record);
        const json = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
        if (url.pathname === '/auth/v1/token' && request.method() === 'POST') return json(session);
        if (url.pathname === '/auth/v1/user' && request.method() === 'GET') return json({ user });
        if (url.pathname === '/rest/v1/rpc/little_labels_access_status' && request.method() === 'POST') {
          assert.deepEqual(record.body || {}, {}, 'status check contains no submitted activation data');
          model.statusReads++; return json({ active: true });
        }
        if (url.pathname === '/rest/v1/rpc/little_labels_admin_status' && request.method() === 'POST') {
          assert.deepEqual(record.body || {}, {}); return json({ is_admin: false });
        }
        if (['/rest/v1/labels', '/rest/v1/print_queue'].includes(url.pathname) && request.method() === 'GET') return json([]);
        model.unexpected.push(record); return route.abort();
      });
      await page.goto(origin + '/', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.LittleLabelSettings && window.LittleLabelsAccess && cloudReady && cloudLoaded);
      await page.evaluate(() => LittleLabelsAccess.check());
      await expect(page.locator('#llAccessGate')).toBeHidden();
      return { page, model, context, async open() { await page.locator('#littleLabelsSettingsBtn').click(); await expect(page.locator('#llSettings')).toBeVisible(); } };
    }
    async function run(name, test, options) {
      if (process.env.SIZE_SETTINGS_FILTER && !new RegExp(process.env.SIZE_SETTINGS_FILTER).test(name)) return;
      const f = await fixture(options);
      try {
        await test(f);
        assert.deepEqual(f.model.errors, [], 'No uncaught browser errors');
        assert.deepEqual(f.model.dialogs, [], 'Inline settings never open native prompts, alerts or confirmation dialogs');
        assert.deepEqual(f.model.unexpected, [], 'No activation, AI or cloud-write requests are permitted');
        assert.ok(f.model.statusReads > 0, 'The actual access checker used synthetic read-only status');
        assert.ok(f.model.requests.every(request => request.path !== '/rest/v1/rpc/activate_little_labels'));
        console.log('PASS ' + name);
      } catch (error) {
        if (process.env.SIZE_SETTINGS_ARTIFACTS) {
          const directory = path.resolve(process.env.SIZE_SETTINGS_ARTIFACTS); fs.mkdirSync(directory, { recursive: true });
          await f.page.screenshot({ path: path.join(directory, name.replace(/[^a-z0-9]+/gi, '-').slice(0, 100) + '.png'), fullPage: true });
        }
        throw error;
      } finally { await f.context.close(); }
    }
    const saved = page => page.evaluate(() => LittleLabelSettings.get());
    const rows = page => page.locator('#llsSetRows .lls-editor-row');
    async function screenshot(page, filename) {
      fs.mkdirSync(artifacts, { recursive: true });
      await page.screenshot({ path: path.join(artifacts, filename) });
    }
    async function setRow(page, index, size, copies) {
      await rows(page).nth(index).locator('.lls-set-size').selectOption(size);
      await rows(page).nth(index).locator('.lls-set-quantity').fill(String(copies));
    }
    async function noOverflow(page) {
      const result = await page.evaluate(() => {
        const root = document.getElementById('llSettings'), box = root.getBoundingClientRect();
        const bad = [...root.querySelectorAll('button,select,input,.lls-card,.lls-row,.lls-editor-row')].filter(element => {
          const r = element.getBoundingClientRect();
          return r.width && r.height && (r.left < box.left - 1 || r.right > box.right + 1);
        }).map(element => element.id || element.className);
        return { overlay: root.scrollWidth <= root.clientWidth + 1, document: document.documentElement.scrollWidth <= innerWidth + 1, bad };
      });
      assert.deepEqual(result, { overlay: true, document: true, bad: [] }, '390px settings and controls fit without horizontal overflow');
    }

    await run('390px dimensions, proportional visuals, paper notes and keyboard switches', async ({ page, open }) => {
      await open(); await noOverflow(page);
      await expect(page.getByRole('heading', { name: /Available label sizes/i })).toBeVisible();
      await expect(page.locator('#llsSizes input[type=checkbox]')).toHaveCount(9);
      await expect(page.locator('#llSettings')).toContainText('Label measurements below are width × height');
      await expect(page.locator('#llSettings')).toContainText('8.5 × 11 inches');
      await expect(page.locator('#llSettings')).toContainText('proportions, not actual size');
      const shapes = await page.locator('.lls-size-shape').evaluateAll(elements => elements.map(shape => {
        const row = shape.closest('label'), id = row.querySelector('input').dataset.sizeId, meta = LittleLabelSettings.meta[id], r = shape.getBoundingClientRect();
        return { id, width: r.width, height: r.height, expected: meta.w / meta.h, hidden: shape.closest('.lls-size-visual').getAttribute('aria-hidden') };
      }));
      assert.equal(shapes.length, 9);
      for (const shape of shapes) {
        assert.ok(shape.width > 0 && shape.height > 0); assert.equal(shape.hidden, 'true');
        assert.ok(Math.abs(shape.width / shape.height - shape.expected) < 0.025, `${shape.id} illustration uses the accepted proportions`);
      }
      await page.getByRole('heading', { name: /Available label sizes/i }).evaluate(element => element.scrollIntoView({ block: 'start' }));
      await screenshot(page, 'size-settings-mobile.png');
      await page.locator('input[data-size-id="full-page"]').scrollIntoViewIfNeeded();
      await screenshot(page, 'size-settings-mobile-large-formats.png');
      const business = page.locator('input[data-size-id="business"]');
      await business.focus(); await page.keyboard.press('Space'); await expect(business).not.toBeChecked();
      assert.equal((await saved(page)).sizes.business, false);
      await page.keyboard.press('Space'); await expect(business).toBeChecked();
      assert.equal((await saved(page)).sizes.business, true);
    });

    await run('390px inline create, repeated clicks, copy totals and genuine reload persistence', async ({ page, open }) => {
      await open(); await page.locator('#llsAdd').click(); await expect(page.locator('#llsSetName')).toBeFocused();
      const name = 'Synthetic classroom shelf and basket combination with a deliberately long descriptive name';
      await page.locator('#llsSetName').fill(name); await setRow(page, 0, 'business', 2);
      await page.locator('#llsAddRow').click(); await setRow(page, 1, 'cp', 1);
      await page.locator('#llsSetEditor').evaluate(element => element.scrollIntoView({ block: 'start' }));
      await screenshot(page, 'size-settings-editor-mobile.png');
      await page.locator('#llsAddRow').click(); await setRow(page, 2, 'business', 3);
      await noOverflow(page);
      await page.locator('#llsSaveSet').evaluate(button => { button.click(); button.click(); });
      await expect(page.locator('#llsSetEditor')).toBeHidden();
      const created = (await saved(page)).sets; assert.equal(created.length, 3);
      assert.deepEqual(created[2].items, [['business', 5], ['cp', 1]]); assert.equal(created[2].name, name);
      await page.reload(); await page.waitForFunction(() => window.LittleLabelsAccess && cloudReady && cloudLoaded);
      await page.evaluate(() => LittleLabelsAccess.check()); await expect(page.locator('#llAccessGate')).toBeHidden();
      await open(); assert.deepEqual((await saved(page)).sets, created); await noOverflow(page);
      await expect(page.locator('#llsSets')).toContainText(name);
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.getByRole('heading', { name: /Available label sizes/i }).evaluate(element => element.scrollIntoView({ block: 'start' }));
      await screenshot(page, 'size-settings-desktop.png');
    });

    await run('390px edit, cancel, two-step Back and focus return do not save partial changes', async ({ page, open }) => {
      await open(); const before = await saved(page);
      const edit = page.locator('.lls-edit-set[data-set-index="0"]'); await edit.click();
      await page.locator('#llsSetName').fill('Synthetic unsaved edit'); await setRow(page, 0, 'cp', 9);
      await page.locator('#llsCancelSet').click(); await expect(edit).toBeFocused(); assert.deepEqual(await saved(page), before);
      await edit.click(); await expect(page.locator('#llsSetName')).toHaveValue('Two Matching Labels');
      await page.locator('#llsSetName').fill('Synthetic unsaved Back edit'); await page.locator('#llsBack').click();
      await expect(page.locator('#llSettings')).toBeVisible(); await expect(page.locator('#llsSetEditor')).toBeHidden(); await expect(edit).toBeFocused();
      await page.locator('#llsBack').click(); await expect(page.locator('#llSettings')).toBeHidden(); await expect(page.locator('#littleLabelsSettingsBtn')).toBeFocused();
      await open(); assert.deepEqual(await saved(page), before);
      await edit.click(); await page.locator('#llsSetName').fill('Synthetic edited matching set'); await setRow(page, 0, 'business', 4);
      await page.locator('#llsSaveSet').click();
      const after = await saved(page); assert.equal(after.sets.length, 2); assert.equal(after.sets[0].id, 'matching');
      assert.deepEqual(after.sets[0].items, [['business', 4]]); assert.equal(after.sets[0].name, 'Synthetic edited matching set');
    });

    await run('390px invalid fields announce inline errors and leave persisted settings unchanged', async ({ page, open }) => {
      await open(); const before = await saved(page); await page.locator('#llsAdd').click();
      await page.locator('#llsSetName').fill('   '); await page.locator('#llsSaveSet').click();
      await expect(page.locator('#llsSetError')).toContainText(/name/i); await expect(page.locator('#llsSetName')).toBeFocused();
      await page.locator('#llsSetName').fill('Synthetic validation');
      for (const copies of ['', '0', '-1', '1.5']) {
        await rows(page).first().locator('.lls-set-quantity').fill(copies); await page.locator('#llsSaveSet').click();
        await expect(page.locator('#llsSetError')).toContainText(/whole number|copies/i);
        await expect(rows(page).first().locator('.lls-set-quantity')).toBeFocused(); assert.deepEqual(await saved(page), before);
      }
      await rows(page).first().locator('.lls-set-quantity').fill('101'); await page.locator('#llsSaveSet').click();
      await expect(page.locator('#llsSetError')).toContainText(/100/); assert.deepEqual(await saved(page), before);
      await rows(page).first().locator('.lls-remove-row').click(); await expect(rows(page)).toHaveCount(0);
      await page.locator('#llsSaveSet').click(); await expect(page.locator('#llsSetError')).toContainText(/size/i);
      await expect(page.locator('#llsAddRow')).toBeFocused(); assert.deepEqual(await saved(page), before); await noOverflow(page);
      await page.locator('#llsCancelSet').click(); await expect(page.locator('#llsAdd')).toBeFocused();
    });

    await run('390px disabled combinations stay explained in settings, create, batch and reprint', async ({ page, open }) => {
      await open(); await page.locator('input[data-size-id="cp"]').uncheck();
      const basket = page.locator('#llsSets .lls-set').filter({ hasText: 'Business Card + Basket' });
      await expect(basket.locator('.lls-unavailable')).toContainText('Fold-Over Basket Label');
      await basket.locator('.lls-edit-set').click(); await expect(page.locator('#llsEditorAvailability')).toContainText('Fold-Over Basket Label');
      await page.locator('#llsCancelSet').click(); await page.locator('#llsBack').click();
      await page.locator('#homeTypeBtn').click(); await page.locator('#tlEnglish').fill('Synthetic size-choice label');
      await page.locator('#tlSecond').fill('Synthetic translated wording'); await page.locator('#tlNext').click();
      await expect(page.locator('#preview')).toBeVisible(); await page.locator('#chooseSetBtn').click();
      const unavailable = page.locator('#llDynamicSets .choice').filter({ hasText: 'Business Card + Basket' });
      await expect(unavailable).toBeVisible(); await expect(unavailable).toHaveAttribute('aria-disabled', 'true');
      await expect(unavailable.locator('.ll-combination-note')).toContainText(/off|turn on|unavailable/i);
      await unavailable.dispatchEvent('click'); await expect(unavailable).not.toHaveClass(/selected/);
      const batch = await page.locator('#batchSetSelect').evaluate(select => [...select.options].find(option => option.value === 'set:different')?.disabled);
      assert.equal(batch, true); await expect(page.locator('#llBatchAvailability')).toContainText(/off|turn on|unavailable/i);
      await page.evaluate(() => show('reprint'));
      const reprint = page.locator('#llReprintSets .choice').filter({ hasText: 'Business Card + Basket' });
      await expect(reprint).toBeVisible(); await expect(reprint).toHaveAttribute('aria-disabled', 'true');
      await expect(reprint.locator('.ll-combination-note')).toContainText(/off|turn on|unavailable/i);
      assert.deepEqual((await saved(page)).sets, defaults.sets);
      assert.deepEqual(await page.evaluate(() => ({ queued: queue.length, library: library.length })), { queued: 0, library: 0 });
    });

    await run('390px older saved preferences migrate while retaining custom IDs, counts and disabled formats', async ({ page, open }) => {
      await open(); const original = await saved(page);
      assert.equal(original.language, 'fr'); assert.equal(original.sizes.cp, false); assert.equal(original.sets[0].id, 'custom-legacy-123');
      await page.locator('#llsLanguage').selectOption('de');
      const migrated = await page.evaluate(() => JSON.parse(localStorage.getItem('littleLabelsSettingsV3')));
      assert.deepEqual(migrated, { ...original, language: 'de' });
      await page.locator('.lls-edit-set[data-set-index="0"]').click(); await page.locator('#llsSetName').fill('Unsaved migration edit');
      await page.locator('#llsCancelSet').click(); assert.deepEqual(await saved(page), migrated); await noOverflow(page);
    }, { key: 'littleLabelsSettingsV2', seed: { sizes: { ...sizes, cp: false }, language: 'fr', sets: [{ id: 'custom-legacy-123', name: 'Synthetic legacy basket set', items: [['business', 4], ['cp', 2]] }] } });

    await run('390px all sizes off preserves saved sets and an accessible inline editor', async ({ page, open }) => {
      await open();
      for (const id of Object.keys(sizes)) await page.locator(`input[data-size-id="${id}"]`).uncheck();
      assert.ok(Object.values((await saved(page)).sizes).every(value => !value));
      assert.deepEqual((await saved(page)).sets, defaults.sets);
      await page.locator('#llsAdd').click(); await page.locator('#llsSetName').fill('Synthetic dormant combination');
      await setRow(page, 0, 'business', 2); await expect(page.locator('#llsEditorAvailability')).toContainText('Business Card');
      await noOverflow(page); await page.locator('#llsSaveSet').click();
      assert.equal((await saved(page)).sets.length, 3); assert.equal((await saved(page)).sizes.business, false);
      await noOverflow(page);
    });

    await run('390px keyboard selection retains focus after create and reprint rerenders', async ({ page }) => {
      await page.locator('#homeTypeBtn').click(); await page.locator('#tlEnglish').fill('Synthetic keyboard choice label');
      await page.locator('#tlSecond').fill('Synthetic translated wording'); await page.locator('#tlNext').click();
      await page.locator('#chooseSetBtn').click();
      for (const [container, screen] of [['llDynamicSets', null], ['llReprintSets', 'reprint']]) {
        if (screen) await page.evaluate(screen => show(screen), screen);
        const combination = page.locator(`#${container} [data-combination-id="different"]`);
        await combination.focus(); await page.keyboard.press('Space');
        await expect(combination).toBeFocused(); await expect(combination).toHaveAttribute('aria-pressed', 'true');
        const single = page.locator(`#${container} [data-single-choice="true"]`);
        await single.focus(); await page.keyboard.press('Enter');
        await expect(single).toBeFocused(); await expect(single).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator(`#${container} [aria-pressed="true"]`)).toHaveCount(1);
        await combination.click(); await expect(combination).toBeFocused(); await expect(combination).toHaveAttribute('aria-pressed', 'true');
      }
      assert.deepEqual(await page.evaluate(() => ({ queued: queue.length, library: library.length })), { queued: 0, library: 0 });
    });
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
