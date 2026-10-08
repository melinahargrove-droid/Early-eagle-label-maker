// Production account controls with a strict, entirely synthetic Auth model.
// No browser launch, hosted account, verification email, provider request, or
// label/queue write. This is DOM behavior coverage, not email-delivery evidence.
const { JSDOM, ResourceLoader, VirtualConsole } = require('jsdom');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const origin = 'https://labels.test';
const sessionKey = 'eea_label_maker_supabase_session_v1';
const email = 'synthetic-new@example.invalid';
const password = 'synthetic-only-password';
const response = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' }
});
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
async function until(predicate, description) {
  const deadline = Date.now() + 4000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out: ' + description);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

class LocalScripts extends ResourceLoader {
  fetch(url) {
    const parsed = new URL(url);
    if (parsed.origin !== origin || !parsed.pathname.endsWith('.js')) return null;
    const file = path.resolve(root, '.' + parsed.pathname);
    assert.ok(file.startsWith(root + path.sep));
    return Promise.resolve(fs.readFileSync(file));
  }
}

function makeModel() {
  const model = {
    users: new Map(), tokens: new Map(), refreshTokens: new Map(), active: new Set(),
    calls: [], unexpected: [], providerCalls: [], writes: [], errors: [],
    sequence: 0, sessionSequence: 0, pendingEmail: '', registeredId: null,
    activationHold: null
  };
  model.session = id => {
    assert.ok(model.users.has(id), 'Only a fabricated existing user can receive a session');
    const token = 'synthetic-access-' + (++model.sessionSequence);
    const refresh = 'synthetic-refresh-' + model.sessionSequence;
    model.tokens.set(token, id); model.refreshTokens.set(refresh, id);
    return { access_token: token, refresh_token: refresh, expires_in: 3600, user: model.users.get(id) };
  };
  model.fetch = async (url, options = {}) => {
    const parsed = new URL(url);
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : null;
    const headers = new Headers(options.headers);
    const id = model.tokens.get((headers.get('Authorization') || '').replace(/^Bearer /, ''));
    const call = { path: parsed.pathname, search: parsed.search, method, body, userId: id };
    model.calls.push(call);
    const unexpected = message => {
      model.unexpected.push({ ...call, message });
      throw new Error(message);
    };
    // Every call is handled here. There is deliberately no network fallback.
    if (parsed.hostname !== 'ctmqvbsjliinlddfolti.supabase.co') return unexpected('Unexpected destination');
    if (parsed.pathname.includes('/functions/')) {
      model.providerCalls.push(call); return unexpected('Provider calls forbidden');
    }
    if (['/rest/v1/labels', '/rest/v1/print_queue'].includes(parsed.pathname)) {
      if (method !== 'GET') { model.writes.push(call); return unexpected('Label/queue writes forbidden'); }
      assert.ok(id, 'Reads belong to a modeled session');
      return response([]);
    }
    if (parsed.pathname === '/auth/v1/signup' && method === 'POST') {
      assert.deepEqual(body, {});
      const nextId = 'synthetic-account-' + (++model.sequence);
      model.users.set(nextId, { id: nextId, is_anonymous: true, identities: [] });
      return response(model.session(nextId));
    }
    if (parsed.pathname === '/auth/v1/token' && method === 'POST') {
      const grant = parsed.searchParams.get('grant_type');
      if (grant === 'refresh_token') {
        assert.deepEqual(Object.keys(body), ['refresh_token']);
        const owner = model.refreshTokens.get(body.refresh_token);
        assert.ok(owner, 'Refresh token belongs to a modeled session');
        return response(model.session(owner));
      }
      if (grant === 'password') {
        assert.deepEqual(Object.keys(body).sort(), ['email', 'password']);
        assert.equal(body.email, email);
        if (body.password !== password) return response({ msg: 'Invalid login credentials' }, 400);
        assert.ok(model.registeredId, 'Sign-in follows successful synthetic conversion');
        return response(model.session(model.registeredId));
      }
      return unexpected('Unexpected token grant');
    }
    if (parsed.pathname === '/auth/v1/verify' && method === 'POST') {
      assert.deepEqual(Object.keys(body).sort(), ['email', 'token', 'type']);
      assert.equal(body.email, email); assert.equal(body.type, 'email_change');
      assert.equal(model.pendingEmail, email);
      if (body.token === '111111') return response({ msg: 'Invalid verification code' }, 400);
      if (body.token === '222222') return response({ msg: 'Verification code has expired', error_code: 'otp_expired' }, 403);
      assert.equal(body.token, '000000');
      const owner = model.pendingOwner;
      assert.ok(model.users.get(owner)?.is_anonymous, 'Verification converts the same anonymous user');
      model.users.set(owner, { id: owner, is_anonymous: false, email, identities: [{ provider: 'email' }] });
      model.registeredId = owner;
      return response(model.session(owner));
    }
    if (parsed.pathname === '/auth/v1/user') {
      assert.ok(id, 'User endpoint requires a modeled session');
      if (method === 'GET') return response({ user: model.users.get(id) });
      if (method === 'PUT' && Object.keys(body).length === 1 && body.email === email) {
        assert.equal(model.users.get(id).is_anonymous, true);
        model.pendingEmail = email; model.pendingOwner = id;
        return response({ user: model.users.get(id) });
      }
      if (method === 'PUT' && Object.keys(body).length === 1 && body.password === password) {
        assert.equal(id, model.registeredId); assert.equal(model.users.get(id).is_anonymous, false);
        return response({ user: model.users.get(id) });
      }
      return unexpected('Unexpected synthetic user update');
    }
    if (parsed.pathname === '/auth/v1/logout' && method === 'POST') {
      assert.ok(id); assert.deepEqual(body, {}); return response({});
    }
    if (parsed.pathname === '/rest/v1/rpc/little_labels_admin_status' && method === 'POST') {
      assert.ok(id); assert.deepEqual(body, {}); return response({ is_admin: false });
    }
    if (parsed.pathname === '/rest/v1/rpc/little_labels_access_status' && method === 'POST') {
      assert.equal(model.users.get(id)?.is_anonymous, false); assert.deepEqual(body, {});
      return response({ active: model.active.has(id) });
    }
    if (parsed.pathname === '/rest/v1/rpc/activate_little_labels' && method === 'POST') {
      assert.equal(model.users.get(id)?.is_anonymous, false);
      assert.deepEqual(Object.keys(body), ['code_input']);
      if (body.code_input === 'SYNTHETIC-NOT-FOUND') return response({ success: false, error: 'That activation code was not found.' });
      assert.equal(body.code_input, 'SYNTHETIC-NEW');
      if (model.activationHold) await model.activationHold.promise;
      model.active.add(id); return response({ success: true });
    }
    return unexpected('Unexpected endpoint or method');
  };
  return model;
}

async function fixture(model, stored = null) {
  const console = new VirtualConsole();
  console.on('jsdomError', error => model.errors.push(error.message));
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), {
    url: origin + '/', runScripts: 'dangerously', resources: new LocalScripts(),
    pretendToBeVisual: true, virtualConsole: console,
    beforeParse(window) {
      window.localStorage.setItem('littleLabelsWelcomeSeenV1', '1');
      if (stored) window.localStorage.setItem(sessionKey, stored);
      Object.assign(window, { Headers, Response, AbortController, TextEncoder });
      window.fetch = model.fetch;
      window.scrollTo = () => {}; window.alert = () => {}; window.confirm = () => true;
      window.Image = class {
        constructor() { this.naturalWidth = this.naturalHeight = 2; }
        set src(value) { queueMicrotask(() => this.onload?.()); }
      };
      window.HTMLCanvasElement.prototype.getContext = () => ({ fillRect() {}, drawImage() {} });
      window.HTMLCanvasElement.prototype.toDataURL = () => '';
    }
  });
  const window = dom.window;
  await new Promise(resolve => window.addEventListener('load', resolve, { once: true }));
  await until(() => window.eval('cloudReady && cloudLoaded && !cloudStartupPending'), 'account startup');
  const $ = id => window.document.getElementById(id);
  return {
    window, $, click: id => $(id).click(),
    input(id, value) { $(id).value = value; $(id).dispatchEvent(new window.Event('input', { bubbles: true })); },
    close() { window.close(); }
  };
}

