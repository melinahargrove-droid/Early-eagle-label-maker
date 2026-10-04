(() => {
  const cfg = () => window.LittleLabelSettings?.get?.() || { language: 'es' };
  const names = () => window.LittleLabelSettings?.languages || { es: 'Spanish', none: 'English Only' };
  let request = 0;
  function current() { const id = cfg().language || 'es'; return { id, name: names()[id] || id }; }
  function invalidate() { request++; clearTimeout(translationTimer); }
  function applyUI() {
    const language = current(), label = document.querySelector('label[for="spanishInput"]');
    const input = document.getElementById('spanishInput'), status = document.getElementById('translationStatus');
    if (label) label.textContent = language.id === 'none' ? 'Second language' : language.name;
    if (input) {
      const hide = language.id === 'none'; input.style.display = hide ? 'none' : '';
      if (label) label.style.display = hide ? 'none' : '';
      if (hide) input.value = '';
    }
    const translated = document.getElementById('labelSpanish');
    if (translated) translated.style.display = language.id === 'none' ? 'none' : '';
    if (status && language.id === 'none') status.textContent = 'English-only labels are on.';
    document.querySelectorAll('.sheet-page-es,.print-label-es').forEach(x => x.style.display = language.id === 'none' ? 'none' : '');
  }
  async function translate() {
    const language = current(), english = document.getElementById('englishInput')?.value.trim();
    const input = document.getElementById('spanishInput'), status = document.getElementById('translationStatus');
    const version = ++request, owner = currentUser?.id || null, navigation = workflowNavigationVersion;
    if (!english || !input) return;
    if (language.id === 'none') {
      input.value = ''; syncLabel?.(); if (status) status.textContent = 'English-only labels are on.'; return;
    }
    const stillCurrent = () => version === request && owner === (currentUser?.id || null)
      && navigation === workflowNavigationVersion && language.id === current().id
      && english === document.getElementById('englishInput')?.value.trim();
    if (status) status.textContent = `Translating ${language.name}…`;
    try {
      const response = await littleLabelsAIFetch(TRANSLATE_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ english, target_language: language.id, targetLanguage: language.name, language: language.id })
      });
      let data = {}; try { data = await response.json(); } catch {}
      const value = data.translation || data.translated || data.text || (language.id === 'es' ? data.spanish : null);
      if (!response.ok || !value) throw Error(data.error || data.details || `Request failed (${response.status})`);
      if (!stillCurrent()) return;
      input.value = value; lastAutoTranslatedEnglish = english; syncLabel?.();
      if (status) status.textContent = `✓ ${language.name} updated automatically`;
    } catch (error) {
      console.error(error);
      if (stillCurrent() && status) status.textContent = `${language.name} could not update automatically. You can still edit it manually.`;
    }
  }
  function patch() {
    autoTranslateEnglish = translate;
    scheduleAutoTranslation = function () {
      invalidate();
      const language = current(), status = document.getElementById('translationStatus');
      if (language.id === 'none') { if (status) status.textContent = 'English-only labels are on.'; return; }
      if (status) status.textContent = 'Waiting for you to finish typing…';
      const version = request, navigation = workflowNavigationVersion;
      translationTimer = setTimeout(() => {
        if (version === request && navigation === workflowNavigationVersion) translate();
      }, 900);
    };
    const originalSync = window.syncLabel;
    syncLabel = function () {
      if (typeof originalSync === 'function') originalSync();
      const language = current(), translated = document.getElementById('labelSpanish');
      if (translated) {
        translated.textContent = language.id === 'none' ? '' : (document.getElementById('spanishInput')?.value || '');
        translated.style.display = language.id === 'none' ? 'none' : '';
      }
    };
    applyUI();
  }
  function install() {
    patch();
    addEventListener('little-label-settings-changed', () => { invalidate(); applyUI(); translate(); });
    document.addEventListener('little-label-account-changed', invalidate);
    document.getElementById('spanishInput')?.addEventListener('input', invalidate);
    document.getElementById('chooseSetBtn')?.addEventListener('click', applyUI);
    document.getElementById('editIdentification')?.addEventListener('click', applyUI);
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', install, { once: true }) : install();
})();
