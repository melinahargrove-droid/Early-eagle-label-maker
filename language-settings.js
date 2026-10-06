(() => {
  const cfg = () => window.LittleLabelSettings?.get?.() || { language: 'es' };
  const names = () => window.LittleLabelSettings?.languages || { es: 'Spanish', none: 'English Only' };
  let translation, priorLanguage = cfg().language, hiddenWording = null;
  function current() { const id = cfg().language || 'es'; return { id, name: names()[id] || id }; }
  function invalidate() { clearTimeout(translationTimer); translationRequestId++; translation?.changed(); }
  function applyUI() {
    const language = current(), label = document.querySelector('label[for="spanishInput"]');
    const input = document.getElementById('spanishInput'), status = document.getElementById('translationStatus');
    if (label) label.textContent = language.id === 'none' ? 'Second language' : `${language.name} wording (optional)`;
    if (input) {
      const hide = language.id === 'none';
      if (hide && priorLanguage !== 'none') hiddenWording = { draft: singleDraftContext, value: input.value };
      if (!hide && priorLanguage === 'none' && hiddenWording?.draft === singleDraftContext && !input.value) input.value = hiddenWording.value;
      input.style.display = hide ? 'none' : ''; if (label) label.style.display = hide ? 'none' : '';
      if (hide) input.value = ''; // The existing save path must not include hidden second-language text.
      if (status && priorLanguage !== language.id) status.textContent = hide ? 'English-only labels are on.' : 'Check your manual second-language wording before saving.';
    }
    priorLanguage = language.id;
    const translated = document.getElementById('labelSpanish'); if (translated) translated.style.display = language.id === 'none' ? 'none' : '';
    document.querySelectorAll('.sheet-page-es,.print-label-es').forEach(x => x.style.display = language.id === 'none' ? 'none' : '');
    translation?.changed();
  }
  function install() {
    // Neutralize the base entry points too; legacy event listeners cannot cause a charge.
    autoTranslateEnglish = function () { return; };
    scheduleAutoTranslation = invalidate;
    const originalSync = window.syncLabel;
    syncLabel = function () {
      if (typeof originalSync === 'function') originalSync();
      const language = current(), translated = document.getElementById('labelSpanish');
      if (translated) { translated.textContent = language.id === 'none' ? '' : (document.getElementById('spanishInput')?.value || ''); translated.style.display = language.id === 'none' ? 'none' : ''; }
    };
    const host = document.createElement('div'); host.id = 'singleTranslationTools';
    document.getElementById('translationStatus').before(host);
    translation = window.LittleLabelsTranslationCredits?.attach?.({ host,
      read: () => ({ english: document.getElementById('englishInput').value, second: document.getElementById('spanishInput').value,
        language: current().id, draft: singleDraftContext, save: singleSaveJob, navigation: workflowNavigationVersion,
        visible: !document.getElementById('preview').classList.contains('hidden'), blocked: !!singleSaveJob && !singleSaveJob.complete }),
      apply: text => { document.getElementById('spanishInput').value = text; syncLabel(); } });
    if (!translation) host.textContent = 'AI translation is unavailable. You can keep editing and saving manually.';
    window.LittleLabelsSingleTranslation = translation;
    applyUI();
    addEventListener('little-label-settings-changed', () => { invalidate(); applyUI(); syncLabel(); });
    document.addEventListener('little-label-account-changed', () => { hiddenWording = null; invalidate(); });
    document.getElementById('spanishInput')?.addEventListener('input', invalidate);
    document.getElementById('chooseSetBtn')?.addEventListener('click', () => { invalidate(); applyUI(); });
    document.getElementById('editIdentification')?.addEventListener('click', applyUI);
    const preview = document.getElementById('preview');
    new MutationObserver(() => { invalidate(); if (!preview.classList.contains('hidden')) { applyUI(); translation?.refresh(); } }).observe(preview, { attributes: true, attributeFilter: ['class'] });
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', install, { once: true }) : install();
})();
