const { JSDOM, ResourceLoader, VirtualConsole } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
class LocalScripts extends ResourceLoader {
  fetch(url) {
    const u = new URL(url);
    return u.hostname === 'labels.test' && u.pathname.endsWith('.js')
      ? Promise.resolve(fs.readFileSync(path.join(root, u.pathname))) : null;
  }
}
async function fixture() {
  const errors = [], alerts = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), {
    url: 'https://labels.test/', runScripts: 'dangerously', pretendToBeVisual: true,
    resources: new LocalScripts(), virtualConsole,
    beforeParse(w) {
      w.fetch = async () => { throw Error('Synthetic offline'); };
      w.scrollTo = () => {}; w.alert = message => alerts.push(String(message)); w.TextEncoder = TextEncoder;
      w.localStorage.setItem('littleLabelsWelcomeSeenV1', '1');
      w.Image = class { constructor() { this.naturalWidth = 1; this.naturalHeight = 1; } set src(value) { queueMicrotask(() => this.onload?.()); } };
      w.HTMLCanvasElement.prototype.getContext = () => ({ fillRect() {}, drawImage() {} });
      w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,c3ludGhldGlj';
    }
  });
  const w = dom.window;
  await new Promise(resolve => w.addEventListener('load', resolve));
  const $ = id => w.document.getElementById(id);
  const click = id => $(id).click();
  const input = (id, value) => {
    $(id).value = value;
    $(id).dispatchEvent(new w.Event('input', { bubbles: true }));
  };
  const tick = () => new Promise(resolve => setTimeout(resolve, 5));
  const visible = id => !$(id).classList.contains('hidden');
  const typedOpen = () => !$('typeLabelOverlay').classList.contains('tl-hidden');
  const getSettings = w.LittleLabelSettings.get;
  let language = 'es';
  w.LittleLabelSettings.get = () => ({ ...getSettings(), language });
  const setLanguage = value => {
    language = value;
    w.dispatchEvent(new w.Event('little-label-settings-changed'));
  };
  const deferTranslations = () => {
    const requests = [];
    w.littleLabelsAIFetch = (url, options) => new Promise(resolve => {
      requests.push({ url, options, resolve: translation => resolve({
        ok: true, json: async () => ({ success: true, translation, spanish: translation })
      }) });
    });
    return requests;
  };
  return { w, $, click, input, tick, visible, typedOpen, setLanguage, deferTranslations, errors, alerts };
}

async function run(name, test) {
  if (process.env.WORKFLOW_UI_FILTER && !new RegExp(process.env.WORKFLOW_UI_FILTER).test(name)) return;
  const f = await fixture();
  try {
    await test(f);
    await f.tick();
    assert.deepEqual(f.errors, [], 'No uncaught browser errors');
    console.log('PASS ' + name);
  } finally { f.w.close(); }
}

