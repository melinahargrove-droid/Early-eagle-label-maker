// Production UI and save handlers, synthetic accounts/photos only. No browser or live I/O.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { fixture, tick, photo } = require('./audit-fixture.cjs');
const replacementPhoto = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD9sAAAAASUVORK5CYII=';
const results = [], evidence = {};

async function test(name, run) {
  const f = await fixture(false), readers = [], alerts = [];
  f.w.alert = message => alerts.push(message);
  f.w.FileReader = class {
    readAsDataURL() { readers.push(this); }
  };
  f.selectPhoto = (index, { deferSelection = false, cancel = false } = {}) => {
    let select;
    const create = f.w.document.createElement.bind(f.w.document);
    f.w.document.createElement = tag => {
      const element = create(tag);
      if (tag === 'input') element.click = () => {
        select = () => {
          Object.defineProperty(element, 'files', { value: cancel ? [] : [{}] });
          element.onchange();
        };
        if (!deferSelection) select();
      };
      return element;
    };
    try { f.$('nlPhotos').querySelectorAll('button')[index].click(); }
    finally { f.w.document.createElement = create; }
    return deferSelection ? select : readers.at(-1);
  };
  f.finish = (reader, result = photo) => { reader.result = result; reader.onload(); };
  f.openNames = (names = 'Synthetic Ada\nSynthetic Bea', style = 'photo') => {
    f.$('homeNameBtn').click(); f.input('nlNames', names);
    f.w.document.querySelector(`#nameLabelsOverlay [data-style="${style}"]`).click();
  };
  f.alerts = alerts;
  f.status = () => f.$('nlPhotoStatus').textContent;
  f.noSaves = () => { assert.equal(f.w.eval('queue.length'), 0); assert.equal(f.w.eval('library.length'), 0); };
  try {
    await run(f); await tick();
    assert.deepEqual(f.errors, []);
    assert.equal(f.ai().length, 0, 'Name-label decisions never call a provider');
    assert.equal(f.calls.filter(call => call.path.startsWith('/rest/v1/') && !call.path.includes('/rpc/') && !['GET', 'HEAD'].includes(call.options.method || 'GET')).length, 0, 'All saves in this fixture are local and synthetic');
    results.push(name); console.log('PASS ' + name);
  } finally { f.close(); }
}

