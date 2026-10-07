// Isolated client-side regression coverage. Every remote request is mocked or
// aborted before it can leave Chromium; no real accounts, purchases, or data.
const { chromium, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const SESSION_KEY = 'eea_label_maker_supabase_session_v1';
const anonymous = id => ({ id, is_anonymous: true, identities: [] });
const permanent = id => ({ id, email: `${id}@example.invalid`, is_anonymous: false, identities: [{ provider: 'email' }] });
const session = user => ({ access_token: `synthetic-${user.id}-${user.is_anonymous ? 'anon' : 'permanent'}`, refresh_token: `synthetic-refresh-${user.id}`, expires_in: 3600, user });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

(async () => {
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    try {
      res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.png') ? 'image/png' : file.endsWith('.webmanifest') ? 'application/manifest+json' : 'text/html');
      res.end(fs.readFileSync(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
    async function fixture(options = {}) {
      const context = await browser.newContext({ serviceWorkers: 'block' });
      const page = await context.newPage();
      page.setDefaultTimeout(5000);
      const model = {
        session: session(options.user || anonymous('synthetic-anonymous')),
        statusCalls: [], activationCalls: [], adminStatusCalls: [], authCalls: [], cloudCalls: [], blocked: [], errors: [], purchased: !!options.purchased
      };
      await context.addInitScript(({ key, stored }) => {
        localStorage.setItem('littleLabelsWelcomeSeenV1', '1');
        if (stored) localStorage.setItem(key, JSON.stringify(stored));
      }, { key: SESSION_KEY, stored: options.user && !options.recovery ? model.session : null });
      page.on('pageerror', error => model.errors.push(error.stack || error.message));
      page.on('dialog', dialog => dialog.accept());
      await context.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin === origin) return route.continue();
        const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
        if (!url.hostname.endsWith('.supabase.co')) { model.blocked.push(request.url()); return route.abort(); }
        const record = { path: url.pathname + url.search, method: request.method(), token: request.headers().authorization, body: request.postDataJSON() };
        if (url.pathname === '/rest/v1/rpc/little_labels_access_status') {
          model.statusCalls.push(record);
          const result = options.status ? await options.status(record, model.statusCalls.length, model) : { active: model.purchased };
          return json(result.body || result, result.httpStatus || 200);
        }
        if (url.pathname === '/rest/v1/rpc/activate_little_labels') {
          model.activationCalls.push(record);
          const result = options.activate ? await options.activate(record, model.activationCalls.length, model) : { success: true };
          if (result.success) model.purchased = true;
          return json(result.body || result, result.httpStatus || 200);
        }
        if (url.pathname === '/rest/v1/rpc/little_labels_admin_status') {
          model.adminStatusCalls.push(record);
          return json({ is_admin: false });
        }
        if (url.pathname.startsWith('/auth/')) {
          model.authCalls.push(record);
          if (options.authDelay) await options.authDelay.promise;
          if (url.pathname.endsWith('/signup')) model.session = session(anonymous('synthetic-anonymous'));
          if (url.pathname.endsWith('/verify')) model.session = { ...model.session, user: { ...permanent(model.session.user.id), email: model.pendingEmail } };
          if (url.pathname.endsWith('/user') && record.body?.email) model.pendingEmail = record.body.email;
          if (url.pathname.endsWith('/user')) return json({ user: model.session.user });
          return json(model.session);
        }
        if (['/rest/v1/labels', '/rest/v1/print_queue'].includes(url.pathname)) {
          model.cloudCalls.push(record);
          return json([]);
        }
        // Includes all AI, storage, and other cloud paths. Unexpected requests
        // fail the scenario rather than contacting any live service.
        model.blocked.push(request.url());
        return route.abort();
      });
      const fragment = options.recovery ? `#type=recovery&access_token=${model.session.access_token}&refresh_token=${model.session.refresh_token}` : '';
      await page.goto(origin + '/' + fragment, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !!window.LittleLabelsAccess);
      return {
        page, model,
        async ready() { await page.waitForFunction(() => cloudReady && cloudLoaded); },
        async close() {
          assert.deepEqual(model.errors, [], 'no uncaught browser errors');
          assert.equal(model.blocked.filter(url => url.includes('.supabase.co/')).length, 0, 'no unexpected AI or other cloud requests');
          assert.ok(model.cloudCalls.every(call => call.method === 'GET'), 'account tests never write label data');
          assert.ok(model.adminStatusCalls.every(call => call.method === 'POST' && Object.keys(call.body || {}).length === 0), 'only the modeled read-only admin status RPC is allowed');
          await context.close();
        }
      };
    }
    async function gate(page, pane) {
      await expect(page.locator('#llAccessGate')).toBeVisible();
      await expect(page.locator('#' + pane)).toBeVisible();
      assert.equal(await page.evaluate(() => LittleLabelsAccess.isActive()), false);
      assert.equal(await page.evaluate(() => !!document.elementFromPoint(8, 8)?.closest('#llAccessGate')), true, 'gate is the topmost interaction layer');
    }
    async function account(page, entry) {
      await page.locator(entry).click();
      await expect(page.locator('#account')).toBeVisible();
      await expect(page.locator('#llAccessGate')).toBeHidden();
      await page.locator('#accountBack').click();
      await expect(page.locator('#home')).toBeVisible();
    }

    {
      const f = await fixture(); await f.ready();
      await gate(f.page, 'llaAccountPane');
      // Reproduce legacy rescue code that disables hidden overlays on a timer.
      await f.page.addScriptTag({ url: origin + '/interaction-rescue.js' });
      await f.page.locator('#llaAccount').click();
      await f.page.waitForTimeout(1600);
      await f.page.locator('#accountBack').click();
      await gate(f.page, 'llaAccountPane');
      for (let i = 0; i < 3; i++) {
        await account(f.page, '#llaAccount');
        await gate(f.page, 'llaAccountPane');
      }
      assert.equal(f.model.statusCalls.length, 0, 'anonymous sessions never request entitlement');
      await f.close(); console.log('PASS anonymous startup, delayed legacy-overlay recovery, and repeated real Account → Home returns remain gated');
    }
    {
      const f = await fixture({ user: permanent('synthetic-inactive') }); await f.ready();
      await gate(f.page, 'llaActivatePane');
      for (let i = 0; i < 3; i++) {
        await f.page.locator('#llaManageAccount').click();
        await f.page.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
        await expect(f.page.locator('#account')).toBeVisible();
        await expect(f.page.locator('#llAccessGate')).toBeHidden();
        await f.page.locator('#accountBack').click();
        await gate(f.page, 'llaActivatePane');
      }
      await f.close(); console.log('PASS permanent inactive account, repeated real returns, focus and visibility checks');
    }
    {
      const f = await fixture({ user: permanent('synthetic-purchased'), purchased: true }); await f.ready();
      await expect(f.page.locator('#llAccessGate')).toBeHidden();
      for (let i = 0; i < 3; i++) {
        await account(f.page, '#accountBtn');
        await expect(f.page.locator('#llAccessGate')).toBeHidden();
        assert.equal(await f.page.evaluate(() => LittleLabelsAccess.isActive()), true);
      }
      const checks = f.model.statusCalls.length;
      await f.page.locator('#queueBtn').click();
      await expect(f.page.locator('#queue')).toBeVisible();
      await expect(f.page.locator('#llAccessGate')).toBeHidden();
      await f.page.locator('#queueBack').click();
      await expect(f.page.locator('#home')).toBeVisible();
      await expect(f.page.locator('#llAccessGate')).toBeHidden();
      assert.equal(f.model.statusCalls.length, checks, 'protected navigation preserves verified access');
      await f.close(); console.log('PASS purchased account unlocks after repeated returns and remains usable within protected screens');
    }
    {
      const authDelay = deferred(), statusDelay = deferred();
      const f = await fixture({ user: permanent('synthetic-slow'), authDelay, status: () => statusDelay.promise });
      await gate(f.page, 'llaCheckingPane');
      await expect(f.page.locator('#llaCheckingTitle')).toHaveText('Opening Little Labels…');
      assert.equal(f.model.statusCalls.length, 0);
      authDelay.resolve(); await f.ready();
      // Base activation and owner capability each verify the same identity once.
      await expect.poll(() => f.model.statusCalls.length).toBe(2);
      await gate(f.page, 'llaCheckingPane');
      await f.page.locator('#llaManageAccount').click();
      await f.page.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
      await expect(f.page.locator('#llAccessGate')).toBeHidden();
      await f.page.locator('#accountBack').click();
      await gate(f.page, 'llaCheckingPane');
      assert.equal(f.model.statusCalls.length, 2, 'each capability deduplicates its same-identity check');
      statusDelay.resolve({ active: false });
      await gate(f.page, 'llaActivatePane');
      await f.close(); console.log('PASS slow startup and entitlement remain gated, without duplicate requests');
    }
    {
      const stale = deferred();
      const f = await fixture({ user: permanent('synthetic-stale-owner'), status: () => stale.promise }); await f.ready();
      await gate(f.page, 'llaCheckingPane');
      await f.page.locator('#llaManageAccount').click();
      await f.page.locator('#signOutBtn').click();
      await gate(f.page, 'llaAccountPane');
      stale.resolve({ active: true });
      await f.page.waitForLoadState('networkidle');
      await gate(f.page, 'llaAccountPane');
      assert.equal(await f.page.evaluate(() => currentUser.id), 'synthetic-anonymous');
      await f.close(); console.log('PASS late purchased response cannot unlock a different anonymous account after real sign-out');
    }
    {
      const stale = deferred();
      const f = await fixture({ user: permanent('synthetic-old'), status: record => record.token.includes('synthetic-old-') ? stale.promise : { active: false } }); await f.ready();
      await gate(f.page, 'llaCheckingPane');
      await f.page.evaluate(next => { saveCloudSession(next); currentUser = next.user; updateAccountUI(); }, session(permanent('synthetic-new')));
      await gate(f.page, 'llaActivatePane');
      stale.resolve({ active: true });
      await f.page.waitForLoadState('networkidle');
      await gate(f.page, 'llaActivatePane');
      await f.close(); console.log('PASS late purchased response cannot unlock a different permanent account');
    }
    {
      const f = await fixture({ user: permanent('synthetic-retry'), status: (_r, n) => n <= 2 ? { httpStatus: 503, body: { message: 'Synthetic unavailable' } } : { active: false } }); await f.ready();
      await gate(f.page, 'llaActivatePane');
      await expect(f.page.locator('#llaStatus')).toContainText('Could not verify access');
      await f.page.locator('#llaRetryAccess').click();
      await gate(f.page, 'llaActivatePane');
      await expect(f.page.locator('#llaStatus')).toHaveText('');
      assert.ok(f.model.statusCalls.length >= 2);
      await f.close(); console.log('PASS failed entitlement stays gated and explicit Check access again retries successfully');
    }
    {
      const checkDelay = deferred();
      const f = await fixture({ user: permanent('synthetic-recovery'), recovery: true, status: () => checkDelay.promise });
      await expect(f.page.locator('#passwordRecovery')).toBeVisible();
      await expect(f.page.locator('#llAccessGate')).toBeHidden();
      await f.page.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
      // Base activation and owner capability each verify the same identity once.
      await expect.poll(() => f.model.statusCalls.length).toBe(2);
      await expect(f.page.locator('#llAccessGate')).toBeHidden();
      await f.page.locator('#recoveryPassword').fill('synthetic-only-password');
      await f.page.locator('#recoveryPassword2').fill('synthetic-only-password');
      checkDelay.resolve({ active: false });
      await f.page.waitForLoadState('networkidle');
      await expect(f.page.locator('#llAccessGate')).toBeHidden();
      await f.page.locator('#saveRecoveryPasswordBtn').click();
      await expect(f.page.locator('#home')).toBeVisible();
      await gate(f.page, 'llaActivatePane');
      await f.close(); console.log('PASS password recovery remains usable during focus/check, then returns to gate after synthetic save');
    }
    {
      const activationDelay = deferred();
      const f = await fixture({ user: permanent('synthetic-activation'), activate: (_r, n) => n === 1 ? { success: false, error: 'That activation code was not found.' } : activationDelay.promise }); await f.ready();
      await gate(f.page, 'llaActivatePane');
      await f.page.locator('#llaCode').fill('SYNTHETIC-CODE');
      await f.page.locator('#llaActivate').click();
      await expect(f.page.locator('#llaStatus')).toContainText('That activation code was not found.');
      await expect(f.page.locator('#llaActivate')).toBeEnabled();
      await f.page.locator('#llaActivate').click();
      await expect.poll(() => f.model.activationCalls.length).toBe(2);
      await expect(f.page.locator('#llaActivate')).toBeDisabled();
      const checks = f.model.statusCalls.length, ownerChecks = f.model.adminStatusCalls.length;
      await f.page.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
      await f.page.locator('#llaCode').press('Enter');
      // Focus refreshes the independent owner capability, but must not restart
      // the base activation check or replace its pending result.
      await expect.poll(() => f.model.adminStatusCalls.length).toBe(ownerChecks + 1);
      assert.equal(f.model.statusCalls.length, checks + 1, 'only the owner capability refreshes while activation is pending');
      await expect(f.page.locator('#llaActivate')).toBeDisabled();
      assert.equal(f.model.activationCalls.length, 2, 'disabled activation cannot be resubmitted with Enter');
      activationDelay.resolve({ success: true });
      await expect(f.page.locator('#llAccessGate')).toBeHidden();
      assert.deepEqual(f.model.activationCalls[1].body, { code_input: 'SYNTHETIC-CODE' });
      await account(f.page, '#accountBtn');
      await expect(f.page.locator('#llAccessGate')).toBeHidden();
      assert.equal(await f.page.evaluate(() => LittleLabelsAccess.isActive()), true);
      await f.close(); console.log('PASS synthetic activation error/retry, duplicate/focus guards, success, and purchased return');
    }
    {
      const f = await fixture(); await f.ready();
      const oldId = await f.page.evaluate(() => currentUser.id);
      await f.page.locator('#llaAccount').click();
      await f.page.locator('#accountEmail').fill('synthetic-converted@example.invalid');
      await f.page.locator('#sendAccountCodeBtn').click();
      await f.page.locator('#accountCode').fill('000000');
      await f.page.locator('#verifyAccountCodeBtn').click();
      await f.page.locator('#newAccountPassword').fill('synthetic-only-password');
      await f.page.locator('#newAccountPassword2').fill('synthetic-only-password');
      await f.page.locator('#finishAccountBtn').click();
      await expect.poll(() => f.model.statusCalls.length).toBeGreaterThan(0);
      await expect(f.page.locator('#account')).toBeVisible();
      await expect(f.page.locator('#llAccessGate')).toBeHidden();
      await expect(f.page.locator('#home')).toBeVisible();
      await gate(f.page, 'llaActivatePane');
      assert.deepEqual(await f.page.evaluate(() => ({ id: currentUser.id, permanent: userIsPermanent(currentUser) })), { id: oldId, permanent: true });
      assert.ok(f.model.statusCalls.length > 0, 'same-ID conversion triggers entitlement despite unchanged owner');
      await f.close(); console.log('PASS real synthetic signup controls convert same user ID and recheck access');
    }
    console.log('PASS all activation browser scenarios; all auth, purchase, AI and cloud traffic isolated');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