(async () => {
  await run('print-preview hierarchy and unambiguous marking action', async ({ w, $ }) => {
    w.eval(`queue = [{id:'synthetic-queue',english:'Synthetic Blocks',spanish:'',size:'Business Card'}]; refreshQueue();`);
    assert.equal($('mockSheets').textContent, 'Preview Print Sheets');
    assert.ok($('mockSheets').classList.contains('primary'));
    assert.ok($('mockSheets').compareDocumentPosition($('queueItems')) & w.Node.DOCUMENT_POSITION_FOLLOWING);
    assert.ok($('nextMaterialBtn').classList.contains('secondary'));
    assert.equal($('queueItems').querySelector('button').textContent, 'Mark printed');
    assert.ok($('queueItems').querySelector('button').classList.contains('secondary'));
  });

  await run('typed draft retention, real Review step, and isolation from the previous photo', async ({ w, $, click, input, tick, visible, typedOpen }) => {
    w.eval(`photoDataUrl = 'data:image/png;base64,PRIORPHOTO'; activePhotoDataUrl = photoDataUrl;
      cleanedPhotoDataUrl = photoDataUrl; identification = {english:'Previous photo',spanish:'Old translation'};`);
    click('homeTypeBtn');
    assert.equal($('tlNext').textContent, 'Review Label →');
    input('tlEnglish', 'Synthetic Typed Blocks');
    input('tlSecond', 'Synthetic Translation');
    click('tlBack');
    assert.ok(!typedOpen());
    click('homeTypeBtn');
    assert.equal($('tlEnglish').value, 'Synthetic Typed Blocks');
    assert.equal($('tlSecond').value, 'Synthetic Translation');
    click('tlNext');
    await tick();
    assert.ok(visible('preview'), 'Typed wording opens the review screen');
    assert.ok(!typedOpen());
    assert.ok(!visible('sets'), 'Review is not skipped');
    assert.equal(w.eval('identification.english'), 'Synthetic Typed Blocks');
    assert.ok(!w.eval('[photoDataUrl, activePhotoDataUrl, cleanedPhotoDataUrl].some(value => value.includes("PRIORPHOTO"))'));
    assert.ok(!$('labelPhoto').src.includes('PRIORPHOTO'));
    assert.equal(w.eval('queue.length'), 0, 'Review must not save');
    assert.equal(w.eval('library.length'), 0, 'Review must not save');
    input('englishInput', 'Synthetic Edited Blocks');
    input('spanishInput', 'Synthetic Edited Translation');
    click('previewBack');
    assert.ok(typedOpen(), 'Back from typed review returns to the typed draft');
    assert.equal($('tlEnglish').value, 'Synthetic Edited Blocks');
    assert.equal($('tlSecond').value, 'Synthetic Edited Translation');
    click('tlBack');
    click('homeTypeBtn');
    assert.equal($('tlEnglish').value, 'Synthetic Edited Blocks');
    assert.equal($('tlSecond').value, 'Synthetic Edited Translation');
  });

  // Automatic-translation scenarios are intentionally replaced by manual-first
  // assertions. Paid explicit-action races are covered by manual-translation*.cjs.
  await run('manual Review accepts a blank second line and repeated clicks make no AI call', async ({ $, click, input, tick, visible, typedOpen, deferTranslations }) => {
    const requests = deferTranslations(); click('homeTypeBtn'); input('tlEnglish', 'Synthetic Manual');
    click('tlNext'); click('tlNext'); await tick();
    assert.equal(requests.length, 0); assert.ok(visible('preview')); assert.ok(!typedOpen()); assert.equal($('spanishInput').value, '');
  });
  await run('manual second wording survives English edits and Review without AI', async ({ $, click, input, tick, visible, deferTranslations }) => {
    const requests = deferTranslations(); click('homeTypeBtn'); input('tlEnglish', 'Old wording'); input('tlSecond', 'Teacher wording');
    input('tlEnglish', 'New wording'); assert.equal($('tlSecond').value, 'Teacher wording'); click('tlNext'); await tick();
    assert.ok(visible('preview')); assert.equal($('spanishInput').value, 'Teacher wording'); assert.equal(requests.length, 0);
  });
  await run('account-screen interruption and reopening preserve manual typed work without a continuation', async ({ w, $, click, input, tick, visible, typedOpen, deferTranslations }) => {
    const requests = deferTranslations(); click('homeTypeBtn'); input('tlEnglish', 'Interrupted draft');
    w.show('account'); w.show('home'); click('homeTypeBtn'); await tick();
    assert.ok(typedOpen()); assert.ok(!visible('preview')); assert.equal($('tlEnglish').value, 'Interrupted draft'); assert.equal(requests.length, 0);
  });
  await run('English-only review excludes hidden second text and Back preserves the typed manual draft', async ({ $, click, input, tick, visible, setLanguage, deferTranslations }) => {
    const requests = deferTranslations(); click('homeTypeBtn'); input('tlEnglish', 'Blocks'); input('tlSecond', 'Manual second wording');
    setLanguage('none'); click('tlNext'); await tick(); assert.ok(visible('preview')); assert.equal($('spanishInput').value, '');
    click('previewBack'); setLanguage('es'); assert.equal($('tlSecond').value, 'Manual second wording'); assert.equal(requests.length, 0);
  });
  await run('legacy auto-translation entry points do nothing and cannot overwrite manual review', async ({ w, $, click, input, tick, deferTranslations }) => {
    const requests = deferTranslations(); click('homeTypeBtn'); input('tlEnglish', 'Reviewed label'); input('tlSecond', 'Initial wording'); click('tlNext'); await tick();
    await w.autoTranslateEnglish(); w.scheduleAutoTranslation(); input('spanishInput', 'Teacher-approved review edit'); await tick();
    assert.equal(requests.length, 0); assert.equal($('spanishInput').value, 'Teacher-approved review edit');
  });

  await run('an older review debounce cannot translate a newer manually worded label', async ({ w, $, click, input, tick }) => {
    let translationCalls = 0;
    w.littleLabelsAIFetch = async () => {
      translationCalls++;
      return { ok: true, json: async () => ({ success: true, translation: 'Unexpected delayed translation' }) };
    };
    w.show('preview');
    input('englishInput', 'Synthetic Previous Debounced Label');
    w.show('home');
    click('homeTypeBtn');
    input('tlEnglish', 'Synthetic New Manual Label');
    input('tlSecond', 'Teacher-approved debounced translation');
    click('tlNext');
    await tick();
    await new Promise(resolve => setTimeout(resolve, 950));
    assert.equal(translationCalls, 0, 'Navigation invalidates a debounce before it starts a request');
    assert.equal($('spanishInput').value, 'Teacher-approved debounced translation');
  });

  await run('account changes clear private typed drafts without starting AI', async ({ w, $, click, input, tick, visible, typedOpen, deferTranslations }) => {
    const requests = deferTranslations(); click('homeTypeBtn'); input('tlEnglish', 'Synthetic private draft'); input('tlSecond', 'Private manual wording'); click('tlNext');
    w.eval(`currentUser = {id:'synthetic-other-owner'}; updateAccountUI(); show('account');`); await tick();
    assert.ok(!typedOpen()); assert.ok(visible('account')); assert.ok(!visible('preview')); w.show('home'); click('homeTypeBtn');
    assert.equal($('tlEnglish').value, ''); assert.equal($('tlSecond').value, ''); assert.equal(requests.length, 0); assert.equal(w.eval('queue.length'), 0); assert.equal(w.eval('library.length'), 0);
  });

  await run('failed single-label save retains the draft and successful session save explains its limit', async ({ w, $, click, input, tick, visible, typedOpen }) => {
    click('homeTypeBtn');
    input('tlEnglish', 'Synthetic Save Retry');
    input('tlSecond', 'Synthetic Save Translation');
    click('tlNext');
    await tick();
    click('chooseSetBtn');
    await tick();
    assert.ok(visible('sets'));
    const originalPrepare = w.prepareCloudPhoto;
    w.prepareCloudPhoto = async () => { throw Error('Synthetic photo preparation failure'); };
    click('addToQueue');
    await tick();
    assert.ok(visible('sets'), 'Failed save stays available to retry');
    assert.equal(w.eval('queue.length'), 0);
    assert.equal(w.eval('library.length'), 0);
    assert.ok(!$('queueSaveNotice')?.textContent.trim(), 'Failed save must not show a success notice');
    click('setsBack');
    click('previewBack');
    assert.ok(typedOpen());
    assert.equal($('tlEnglish').value, 'Synthetic Save Retry');
    assert.equal($('tlSecond').value, 'Synthetic Save Translation');
    click('tlBack');
    click('homeTypeBtn');
    assert.equal($('tlEnglish').value, 'Synthetic Save Retry');
    assert.equal($('tlSecond').value, 'Synthetic Save Translation');

    w.prepareCloudPhoto = originalPrepare;
    click('tlNext');
    await tick();
    click('chooseSetBtn');
    await tick();
    click('addToQueue');
    click('addToQueue');
    await tick();
    assert.ok(visible('queue'));
    assert.equal(w.eval('library.length'), 1);
    assert.equal(w.eval('queue.length'), 2, 'Repeated Save adds only the two copies in the default set');
    assert.equal(w.eval('queue.every(row => row.english === "Synthetic Save Retry")'), true);
    const notice = $('queueSaveNotice')?.textContent || '';
    assert.match(notice, /session|this (?:open )?page|this browser/i, 'Successful offline save discloses session-only storage');
    assert.match(notice, /not.*cloud|cloud.*(?:unavailable|not|disconnect)|keep.*(?:page|tab).*open|(?:lost|disappear).*(?:refresh|close)|(?:refresh|close).*(?:lost|disappear)/i,
      'Successful offline save explains persistence limits');
    w.show('home');
    click('homeTypeBtn');
    assert.equal($('tlEnglish').value, '', 'A confirmed successful save releases the typed draft');
    assert.equal($('tlSecond').value, '');
  });

  await run('single-label save finishing after Back and Home preserves newer navigation and wording', async ({ w, $, click, input, tick, visible, typedOpen }) => {
    click('homeTypeBtn');
    input('tlEnglish', 'Synthetic Saving In Background');
    input('tlSecond', 'Synthetic Original Translation');
    click('tlNext');
    await tick();
    click('chooseSetBtn');
    await tick();
    let finishPreparation;
    w.prepareCloudPhoto = () => new Promise(resolve => { finishPreparation = resolve; });
    click('addToQueue');
    assert.equal(typeof finishPreparation, 'function');
    click('setsBack');
    click('previewBack');
    click('tlBack');
    assert.ok(visible('home'));
    click('homeTypeBtn');
    input('tlEnglish', 'Synthetic New Draft');
    input('tlSecond', 'Synthetic New Translation');
    finishPreparation('');
    await tick();
    assert.ok(visible('home'), 'Background save must not navigate to the queue');
    assert.ok(typedOpen(), 'Background save must not dismiss a newer draft');
    assert.equal($('tlEnglish').value, 'Synthetic New Draft');
    assert.equal($('tlSecond').value, 'Synthetic New Translation');
    assert.equal(w.eval('queue.length'), 2);
    assert.equal(w.eval('library.length'), 1);
    assert.equal(w.eval('queue.every(row => row.english === "Synthetic Saving In Background")'), true);
  });

  await run('an older single-label save cannot report success for a newer unsaved review', async ({ w, $, click, input, tick, visible }) => {
    click('homeTypeBtn');
    input('tlEnglish', 'Synthetic Older Save');
    input('tlSecond', 'Synthetic Older Translation');
    click('tlNext');
    await tick();
    click('chooseSetBtn');
    await tick();
    let finishPreparation;
    w.prepareCloudPhoto = () => new Promise(resolve => { finishPreparation = resolve; });
    click('addToQueue');
    click('setsBack');
    click('previewBack');
    input('tlEnglish', 'Synthetic New Unsaved Review');
    input('tlSecond', 'Synthetic New Unsaved Translation');
    click('tlNext');
    await tick();
    click('chooseSetBtn');
    await tick();
    const statusBeforeCompletion = $('singleSaveStatus').textContent;
    finishPreparation('');
    await tick();
    assert.ok(visible('sets'));
    assert.equal($('englishInput').value, 'Synthetic New Unsaved Review');
    assert.equal($('singleSaveStatus').textContent, statusBeforeCompletion,
      'The older completion must not write a success message onto a newer review');
    assert.doesNotMatch($('singleSaveStatus').textContent, /^(?:Saved|Added for this session)/);
    assert.equal(w.eval('queue.length'), 2);
    assert.equal(w.eval('queue.every(row => row.english === "Synthetic Older Save")'), true);
  });

  for (const kind of ['list', 'name']) {
    await run(`${kind} save finishing after Back and Home does not steal navigation`, async ({ w, $, click, input, tick, visible }) => {
      if (kind === 'list') {
        w.show('makeList');
        input('makeListInput', 'Synthetic Background List');
        click('makeListCreateBtn');
      } else {
        const button = [...w.document.querySelectorAll('.home-action')].find(el => el.textContent.includes('Name Labels'));
        button.click();
        input('nlNames', 'Synthetic Background Name');
      }
      let finishPreparation;
      w.prepareCloudPhoto = () => new Promise(resolve => { finishPreparation = resolve; });
      click(kind === 'list' ? 'mliPrint' : 'nlNext');
      assert.equal(typeof finishPreparation, 'function');
      click(kind === 'list' ? 'mliBack' : 'nlBack');
      if (kind === 'list') click('makeListBack');
      else w.show('home');
      finishPreparation('');
      await tick();
      assert.ok(visible('home'), 'Background completion must preserve the newer screen');
      assert.ok(!visible('queue'));
      assert.equal(w.eval('queue.length'), 1);
      assert.equal(w.eval('library.length'), 1);
      assert.ok($(kind === 'list' ? 'mlIsolated' : 'nameLabelsOverlay').classList.contains(kind === 'list' ? 'mli-hidden' : 'hide'));
    });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
