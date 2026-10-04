// Settings regression tests run entirely against synthetic, in-memory state.
// Local JavaScript is the only loadable resource; no auth, activation, or live writes.
const { JSDOM, ResourceLoader, VirtualConsole } = require('jsdom');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const KEY = 'littleLabelsSettingsV3';
const plain = value => JSON.parse(JSON.stringify(value));
const expectedMeta = {
  business: { name: 'Business Card', dims: '3.375 × 2 in', w: 3.375, h: 2, group: 'Everyday' },
  small: { name: 'Small Label', dims: '3 × 2 in', w: 3, h: 2, group: 'Everyday' },
  '3x5-landscape': { name: '3 × 5 Landscape', dims: '5 × 3 in', w: 5, h: 3, group: 'Everyday' },
  '3x5-portrait': { name: '3 × 5 Portrait', dims: '3 × 5 in', w: 3, h: 5, group: 'Everyday' },
  '4x6-landscape': { name: '4 × 6 Landscape', dims: '6 × 4 in', w: 6, h: 4, group: 'Everyday' },
  '4x6-portrait': { name: '4 × 6 Portrait', dims: '4 × 6 in', w: 4, h: 6, group: 'Everyday' },
  'half-page': { name: 'Half-Page Sign', dims: '8 × 5 in · printer-safe', w: 8, h: 5, group: 'Signs & Large Labels' },
  'full-page': { name: 'Full-Page Sign', dims: '8 × 10.5 in · printer-safe', w: 8, h: 10.5, group: 'Signs & Large Labels' },
  cp: { name: 'Fold-Over Basket Label', dims: '4.5 × 3 in · folds to 4.5 × 1.5 visible', w: 4.5, h: 3, group: 'Specialty' }
};
const expectedDefaults = {
  sizes: { business: true, small: false, '3x5-landscape': true, '3x5-portrait': false, '4x6-landscape': false, '4x6-portrait': false, 'half-page': false, 'full-page': false, cp: true },
  sets: [
    { id: 'matching', name: 'Two Matching Labels', items: [['business', 2]] },
    { id: 'different', name: 'Business Card + Basket', items: [['business', 1], ['cp', 1]] }
  ],
  language: 'es'
};

class LocalScripts extends ResourceLoader {
  fetch(url) {
    const u = new URL(url);
    if (u.origin !== 'https://labels.test' || !u.pathname.endsWith('.js')) return null;
    const file = path.resolve(root, '.' + u.pathname);
    assert.ok(file.startsWith(root + path.sep), 'only checkout scripts may be loaded');
    return Promise.resolve(fs.readFileSync(file));
  }
}