(async () => {
  const model = makeModel();
  let f = await fixture(model);
  const fixtures = [f];
  const count = predicate => model.calls.filter(predicate).length;
  const activations = () => count(call => call.path.endsWith('/activate_little_labels'));
  const passwordWrites = () => count(call => call.path === '/auth/v1/user' && call.method === 'PUT' && Object.hasOwn(call.body, 'password'));
  try {
    const { window: w, $, click, input } = f;
    const initialId = w.eval('currentUser.id');
    assert.equal(w.eval('userIsPermanent(currentUser)'), false);
    assert.equal(w.LittleLabelsAccess.isActive(), false);
    click('llaAccount');
    input('accountEmail', 'invalid'); click('sendAccountCodeBtn');
    assert.match($('accountCreateStatus').textContent, /valid email/);
    assert.equal(count(call => call.path === '/auth/v1/user' && call.method === 'PUT'), 0);
    input('accountEmail', email); click('sendAccountCodeBtn');
    await until(() => !$('accountVerifyPane').classList.contains('hidden'), 'verification pane');
    for (const [code, message] of [['111111', /Invalid verification code/], ['222222', /expired/]]) {
      input('accountCode', code); click('verifyAccountCodeBtn');
      await until(() => message.test($('accountCreateStatus').textContent) && !$('verifyAccountCodeBtn').disabled, 'failed verification safe retry');
      assert.equal($('accountPasswordPane').classList.contains('hidden'), true);
      assert.equal(w.eval('userIsPermanent(currentUser)'), false);
      assert.equal(w.LittleLabelsAccess.isActive(), false);
      assert.equal(passwordWrites(), 0); assert.equal(activations(), 0);
    }
    input('accountCode', '000000'); click('verifyAccountCodeBtn');
    await until(() => !$('accountPasswordPane').classList.contains('hidden'), 'successful verification');
    assert.equal(w.eval('currentUser.id'), initialId); assert.equal($('accountCode').value, '');
    console.log('PASS signup uses same-ID conversion; wrong and expired verification codes retain a safe retry and never unlock access');

    input('newAccountPassword', 'short'); input('newAccountPassword2', 'short'); click('finishAccountBtn');
    assert.match($('accountCreateStatus').textContent, /at least 8/); assert.equal(passwordWrites(), 0);
    input('newAccountPassword', password); input('newAccountPassword2', 'different-synthetic'); click('finishAccountBtn');
    assert.match($('accountCreateStatus').textContent, /don't match/); assert.equal(passwordWrites(), 0);
    input('newAccountPassword2', password); click('finishAccountBtn');
    await until(() => !$('home').classList.contains('hidden') && !$('llAccessGate').classList.contains('lla-hidden'), 'completed signup returns to activation');
    assert.equal(w.eval('currentUser.id'), initialId); assert.equal(w.eval('userIsPermanent(currentUser)'), true);
    assert.equal(w.LittleLabelsAccess.isActive(), false); assert.equal(passwordWrites(), 1);
    assert.equal($('newAccountPassword').value, ''); assert.equal($('newAccountPassword2').value, '');
    console.log('PASS short/mismatched passwords make no mocked update; completed account setup remains gated until activation');

    click('llaActivate'); assert.match($('llaStatus').textContent, /Enter the activation code/); assert.equal(activations(), 0);
    input('llaCode', 'SYNTHETIC-NOT-FOUND'); click('llaActivate');
    await until(() => /not found/.test($('llaStatus').textContent) && !$('llaActivate').disabled, 'activation error safe retry');
    assert.equal(w.LittleLabelsAccess.isActive(), false); assert.equal(activations(), 1);
    model.activationHold = deferred(); input('llaCode', 'SYNTHETIC-NEW'); click('llaActivate');
    await until(() => activations() === 2, 'activation pending');
    assert.equal($('llaActivate').disabled, true); click('llaActivate');
    $('llaCode').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assert.equal(activations(), 2, 'Pending activation is not resubmitted by click/Enter');
    model.activationHold.resolve();
    await until(() => w.LittleLabelsAccess.isActive(), 'activation success');
    assert.equal($('llAccessGate').classList.contains('lla-hidden'), true);
    console.log('PASS ordinary-customer activation error/retry, pending duplicate guard, and successful unlock');

    click('accountBtn'); click('signOutBtn');
    await until(() => w.eval('cloudReady && cloudLoaded && !userIsPermanent(currentUser)'), 'sign-out creates a new synthetic anonymous session');
    assert.equal(w.LittleLabelsAccess.isActive(), false); assert.notEqual(w.eval('currentUser.id'), initialId);
    click('llaAccount'); input('signInEmail', email); input('signInPassword', 'incorrect-synthetic'); click('signInBtn');
    await until(() => /Invalid login credentials/.test($('signInStatus').textContent) && !$('signInBtn').disabled, 'sign-in error safe retry');
    assert.equal(w.LittleLabelsAccess.isActive(), false);
    input('signInPassword', password); click('signInBtn');
    await until(() => !$('home').classList.contains('hidden') && w.LittleLabelsAccess.isActive(), 'password sign-in returns activated user');
    assert.equal(w.eval('currentUser.id'), initialId); assert.equal($('llAccessGate').classList.contains('lla-hidden'), true);
    assert.equal(activations(), 2, 'Only original error/retry activation calls occurred');
    console.log('PASS actual Sign Out and password Sign In controls preserve prior activation after a failed sign-in retry');

    const stored = w.localStorage.getItem(sessionKey);
    // Reopen from the app's stored session in a fresh DOM. Keep the first DOM
    // alive until assertions finish, so JSDOM teardown cannot interrupt queued
    // production MutationObserver work and create artificial runtime errors.
    f = await fixture(model, stored); fixtures.push(f);
    await until(() => f.window.LittleLabelsAccess.isActive(), 'stored customer session reopens unlocked');
    assert.equal(f.window.eval('currentUser.id'), initialId);
    assert.equal(f.$('llAccessGate').classList.contains('lla-hidden'), true);
    assert.equal(activations(), 2, 'Reload never reactivates an already activated user');
    assert.deepEqual(model.providerCalls, []); assert.deepEqual(model.writes, []);
    assert.deepEqual(model.unexpected, []); assert.deepEqual(model.errors, []);
    assert.ok(model.calls.filter(call => call.path.endsWith('/little_labels_admin_status')).length > 0);
    console.log('PASS reload restores same activated nonowner; all I/O intercepted, zero provider calls, zero label/queue writes, no runtime errors');
  } finally {
    fixtures.forEach(item => item.close());
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
