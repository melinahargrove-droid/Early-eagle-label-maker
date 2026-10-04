(() => {
  const TRANSLATE = 'https://ctmqvbsjliinlddfolti.supabase.co/functions/v1/translate-label';
  let timer = null, sequence = 0, navigation = 0, busy = false;
  let owner = currentUser?.id || null;
  const $ = id => document.getElementById(id);
  const settings = () => window.LittleLabelSettings?.get?.() || { language: 'es' };
  const languageName = () => window.LittleLabelSettings?.languages?.[settings().language] || 'Second language';
  const isOpen = () => $('typeLabelOverlay') && !$('typeLabelOverlay').classList.contains('tl-hidden');
  function setBusy(value) {
    busy = value;
    if ($('tlNext')) { $('tlNext').disabled = value; $('tlNext').textContent = value ? 'Preparing review…' : 'Review Label →'; }
  }
  function invalidate() { clearTimeout(timer); sequence++; navigation++; setBusy(false); }
  function reset() {
    invalidate(); owner = currentUser?.id || null;
    for (const id of ['tlEnglish', 'tlSecond']) if ($(id)) $(id).value = '';
    if ($('tlStatus')) $('tlStatus').textContent = '';
  }
  function render() {
    if ($('tlSecondWrap')) $('tlSecondWrap').style.display = settings().language === 'none' ? 'none' : '';
    if ($('tlSecondLabel')) $('tlSecondLabel').textContent = languageName();
  }
  function open() {
    invalidate();
    if (owner !== (currentUser?.id || null)) reset();
    $('typeLabelOverlay').classList.remove('tl-hidden');
    render(); $('tlEnglish').focus();
  }
  function close() { invalidate(); $('typeLabelOverlay').classList.add('tl-hidden'); }
  async function translate(english, language, name) {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await littleLabelsAIFetch(TRANSLATE, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ english, target_language: language, targetLanguage: name, language }),
        signal: controller.signal
      });
      let data = {}; try { data = await response.json(); } catch {}
      if (!response.ok) throw Error(data.error || 'Translation failed');
      return data.translation || data.translated || data.text || (language === 'es' ? data.spanish : '') || '';
    } finally { clearTimeout(timeout); }
  }
  async function runTranslation(english) {
    const mine = ++sequence, language = settings().language, name = languageName(), startedOwner = owner, screen = workflowNavigationVersion;
    if (!english || language === 'none') return '';
    $('tlStatus').textContent = `Translating to ${name}…`;
    const current = () => mine === sequence && screen === workflowNavigationVersion && startedOwner === (currentUser?.id || null)
      && owner === startedOwner && settings().language === language && $('tlEnglish').value.trim() === english && isOpen();
    try {
      const result = await translate(english, language, name);
      if (!current()) return '';
      $('tlSecond').value = result;
      $('tlStatus').textContent = result ? `✓ ${name} updated. Review the wording below.` : `Add the ${name} wording below.`;
      return result;
    } catch (error) {
      if (current()) $('tlStatus').textContent = error?.name === 'AbortError'
        ? `${name} is taking longer than expected. You can type it below.`
        : `${name} could not update automatically. You can type it below.`;
      console.error(error); return '';
    }
  }
  function schedule() {
    invalidate();
    const english = $('tlEnglish').value.trim();
    $('tlSecond').value = ''; $('tlStatus').textContent = '';
    if (english && settings().language !== 'none') timer = setTimeout(() => runTranslation(english), 750);
  }
  async function next() {
    if (busy) return;
    clearTimeout(timer);
    const english = $('tlEnglish').value.trim();
    if (!english) { $('tlStatus').textContent = 'Type the label wording first.'; $('tlEnglish').focus(); return; }
    const nav = navigation, screen = workflowNavigationVersion, startedOwner = owner, language = settings().language;
    setBusy(true);
    try {
      if (language !== 'none' && !$('tlSecond').value.trim()) await runTranslation(english);
      if (nav !== navigation || screen !== workflowNavigationVersion || !isOpen() || startedOwner !== (currentUser?.id || null)
        || language !== settings().language || english !== $('tlEnglish').value.trim()) return;
      const translated = language === 'none' ? '' : $('tlSecond').value.trim();
      if (language !== 'none' && !translated) {
        $('tlStatus').textContent = `Add the ${languageName()} wording below, or choose English Only in Settings.`;
        $('tlSecond').focus(); return;
      }
      const blankPhoto = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="100%" height="100%" fill="white"/></svg>');
      beginSingleDraft(JSON.stringify(['typed',english,translated]));
      currentCreationSource = 'typed';
      photoDataUrl = blankPhoto; activePhotoDataUrl = blankPhoto; cleanedPhotoDataUrl = ''; rawRemovedPhotoDataUrl = '';
      identification = { english, spanish: translated, category: 'typed label', confidence: 'high', notes: '' };
      $('englishInput').value = english; $('spanishInput').value = translated;
      syncLabel(); close(); show('preview');
    } finally { if (nav === navigation) setBusy(false); }
  }
  function returnToInput() {
    if (owner !== (currentUser?.id || null)) { reset(); return; }
    $('tlEnglish').value = $('englishInput').value;
    $('tlSecond').value = $('spanishInput').value;
    $('tlStatus').textContent = 'Your unfinished wording is still here.';
    open();
  }
  function install() {
    const grid = document.querySelector('#home .home-create-grid');
    if (!grid) return;
    if (!$('homeTypeBtn')) {
      const button = document.createElement('button'); button.id = 'homeTypeBtn'; button.className = 'home-action';
      button.innerHTML = '<span class="home-icon">Aa</span><strong>Type a Label</strong><small>Type words, then review your label.</small>';
      button.onclick = open;
      const names = [...grid.querySelectorAll('.home-action')].find(x => x.textContent.includes('Name Labels'));
      grid.insertBefore(button, names || null);
    }
    const overlay = document.createElement('div'); overlay.id = 'typeLabelOverlay'; overlay.className = 'tl-hidden';
    overlay.innerHTML = `<div class="tl-app"><button id="tlBack">← Home</button><div class="tl-card"><div class="tl-kicker">1 · Create</div><h2>Type a Label ♡</h2><p>Type your words, then review the label before saving.</p><label for="tlEnglish">English wording</label><input id="tlEnglish"><div id="tlSecondWrap"><label id="tlSecondLabel" for="tlSecond">Second language</label><input id="tlSecond"></div><div id="tlStatus" role="status" aria-live="polite"></div><button id="tlNext">Review Label →</button><p class="tiny">Unfinished wording stays here while you use the app. Save it before closing or reloading.</p></div></div>`;
    document.body.append(overlay);
    $('tlBack').onclick = () => { close(); show('home'); };
    $('tlNext').onclick = next;
    $('tlEnglish').addEventListener('input', schedule);
    $('tlSecond').addEventListener('input', () => {
      invalidate(); $('tlStatus').textContent = $('tlSecond').value.trim() ? `${languageName()} wording ready.` : '';
    });
    addEventListener('little-label-settings-changed', () => { render(); if (isOpen()) schedule(); else invalidate(); });
    render();
  }
  document.addEventListener('little-label-account-changed', () => { reset(); if ($('typeLabelOverlay')) close(); });
  window.LittleLabelsTypedLabel = { returnToInput, reset };