async function fixture({ stored = {}, fullApp = false } = {}) {
  const errors = [], dialogs = [], events = [], writes = [], calls = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(fullApp ? fs.readFileSync(path.join(root, 'index.html'), 'utf8') :
    '<!doctype html><html><head></head><body><section id="home"><div class="home-account"></div></section></body></html>', {
    url: 'https://labels.test/', runScripts: fullApp ? 'dangerously' : 'outside-only',
    pretendToBeVisual: true, virtualConsole,
    ...(fullApp ? { resources: new LocalScripts() } : {}),
    beforeParse(w) {
      w.fetch = async (url, options) => { calls.push({ url: String(url), method: options?.method || 'GET' }); throw Error('Synthetic offline'); };
      w.XMLHttpRequest = class { constructor() { throw Error('No remote XMLHttpRequest allowed in settings tests'); } };
      w.WebSocket = class { constructor() { throw Error('No remote WebSocket allowed in settings tests'); } };
      w.scrollTo = () => {};
      w.alert = message => dialogs.push(['alert', String(message)]);
      w.prompt = message => { dialogs.push(['prompt', String(message)]); return null; };
      w.confirm = message => { dialogs.push(['confirm', String(message)]); return false; };
      w.TextEncoder = TextEncoder;
      w.Image = class { constructor() { this.naturalWidth = 1; this.naturalHeight = 1; } set src(value) { queueMicrotask(() => this.onload?.()); } };
      w.HTMLCanvasElement.prototype.getContext = () => ({ fillRect() {}, drawImage() {} });
      w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,c3ludGhldGlj';
      w.localStorage.setItem('littleLabelsWelcomeSeenV1', '1');
      for (const [key, value] of Object.entries(stored)) w.localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
      const originalSet = w.Storage.prototype.setItem;
      w.Storage.prototype.setItem = function (key, value) { if (key === KEY) writes.push(String(value)); return originalSet.call(this, key, value); };
      w.addEventListener('little-label-settings-changed', event => events.push(plain(event.detail)));
    }
  });
  const w = dom.window;
  if (fullApp) {
    await new Promise(resolve => w.addEventListener('load', resolve, { once: true }));
    // Real access check with a synthetic permanent account. Focus assertions must
    // exercise the signed-in UI, rather than programmatically reaching behind a gate.
    const offlineFetch=w.fetch;
    w.fetch=async()=>({ok:true,json:async()=>({active:true})});
    w.eval("saveCloudSession({access_token:'synthetic-settings-token',user:{id:'synthetic-settings',is_anonymous:false,email:'synthetic@example.invalid',identities:[{}]}});updateAccountUI();");
    await w.LittleLabelsAccess.check();
    w.fetch=offlineFetch;
  }
  else {
    w.eval(fs.readFileSync(path.join(root, 'label-settings.js'), 'utf8'));
    if (w.document.readyState === 'loading') await new Promise(resolve => w.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  }
  const $ = id => { const element = w.document.getElementById(id); assert.ok(element, `Missing #${id}`); return element; };
  const click = id => $(id).click();
  const change = (element, value, type = 'input') => {
    element.value = String(value);
    element.dispatchEvent(new w.Event(type, { bubbles: true }));
  };
  const rows = () => [...$('llsSetRows').querySelectorAll('.lls-editor-row')];
  const row = (index, size, quantity) => {
    const element = rows()[index]; assert.ok(element, `Missing set row ${index}`);
    change(element.querySelector('.lls-set-size'), size, 'change');
    change(element.querySelector('.lls-set-quantity'), quantity);
  };
  const get = () => plain(w.LittleLabelSettings.get());
  const open = () => w.LittleLabelSettings.open();
  const edit = index => { const button = w.document.querySelector(`.lls-edit-set[data-set-index="${index}"]`); assert.ok(button, `Missing editor for set ${index}`); button.click(); };
  const toggle = (id, checked) => {
    const input = $('llsSizes').querySelector(`input[data-size-id="${id}"]`);
    assert.ok(input, `Missing availability switch ${id}`); input.checked = checked;
    input.dispatchEvent(new w.Event('change', { bubbles: true }));
  };
  return { w, $, click, change, rows, row, get, open, edit, toggle, errors, dialogs, events, writes, calls,
    tick: () => new Promise(resolve => setTimeout(resolve, 10)),
    stored: () => w.localStorage.getItem(KEY),
    editorOpen: () => !!w.document.getElementById('llsSetEditor') && w.getComputedStyle(w.document.getElementById('llsSetEditor')).display !== 'none',
    settingsOpen: () => !$('llSettings').classList.contains('lls-hidden') };
}

async function run(name, test, options) {
  if (process.env.SIZE_SETTINGS_FILTER && !new RegExp(process.env.SIZE_SETTINGS_FILTER).test(name)) return;
  const f = await fixture(options);
  try {
    await test(f); await f.tick();
    assert.deepEqual(f.errors, [], 'No uncaught DOM errors');
    assert.deepEqual(f.dialogs, [], 'Settings use inline feedback, never native dialogs');
    console.log('PASS ' + name);
  } finally { f.w.close(); }
}

(async () => {
  await run('accepted format metadata, physical dimensions, default IDs and public API remain unchanged', ({ w, get, open, writes }) => {
    assert.deepEqual(plain(w.LittleLabelSettings.meta), expectedMeta);
    assert.deepEqual(get(), expectedDefaults);
    assert.deepEqual(Object.keys(w.LittleLabelSettings.languages), ['none', 'es', 'fr', 'ar', 'zh', 'vi', 'de', 'it', 'pt', 'ko', 'ja', 'ht']);
    assert.equal(typeof w.LittleLabelSettings.open, 'function');
    open(); assert.equal(writes.length, 0, 'Viewing Settings must not rewrite preferences');
  });

  const saved = {
    sizes: { ...expectedDefaults.sizes, business: false, small: true, cp: false, 'legacy-size': true },
    language: 'fr',
    sets: [
      { id: 'custom-1670000000000', name: 'My saved cards & baskets', items: [['small', 3], ['cp', 2]] },
      { id: 'legacy-set', name: 'Older combination', items: [['legacy-size', 4]] }
    ]
  };
  for (const key of ['littleLabelsSettingsV1', 'littleLabelsSettingsV2', KEY]) {
    await run(`${key} preferences and old custom sets survive read, open, language edit and reopen`, ({ w, $, get, open, change, writes, click }) => {
      assert.deepEqual(get(), saved); open(); assert.deepEqual(get(), saved); assert.equal(writes.length, 0);
      change($('llsLanguage'), 'de', 'change');
      assert.deepEqual(get(), { ...saved, language: 'de' });
      assert.deepEqual(JSON.parse(w.localStorage.getItem(KEY)), { ...saved, language: 'de' });
      if (key !== KEY) assert.deepEqual(JSON.parse(w.localStorage.getItem(key)), saved, 'Migration never destroys the source preference record');
      click('llsBack'); open(); assert.deepEqual(get(), { ...saved, language: 'de' });
    }, { stored: { [key]: saved } });
  }

  await run('V3 wins over V2 and V1; V2 wins over V1 when V3 is absent', ({ get }) => {
    assert.equal(get().language, 'ja');
  }, { stored: { [KEY]: { language: 'ja' }, littleLabelsSettingsV2: { language: 'fr' }, littleLabelsSettingsV1: { language: 'de' } } });
  await run('V2 fallback takes precedence over V1', ({ get }) => {
    assert.equal(get().language, 'fr');
  }, { stored: { littleLabelsSettingsV2: { language: 'fr' }, littleLabelsSettingsV1: { language: 'de' } } });
  await run('explicitly empty saved sets stay empty', ({ get, open, $, change }) => {
    assert.deepEqual(get().sets, []); open(); assert.equal($('llsSets').querySelectorAll('.lls-set').length, 0);
    change($('llsLanguage'), 'none', 'change'); assert.deepEqual(get().sets, []);
  }, { stored: { [KEY]: { sizes: { business: false }, sets: [], language: 'none' } } });
  await run('malformed stored JSON safely falls back to accepted defaults without a write', ({ get, open, writes }) => {
    assert.deepEqual(get(), expectedDefaults); open(); assert.equal(writes.length, 0);
  }, { stored: { [KEY]: '{synthetic-invalid-json' } });

  await run('available sizes have explicit dimensions, paper/fold explanations and accessible switches', ({ w, $, open, toggle, get, events }) => {
    open(); const text = $('llSettings').textContent;
    assert.match(text, /Available label sizes/i);
    assert.match(text, /width/i); assert.match(text, /height/i);
    assert.match(text, /8[.½]|8½/); assert.match(text, /11/);
    assert.match(text, /not.*(?:actual|true).*size|not to scale|illustrat/i);
    assert.match(text, /fold.*4\.5.*1\.5/i);
    for (const [id, meta] of Object.entries(expectedMeta)) {
      const input = $('llsSizes').querySelector(`input[data-size-id="${id}"]`);
      assert.ok(input); assert.equal(input.type, 'checkbox');
      const label = input.closest('label'); assert.ok(label, `${id} switch has a native label`);
      assert.ok(label.textContent.includes(meta.name));
      assert.ok(label.textContent.includes(String(meta.w))); assert.ok(label.textContent.includes(String(meta.h)));
    }
    toggle('small', true); assert.equal(get().sizes.small, true); assert.equal(events.length, 1);
    assert.equal(w.document.querySelectorAll('#llSettings').length, 1);
  });

  await run('inline creation, row copy counts, duplicate-row merging and repeated Save are idempotent', ({ w, $, open, click, change, row, get, events, editorOpen }) => {
    open(); const add = $('llsAdd'); add.click(); add.click();
    assert.equal(w.document.querySelectorAll('#llsSetEditor').length, 1);
    assert.ok(editorOpen()); change($('llsSetName'), '  Synthetic Center Set  ');
    row(0, 'business', 2); click('llsAddRow'); row(1, 'cp', 1); click('llsAddRow'); row(2, 'business', 3);
    const save = $('llsSaveSet'); save.click(); save.click();
    const sets = get().sets; assert.equal(sets.length, 3);
    assert.equal(sets[2].name, 'Synthetic Center Set'); assert.ok(sets[2].id);
    assert.deepEqual(sets[2].items, [['business', 5], ['cp', 1]]);
    assert.equal(events.length, 1, 'Repeated Save produces one committed change');
    assert.ok(!editorOpen()); assert.match($('llsSettingsStatus').textContent, /saved|created/i);
    assert.equal($('llsSettingsStatus').getAttribute('role'), 'status');
  });

  await run('multiple newly created sets keep distinct identities', ({ $, open, click, change, row, get }) => {
    open();
    for (const name of ['Synthetic first', 'Synthetic second']) { click('llsAdd'); change($('llsSetName'), name); row(0, 'business', 1); click('llsSaveSet'); }
    const ids = get().sets.map(set => set.id); assert.equal(new Set(ids).size, ids.length);
  });

  for (const [label, invalid] of [['blank', ''], ['whitespace-only', '   ']]) {
    await run(`${label} set names cannot save`, ({ $, open, click, change, get, events, editorOpen }) => {
      open(); click('llsAdd'); change($('llsSetName'), invalid); click('llsSaveSet');
      assert.deepEqual(get(), expectedDefaults); assert.equal(events.length, 0); assert.ok(editorOpen());
      assert.equal($('llsSetError').getAttribute('role'), 'alert'); assert.match($('llsSetError').textContent, /name/i);
    });
  }
  for (const quantity of ['', '0', '-1', '1.5', 'abc', 'Infinity', '9007199254740992']) {
    await run(`invalid copy count ${JSON.stringify(quantity)} cannot save or alter persisted sets`, ({ $, open, click, change, row, get, events, editorOpen }) => {
      open(); click('llsAdd'); change($('llsSetName'), 'Synthetic invalid copies'); row(0, 'business', quantity); click('llsSaveSet');
      assert.deepEqual(get(), expectedDefaults); assert.equal(events.length, 0); assert.ok(editorOpen());
      assert.match($('llsSetError').textContent, /cop|whole|number|quantity/i);
    });
  }
  await run('a combination can save exactly 100 total copies with an explicit limit explanation', ({ $, open, click, change, row, get }) => {
    open(); click('llsAdd'); assert.match($('llsSetEditor').textContent, /100/);
    change($('llsSetName'), 'Synthetic maximum set'); row(0, 'business', 80); click('llsAddRow'); row(1, 'cp', 20); click('llsSaveSet');
    assert.deepEqual(get().sets.at(-1).items, [['business', 80], ['cp', 20]]);
  });
  for (const combination of [[['business', 101]], [['business', 60], ['business', 41]], [['business', 100], ['cp', 1]]]) {
    await run(`a combination over 100 total copies cannot save: ${JSON.stringify(combination)}`, ({ $, open, click, change, row, get, editorOpen, events }) => {
      open(); click('llsAdd'); change($('llsSetName'), 'Synthetic above maximum');
      combination.forEach(([id, quantity], index) => { if (index) click('llsAddRow'); row(index, id, quantity); });
      click('llsSaveSet'); assert.deepEqual(get(), expectedDefaults); assert.ok(editorOpen()); assert.equal(events.length, 0);
      assert.match($('llsSetError').textContent, /100|too (?:many|large)|maximum/i);
    });
  }
  await run('merged copy totals must remain safe integers', ({ $, open, click, change, row, get, editorOpen }) => {
    open(); click('llsAdd'); change($('llsSetName'), 'Synthetic overflow'); row(0, 'business', Number.MAX_SAFE_INTEGER);
    click('llsAddRow'); row(1, 'business', 1); click('llsSaveSet');
    assert.deepEqual(get(), expectedDefaults); assert.ok(editorOpen()); assert.ok($('llsSetError').textContent.trim());
  });
  await run('a set with no rows cannot save', ({ $, open, click, change, rows, get, editorOpen }) => {
    open(); click('llsAdd'); change($('llsSetName'), 'Synthetic empty set');
    rows().forEach(row => row.querySelector('.lls-remove-row').click());
    assert.equal(rows().length, 0); click('llsSaveSet');
    assert.deepEqual(get(), expectedDefaults); assert.ok(editorOpen()); assert.match($('llsSetError').textContent, /size|row|label/i);
  });
  await run('unknown size IDs cannot save, even if injected into the editor', ({ w, $, open, click, change, rows, get, editorOpen }) => {
    open(); click('llsAdd'); change($('llsSetName'), 'Synthetic unknown format');
    const select = rows()[0].querySelector('.lls-set-size'); const option = w.document.createElement('option');
    option.value = 'unknown-format'; option.textContent = 'Synthetic unknown'; select.append(option);
    change(select, 'unknown-format', 'change'); click('llsSaveSet');
    assert.deepEqual(get(), expectedDefaults); assert.ok(editorOpen()); assert.match($('llsSetError').textContent, /size|format|available|choose/i);
  });

  await run('editing a default set preserves its ID, position and untouched preferences', ({ $, open, edit, change, row, click, get }) => {
    open(); edit(0); assert.equal($('llsSetName').value, 'Two Matching Labels');
    change($('llsSetName'), 'My classroom pair'); row(0, 'business', 4); click('llsSaveSet');
    assert.deepEqual(get(), { ...expectedDefaults, sets: [{ id: 'matching', name: 'My classroom pair', items: [['business', 4]] }, expectedDefaults.sets[1]] });
  });
  await run('edit Cancel and top Back discard drafts without touching storage; reopen is clean', ({ $, open, edit, click, change, row, get, stored, writes, settingsOpen, editorOpen }) => {
    open(); const before = stored(); edit(0); change($('llsSetName'), 'Unsaved name'); row(0, 'cp', 8); click('llsCancelSet');
    assert.equal(stored(), before); assert.ok(!editorOpen()); assert.ok(settingsOpen());
    edit(0); assert.equal($('llsSetName').value, 'Two Matching Labels'); change($('llsSetName'), 'Unsaved second name'); click('llsBack');
    assert.ok(settingsOpen(), 'First Back returns from editor to settings'); assert.ok(!editorOpen());
    click('llsBack'); assert.ok(!settingsOpen()); open(); edit(0);
    assert.equal($('llsSetName').value, 'Two Matching Labels'); assert.deepEqual(get(), expectedDefaults); assert.equal(writes.length, 0);
  });
  await run('Cancel creation never leaves an empty custom set or saves a partial row', ({ $, open, click, change, row, get, writes }) => {
    open(); click('llsAdd'); change($('llsSetName'), 'Unsaved new set'); row(0, 'cp', 3); click('llsCancelSet');
    assert.deepEqual(get(), expectedDefaults); assert.equal(writes.length, 0);
    click('llsAdd'); assert.notEqual($('llsSetName').value, 'Unsaved new set');
  });
  await run('blocked browser storage rolls back switches and retains an editor draft for a safe retry', ({ w, $, open, click, change, row, get, toggle, events, editorOpen }) => {
    open(); const original = w.Storage.prototype.setItem;
    w.Storage.prototype.setItem = function (key, value) { if (key === KEY) throw new w.DOMException('Synthetic storage unavailable', 'QuotaExceededError'); return original.call(this, key, value); };
    toggle('small', true);
    assert.equal($('llsSizes').querySelector('input[data-size-id="small"]').checked, false);
    assert.deepEqual(get(), expectedDefaults); assert.equal(events.length, 0);
    assert.match($('llsSettingsStatus').textContent, /could not|unavailable/i);
    click('llsAdd'); change($('llsSetName'), 'Synthetic retained draft'); row(0, 'business', 3); click('llsSaveSet');
    assert.ok(editorOpen()); assert.equal($('llsSetName').value, 'Synthetic retained draft');
    assert.deepEqual(get(), expectedDefaults); assert.equal(events.length, 0);
    assert.match($('llsSetError').textContent, /could not|not be saved/i);
    w.Storage.prototype.setItem = original; click('llsSaveSet');
    assert.equal(get().sets.length, 3); assert.deepEqual(get().sets[2].items, [['business', 3]]); assert.equal(events.length, 1);
  });
  await run('disabled-size combinations remain visible, editable and saved without silently enabling sizes', ({ $, open, edit, click, change, get }) => {
    open(); assert.match($('llsSets').textContent, /saved cards/); assert.match($('llsSets').textContent, /turned off|disabled|unavailable|not available/i);
    edit(0); const options = [...$('llsSetRows').querySelectorAll('option')];
    assert.ok(options.some(option => option.value === 'cp' && /off|disabled|unavailable/i.test(option.textContent)));
    change($('llsSetName'), 'Edited saved combination'); click('llsSaveSet');
    assert.equal(get().sizes.cp, false); assert.deepEqual(get().sets[0].items, saved.sets[0].items); assert.equal(get().sets[0].id, saved.sets[0].id);
  }, { stored: { [KEY]: saved } });
  await run('unknown legacy set contents survive inspection/cancel and require explicit correction to save', ({ $, open, edit, click, change, row, get, stored, editorOpen }) => {
    open(); const before = stored(); edit(1); click('llsCancelSet'); assert.equal(stored(), before);
    edit(1); change($('llsSetName'), 'Renamed legacy'); click('llsSaveSet');
    assert.ok(editorOpen()); assert.equal(stored(), before); assert.ok($('llsSetError').textContent.trim());
    row(0, 'small', 4); click('llsSaveSet');
    assert.deepEqual(get().sets[1], { id: 'legacy-set', name: 'Renamed legacy', items: [['small', 4]] });
  }, { stored: { [KEY]: saved } });
  const oversized = { ...expectedDefaults, sets: [{ id: 'custom-oversized', name: 'Synthetic legacy oversized set', items: [['business', 101]] }] };
  await run('oversized legacy combinations remain stored unchanged until explicitly corrected', ({ $, open, edit, click, row, get, stored, editorOpen }) => {
    open(); assert.deepEqual(get(), oversized); const before = stored();
    assert.match($('llsSets').textContent, /100|too many|unavailable|not available/i);
    edit(0); click('llsCancelSet'); assert.equal(stored(), before);
    edit(0); click('llsSaveSet'); assert.ok(editorOpen()); assert.equal(stored(), before);
    row(0, 'business', 100); click('llsSaveSet');
    assert.deepEqual(get().sets, [{ id: 'custom-oversized', name: 'Synthetic legacy oversized set', items: [['business', 100]] }]);
  }, { stored: { [KEY]: oversized } });
  await run('all sizes can be off without losing combinations or crashing the inline editor', ({ $, open, click, toggle, get, change, row }) => {
    open(); Object.keys(expectedMeta).forEach(id => toggle(id, false));
    assert.ok(Object.values(get().sizes).every(value => !value)); assert.deepEqual(get().sets, expectedDefaults.sets);
    click('llsAdd'); change($('llsSetName'), 'Dormant combination'); row(0, 'business', 2); click('llsSaveSet');
    assert.equal(get().sets.length, 3); assert.equal(get().sizes.business, false);
    assert.match($('llsSets').textContent, /turned off|disabled|unavailable|not available/i);
  });
  const literalName = '<img src=x onerror="window.syntheticInjected=true"> Cards & Baskets';
  await run('saved and newly entered HTML-looking names render as literal text', ({ w, $, open, click, change, get }) => {
    open(); assert.ok($('llsSets').textContent.includes(literalName)); assert.equal($('llsSets').querySelector('img'), null);
    click('llsAdd'); change($('llsSetName'), literalName); click('llsSaveSet');
    assert.equal(get().sets.at(-1).name, literalName); assert.equal($('llsSets').querySelector('img'), null); assert.equal(w.syntheticInjected, undefined);
  }, { stored: { [KEY]: { ...expectedDefaults, sets: [{ id: 'custom-literal', name: literalName, items: [['business', 1]] }] } } });

  await run('disabled combinations are explained and cannot be selected in create, batch or reprint', async ({ w, $, open, toggle, click, tick, get }) => {
    open(); toggle('cp', false); click('llsBack'); await tick();
    for (const id of ['llDynamicSets', 'llReprintSets']) {
      if (id === 'llReprintSets') { w.show('reprint'); await tick(); }
      const choice = [...$(id).querySelectorAll('.choice')].find(element => element.textContent.includes('Business Card + Basket'));
      assert.ok(choice, `${id} keeps the unavailable combination visible`);
      assert.equal(choice.getAttribute('aria-disabled'), 'true');
      assert.match(choice.textContent, /off|disabled|unavailable|turn on/i);
      choice.click(); assert.ok(!choice.classList.contains('selected'));
    }
    const option = [...$('batchSetSelect').options].find(option => option.value === 'set:different');
    assert.ok(option); assert.equal(option.disabled, true); assert.match(option.textContent, /off|disabled|unavailable/i);
    assert.deepEqual(get().sets, expectedDefaults.sets, 'Disabling a format never deletes saved combinations');
    open(); toggle('cp', true); click('llsBack'); await tick();
    const enabled = [...$('llDynamicSets').querySelectorAll('.choice')].find(element => element.textContent.includes('Business Card + Basket'));
    assert.ok(enabled); assert.notEqual(enabled.getAttribute('aria-disabled'), 'true');
    assert.equal([...$('batchSetSelect').options].find(option => option.value === 'set:different').disabled, false);
    assert.equal(w.eval('queue.length'), 0); assert.equal(w.eval('library.length'), 0);
  }, { fullApp: true });

  await run('literal set names remain inert in every linked workflow selector and summary', async ({ w, $, open, tick }) => {
    open(); w.dispatchEvent(new w.CustomEvent('little-label-settings-changed', { detail: w.LittleLabelSettings.get() }));
    w.show('reprint'); await tick();
    for (const id of ['llsSets', 'llDynamicSets', 'llReprintSets', 'setSummary']) {
      assert.ok($(id).textContent.includes(literalName), `${id} shows the actual saved name`);
      assert.equal($(id).querySelector('img'), null, `${id} must not turn a name into markup`);
    }
    assert.ok($('batchSetSelect').textContent.includes(literalName)); assert.equal(w.syntheticInjected, undefined);
  }, { fullApp: true, stored: { [KEY]: { ...expectedDefaults, sets: [{ id: 'custom-literal', name: literalName, items: [['business', 1]] }] } } });

  await run('changing availability and saved combinations never resizes labels already queued or saved', async ({ w, $, open, toggle, edit, change, row, click, tick }) => {
    w.eval(`queue = [{ id: 'synthetic-queued', label_id: 'synthetic-saved', english: 'Synthetic existing basket', spanish: '', photo: '', size: 'Fold-Over Basket Label · 4.5 × 3 in (folds to 4.5 × 1.5 visible)' }];
      library = [{ id: 'synthetic-saved', english: 'Synthetic existing basket', spanish: '', photo: '', size: 'Fold-Over Basket Label · 4.5 × 3 in (folds to 4.5 × 1.5 visible)' }];`);
    const before = w.eval('JSON.stringify({queue,library})');
    open(); toggle('cp', false); edit(1); change($('llsSetName'), 'Synthetic future-only combination');
    row(0, 'small', 3); click('llsSaveSet'); click('llsBack'); await tick();
    assert.equal(w.eval('JSON.stringify({queue,library})'), before, 'Only future choices use edited preferences');
  }, { fullApp: true });
  await run('oversized legacy combinations are disabled with reasons in every workflow selector', async ({ w, $, get, tick }) => {
    w.show('reprint'); await tick();
    for (const id of ['llDynamicSets', 'llReprintSets']) {
      const choice = [...$(id).querySelectorAll('.choice')].find(element => element.textContent.includes('Synthetic legacy oversized set'));
      assert.ok(choice); assert.equal(choice.getAttribute('aria-disabled'), 'true'); assert.match(choice.textContent, /100|too many|unavailable|not available/i);
    }
    const option = [...$('batchSetSelect').options].find(option => option.value === 'set:custom-oversized');
    assert.ok(option); assert.equal(option.disabled, true); assert.deepEqual(get(), oversized);
    assert.equal(w.eval('queue.length'), 0);
  }, { fullApp: true, stored: { [KEY]: oversized } });
  for (const sets of [[], expectedDefaults.sets]) {
    await run(`batch Save with no available formats retains drafts and makes no writes (${sets.length ? 'disabled combinations' : 'empty combinations'})`, async ({ w, $, click, tick, dialogs, calls }) => {
      w.eval(`batchDrafts = [{ english: 'Synthetic retained batch', spanish: 'Synthetic translated batch', photo: 'data:image/png;base64,c3ludGhldGlj', needs_product_image: false }]; show('batchReview');`);
      await tick(); const before = w.eval('JSON.stringify(batchDrafts)'), callsBefore = calls.length;
      assert.equal($('batchSetSelect').value, ''); click('saveAllBatchBtn'); click('saveAllBatchBtn'); await tick();
      assert.equal(w.eval('JSON.stringify(batchDrafts)'), before); assert.equal(w.eval('queue.length'), 0); assert.equal(w.eval('library.length'), 0);
      assert.equal(calls.length, callsBefore); assert.ok(!$('batchReview').classList.contains('hidden')); assert.equal($('saveAllBatchBtn').disabled, false);
      assert.equal(dialogs.length, 2); for (const [type, message] of dialogs.splice(0)) { assert.equal(type, 'alert'); assert.match(message, /available size|turn on label sizes/i); }
    }, { fullApp: true, stored: { [KEY]: { ...expectedDefaults, sizes: Object.fromEntries(Object.keys(expectedMeta).map(id => [id, false])), sets } } });
  }
  await run('rerendered create and reprint choice buttons retain focus and expose selection', async ({ w, $, tick }) => {
    for (const [screen, container] of [['sets', 'llDynamicSets'], ['reprint', 'llReprintSets']]) {
      w.show(screen); await tick();
      for (const selector of ['[data-combination-id="different"]', '[data-single-choice="true"]', '[data-combination-id="matching"]']) {
        const old = $(container).querySelector(selector); old.focus(); old.click();
        const current = $(container).querySelector(selector); assert.notEqual(current, old, 'Choice was rerendered');
        assert.equal(w.document.activeElement, current, 'Keyboard focus follows the selected replacement button');
        assert.equal(current.getAttribute('aria-pressed'), 'true'); assert.equal($(container).querySelectorAll('[aria-pressed="true"]').length, 1);
      }
    }
  }, { fullApp: true });
  await run('100-copy summaries use one counted line instead of expanding 100 DOM lines', ({ $, get, stored }) => {
    assert.match($('setSummary').textContent, /100 copies/); assert.equal($('setSummary').querySelectorAll('br').length, 1);
    assert.equal(get().sets[0].items[0][1], 100); assert.equal(JSON.parse(stored()).sets[0].items[0][1], 100);
  }, { fullApp: true, stored: { [KEY]: { ...expectedDefaults, sets: [{ id: 'custom-hundred', name: 'Synthetic 100-copy set', items: [['business', 100]] }] } } });
})().catch(error => { console.error(error); process.exitCode = 1; });