(async () => {
  await test('missing-photo guidance is visible and accessible before the first Save click', async f => {
    f.openNames();
    const guidance = f.$('nlPhotoGuidance'), status = f.$('nlPhotoStatus'), next = f.$('nlNext');
    assert.equal(guidance.hidden, false);
    assert.equal(guidance.nextElementSibling, next, 'Guidance immediately precedes Save');
    assert.match(f.status(), /2 of 2 students are missing a photo/);
    assert.equal(status.getAttribute('role'), 'status');
    assert.equal(status.getAttribute('aria-live'), 'polite');
    assert.equal(status.getAttribute('aria-atomic'), 'true');
    assert.equal(next.getAttribute('aria-describedby'), 'nlPhotoStatus nlPhotoHelp');
    assert.match(f.$('nlPhotoHelp').textContent, /whole batch/);
    assert.equal(f.$('nlMissingPhotos').hidden, true); f.noSaves();
    evidence.beforeSave = { text: f.status(), guidanceHidden: guidance.hidden, immediatelyBeforeSave: guidance.nextElementSibling === next, role: status.getAttribute('role'), describedBy: next.getAttribute('aria-describedby'), onSaveDialogHidden: f.$('nlMissingPhotos').hidden, queueLength: f.w.eval('queue.length'), libraryLength: f.w.eval('library.length'), saveClicks: 0 };
  });

  await test('zero names and Name Only show no photo warning or hidden Save description', async f => {
    f.openNames('', 'photo');
    assert.equal(f.$('nlPhotoGuidance').hidden, true); assert.equal(f.status(), '');
    assert.equal(f.$('nlNext').hasAttribute('aria-describedby'), false);
    f.input('nlNames', 'Synthetic Ada'); assert.match(f.status(), /1 of 1 student is missing a photo/);
    f.w.document.querySelector('[data-style="name"]').click();
    assert.equal(f.$('nlPhotoGuidance').hidden, true); assert.equal(f.status(), '');
    assert.equal(f.$('nlNext').hasAttribute('aria-describedby'), false);
    f.w.document.querySelector('[data-style="photo"]').click();
    f.input('nlNames', ' \n\n '); assert.equal(f.$('nlPhotoGuidance').hidden, true); f.noSaves();
  });

  await test('Add Photos focuses the missing student without saving or opening confirmation', async f => {
    f.openNames(); f.finish(f.selectPhoto(0));
    assert.match(f.status(), /1 of 2 students is missing a photo/);
    f.$('nlInlineAddPhotos').click();
    assert.equal(f.w.document.activeElement.getAttribute('aria-label'), 'Add photo for Synthetic Bea');
    assert.match(f.$('nlPreviewPosition').textContent, /2 of 2.*Synthetic Bea/);
    assert.equal(f.$('nlMissingPhotos').hidden, true); f.noSaves();
  });

  await test('inline Use Name Only preserves photos and changes the draft without saving', async f => {
    f.openNames(); f.finish(f.selectPhoto(1)); f.$('nlUseNameOnly').click();
    assert.equal(f.w.NLStyle(), 'name'); assert.equal(f.$('nlPhotoGuidance').hidden, true);
    assert.equal(f.w.document.activeElement.dataset.style, 'name');
    assert.equal(f.w.NLStudents()[1].photo, photo); f.noSaves();
    f.w.document.querySelector('[data-style="photo"]').click();
    assert.match(f.status(), /1 of 2 students is missing a photo/);
    assert.equal(f.w.NLStudents()[1].photo, photo);
  });

  await test('pending reads are counted separately and Save cannot commit an unfinished photo', async f => {
    f.openNames(); const first = f.selectPhoto(0);
    assert.match(f.status(), /1 of 2 students is missing a photo/);
    assert.match(f.status(), /1 photo is still loading/);
    assert.equal(f.$('nlPhotos').querySelector('button').getAttribute('aria-busy'), 'true');
    f.$('nlInlineAddPhotos').click(); assert.match(f.w.document.activeElement.getAttribute('aria-label'), /Synthetic Bea/);
    const second = f.selectPhoto(1);
    assert.doesNotMatch(f.status(), /missing|Photos added/); assert.match(f.status(), /2 photos are still loading/);
    assert.equal(f.$('nlPhotoChoices').hidden, true);
    f.$('nlNext').click(); assert.match(f.alerts.at(-1), /finish loading/); f.noSaves();
    assert.equal(f.$('nlMissingPhotos').hidden, true);
    f.finish(first); assert.match(f.status(), /1 photo is still loading/);
    f.finish(second); assert.equal(f.status(), 'Photos added for all 2 students.');
    assert.equal(f.$('nlNext').getAttribute('aria-describedby'), 'nlPhotoStatus');
    assert.equal(f.$('nlPhotos').querySelector('[aria-busy]'), null);
  });

  for (const outcome of ['error', 'abort', 'throw']) await test(`${outcome} during photo loading returns to the missing-photo count`, async f => {
    f.openNames('Synthetic Ada');
    if (outcome === 'throw') f.w.FileReader = class { readAsDataURL() { throw Error('Synthetic read failure'); } };
    const reader = f.selectPhoto(0);
    if (outcome !== 'throw') reader[outcome === 'error' ? 'onerror' : 'onabort']();
    assert.match(f.status(), /1 of 1 student is missing a photo/); assert.doesNotMatch(f.status(), /loading/);
    assert.equal(f.w.NLStudents()[0].reading, false);
    assert.match(f.alerts.at(-1), /could not be read/); f.noSaves();
  });

  await test('replacement failure retains the existing photo and latest selection wins', async f => {
    f.openNames('Synthetic Ada'); f.finish(f.selectPhoto(0));
    const failed = f.selectPhoto(0); assert.match(f.status(), /1 photo is still loading/); assert.doesNotMatch(f.status(), /Photos added/);
    failed.onerror(); assert.equal(f.w.NLStudents()[0].photo, photo); assert.equal(f.status(), 'Photo added for this student.');
    const stale = f.selectPhoto(0), latest = f.selectPhoto(0);
    f.finish(latest, replacementPhoto); f.finish(stale);
    assert.equal(f.w.NLStudents()[0].photo, replacementPhoto); assert.doesNotMatch(f.status(), /loading|missing/);
  });

  await test('name edits, duplicate names and removed students preserve correct photo counts', async f => {
    f.openNames('Synthetic Ada\nSynthetic Ada\nSynthetic Bea'); f.finish(f.selectPhoto(1));
    assert.match(f.status(), /2 of 3 students are missing a photo/);
    f.input('nlNames', 'Synthetic Bea\nSynthetic Ada\nSynthetic Ada');
    assert.equal(f.w.NLStudents()[2].photo, photo); assert.match(f.status(), /2 of 3 students are missing a photo/);
    const stale = f.selectPhoto(0);
    f.input('nlNames', 'Synthetic Ada\nSynthetic Ada'); f.finish(stale);
    assert.match(f.status(), /1 of 2 students is missing a photo/); assert.equal(f.w.NLStudents().length, 2);
    f.input('nlNames', ''); assert.equal(f.$('nlPhotoGuidance').hidden, true);
  });

  await test('cancelled and stale file pickers do not attach photos to a different student', async f => {
    f.openNames(); f.selectPhoto(0, { cancel: true }); assert.match(f.status(), /2 of 2/);
    const select = f.selectPhoto(0, { deferSelection: true }); f.input('nlNames', 'Synthetic Bea'); select();
    assert.match(f.status(), /1 of 1 student is missing a photo/); assert.doesNotMatch(f.status(), /loading/);
    assert.equal(f.w.NLStudents()[0].photo, ''); f.noSaves();
  });

  await test('style switches and account resets ignore stale loading results and hide old guidance', async f => {
    f.openNames('Synthetic Ada'); const sameAccount = f.selectPhoto(0);
    f.w.document.querySelector('[data-style="name"]').click(); f.finish(sameAccount);
    assert.equal(f.$('nlPhotoGuidance').hidden, true); assert.equal(f.status(), '');
    f.w.document.querySelector('[data-style="photo"]').click(); assert.doesNotMatch(f.status(), /missing|loading/);
    const oldAccount = f.selectPhoto(0), stalePicker = f.selectPhoto(0, { deferSelection: true });
    await f.switchAccount('customer-B'); f.finish(oldAccount, replacementPhoto); stalePicker();
    assert.equal(f.$('nlPhotoGuidance').hidden, true); assert.equal(f.status(), '');
    assert.equal(f.$('nlNext').hasAttribute('aria-describedby'), false);
    assert.equal(f.$('nlNames').value, ''); assert.equal(f.w.NLStudents().length, 0);
    assert.equal(f.$('nameLabelsOverlay').classList.contains('hide'), true); f.noSaves();
  });

  await test('on-save photo decision and immutable name-only queue snapshots remain intact', async f => {
    f.openNames(); f.finish(f.selectPhoto(1));
    f.$('nlNext').click();
    assert.equal(f.$('nlMissingPhotos').hidden, false); assert.match(f.$('nlMissingMessage').textContent, /1 of 2/);
    assert.equal(f.w.document.activeElement.id, 'nlAddMissingPhotos'); f.noSaves();
    f.$('nlAddMissingPhotos').click(); assert.equal(f.$('nlMissingPhotos').hidden, true);
    assert.equal(f.w.document.activeElement.getAttribute('aria-label'), 'Add photo for Synthetic Ada');
    f.$('nlNext').click(); f.$('nlContinueNameOnly').click(); f.$('nlContinueNameOnly').click(); await tick();
    assert.equal(f.w.eval('queue.length'), 2); assert.equal(f.w.eval('library.length'), 2);
    assert.ok(f.w.eval('queue.every(item => !item.photo)'));
    const saved = f.w.eval('JSON.stringify(queue)');
    f.$('queueBack').click(); f.$('homeNameBtn').click(); f.w.document.querySelector('[data-style="photo"]').click();
    assert.match(f.status(), /1 of 2/); assert.equal(f.w.NLStudents()[1].photo, photo);
    f.finish(f.selectPhoto(0), replacementPhoto); f.input('nlNames', 'Synthetic Bea\nSynthetic Cy');
    assert.equal(f.w.eval('JSON.stringify(queue)'), saved);
  });

  await test('a completed photo batch still saves all photos and copies without a missing-photo dialog', async f => {
    f.openNames(); f.finish(f.selectPhoto(0)); f.finish(f.selectPhoto(1), replacementPhoto);
    f.$('nlCopies').value = '2'; f.$('nlCopies').dispatchEvent(new f.w.Event('change'));
    f.$('nlNext').click(); await tick();
    assert.equal(f.$('nlMissingPhotos').hidden, true); assert.equal(f.w.eval('queue.length'), 4);
    assert.equal(f.w.eval('library.length'), 2); assert.ok(f.w.eval('queue.every(item => item.photo.startsWith("data:image/"))'));
  });

  if (process.env.REAUDIT_EVIDENCE_DIR) {
    const destination = path.resolve(process.env.REAUDIT_EVIDENCE_DIR); fs.mkdirSync(destination, { recursive: true });
    fs.writeFileSync(path.join(destination, 'name-guidance-after.json'), JSON.stringify({ ...evidence, passed: results.length, scenarios: results, syntheticOnly: true, providerCalls: 0, liveWrites: 0, realBrowserRun: false }, null, 2) + '\n');
  }
  console.log(`PASS ${results.length} pre-save name-photo guidance scenarios with synthetic DOM fixtures`);
})().catch(error => { console.error(error); process.exitCode = 1; });