const css=document.createElement('style');css.textContent=`#typeLabelOverlay{position:fixed;inset:0;z-index:12500;overflow:auto;background:#FCF8F0;color:#17375E}.tl-hidden{display:none!important}.tl-app{max-width:560px;margin:auto;padding:18px 16px 44px}.tl-app>button{width:auto!important;padding:9px 14px!important;border-radius:999px!important;background:#EEF7FD!important;color:#17375E!important;border:1px solid #D5E5F1!important}.tl-card{margin-top:14px;background:#FFFDF9;border:1px solid #DDE6EC;border-radius:23px;padding:20px;box-shadow:0 7px 22px rgba(23,55,94,.05)}.tl-card h2{font-family:Georgia,serif;font-size:1.7rem;font-weight:500;margin:6px 0 8px}.tl-card p{color:#61758A}.tl-kicker{display:inline-block;background:#EEF7FD;padding:6px 10px;border-radius:999px;font-size:.8rem}.tl-card label{display:block;font-weight:700;margin:16px 0 6px}.tl-card input{width:100%;padding:14px;border:1px solid #CBD9E4;border-radius:14px;background:#fff;font-size:1rem;color:#17375E}.tl-card #tlNext{margin-top:18px;background:#BEDBF0!important;color:#17375E!important}.tl-card #tlStatus{min-height:20px;margin-top:10px;color:#61758A;font-size:.86rem;line-height:1.35}`;document.head.append(css);document.readyState==='loading'?document.addEventListener('DOMContentLoaded',install,{once:true}):install()})();
