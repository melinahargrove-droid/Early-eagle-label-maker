// Local integration candidate only. No production credit endpoint is connected.
// This slice accepts an explicitly injected synthetic transport; it never falls
// back to the existing, unmetered AI endpoints. Server enforcement is a release gate.
(() => {
  'use strict';
  const LANGUAGES = ['es','fr','ar','zh','vi','de','it','pt','ko','ja','ht'];
  const COST = 1, PREFIX = 'little-labels-pending-translation-v1:';
  const pending = new Map(), wallet = new Map(), walletGeneration = new Map(), busy = new Map(), bindings = new Set();
  const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  const transport = () => {
    const value = window.LittleLabelsCreditTestTransport;
    return value?.kind === 'synthetic-test' && ['balance','quote','execute','status'].every(key => typeof value[key] === 'function') ? value : null;
  };
  function bounded(promise, milliseconds = 15000) {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('AI status took too long.')), milliseconds); })]).finally(() => clearTimeout(timer));
  }
  function notify() { bindings.forEach(binding => binding.render()); }
  function owner() {
    return typeof currentUser !== 'undefined' && userIsPermanent(currentUser) ? currentUser?.id || null : null;
  }
  function authVersion() { return `${cloudSessionRevision}:${typeof littleLabelsAIAuthRevision === 'undefined' ? 0 : littleLabelsAIAuthRevision}`; }
  function loadPending(account) {
    if (!account) return null;
    if (pending.has(account)) return pending.get(account);
    let raw; try { raw = sessionStorage.getItem(PREFIX + account); } catch { throw Error('AI recovery storage is unavailable. You can keep creating manually.'); }
    if (!raw) return null;
    let record; try { record = JSON.parse(raw); } catch { throw Error('Previous AI status could not be read. Keep typing manually until it is recovered.'); }
    if (!uuid(record.operationId) || record.accountId !== account) throw Error('Previous AI status could not be verified. Keep typing manually.');
    const restored = { ...record, recovered: true, origin: null, note: 'A previous translation needs checking. No new AI will be started.' };
    pending.set(account, restored); return restored;
  }
  function savePending(operation) {
    const record = JSON.stringify({ accountId: operation.accountId, operationId: operation.operationId });
    try { sessionStorage.setItem(PREFIX + operation.accountId, record);
      if (sessionStorage.getItem(PREFIX + operation.accountId) !== record) throw Error('Storage did not retain the operation.');
    } catch { throw Error('AI did not start because recovery storage is unavailable. You can still type manually.'); }
    pending.set(operation.accountId, operation);
  }
  function clearPending(operation) {
    // A terminal status is safe to forget. If storage fails, retaining its pointer
    // is safe: rechecking a terminal operation must never dispatch it again.
    try {
      const raw = sessionStorage.getItem(PREFIX + operation.accountId);
      if (raw && JSON.parse(raw).operationId === operation.operationId) sessionStorage.removeItem(PREFIX + operation.accountId);
    } catch { /* Retain the recoverable server operation; never regenerate it. */ }
    if (pending.get(operation.accountId) === operation) pending.delete(operation.accountId);
  }
  function readWallet(value, account) {
    if (value?.accountId !== account || !Number.isSafeInteger(value.available_credits) || value.available_credits < 0
      || !Number.isSafeInteger(value.reserved_credits) || value.reserved_credits < 0) throw Error('Credit balance could not be verified.');
    wallet.set(account, { available: value.available_credits, held: value.reserved_credits });
    walletGeneration.set(account, (walletGeneration.get(account) || 0) + 1);
  }
  function verifyQuote(value, account, input) {
    if (value?.accountId !== account || value.action !== 'translation' || value.units !== 1 || value.credits !== COST
      || value.language !== input.language || value.english !== input.english
      || typeof value.catalogVersion !== 'string' || !value.catalogVersion) throw Error('The translation quote changed or could not be verified. No AI was started.');
    readWallet(value, account); return value;
  }
  function resultText(value, operation) {
    const result = value.result;
    if (value.action !== 'translation' || value.units !== 1 || value.credits !== COST || !result
      || typeof result.english !== 'string' || typeof result.language !== 'string'
      || typeof result.translation !== 'string' || !result.translation.trim() || result.translation.length > 640) return null;
    if (operation.input && (result.english !== operation.input.english || result.language !== operation.input.language)) return null;
    if (!LANGUAGES.includes(result.language)) return null;
    return result.translation.trim();
  }
  function accept(value, operation, binding, identity) {
    if (value?.accountId !== operation.accountId || value.operationId !== operation.operationId) throw Error('The AI response could not be matched to this account and action.');
    readWallet(value, operation.accountId);
    if (value.state === 'settled') {
      const text = resultText(value, operation);
      if (!text) throw Error('The translation result could not be verified. Its status needs checking before another AI attempt.');
      const applied = operation.origin?.current() === true;
      if (applied) operation.origin.apply(text);
      if (applied) clearPending(operation);
      else { operation.ready = { ...value.result, translation: text }; operation.note = `Translation ready · 1 credit used. Your current wording was kept. Recovered translation: ${text}`; }
      if (binding.sameIdentity(identity)) binding.message(applied
        ? 'Translation ready · 1 credit used. Check the wording before saving.'
        : `Translation ready · 1 credit used. Your current wording was kept. Recovered translation: ${text}`);
    } else if (value.state === 'refunded') {
      if (value.credits !== 0) throw Error('The returned-credit status could not be verified.');
      clearPending(operation);
      if (binding.sameIdentity(identity)) binding.message('No usable translation was produced. Your credit was returned. You can type manually or choose AI again.');
    } else if (['reserved','in_flight','uncertain'].includes(value.state)) {
      operation.note = 'This translation is still being checked. Its credit is held; checking it will not start or charge another AI action.';
      if (binding.sameIdentity(identity)) binding.message(operation.note);
    } else throw Error('The AI outcome is not confirmed. Check this same action before trying again.');
    notify();
  }
  function attach({ host, read, apply }) {
    let revision = 0, notice = '', balanceRequest = 0, destroyed = false;
    host.innerHTML = '<button type="button" class="ll-ai-translate">AI Translate · Uses 1 Credit</button><p class="ll-ai-balance"></p><p class="ll-ai-note" role="status" aria-live="polite"></p><button type="button" class="ll-ai-use" hidden>Use Recovered Translation</button><button type="button" class="ll-ai-dismiss" hidden>Keep My Wording</button>';
    const use = host.querySelector('.ll-ai-use'), dismiss = host.querySelector('.ll-ai-dismiss');
    const button = host.querySelector('button'), balance = host.querySelector('.ll-ai-balance'), status = host.querySelector('.ll-ai-note');
    function state() { return { ...read(), accountId: owner(), auth: authVersion(), revision }; }
    function identity() { return { accountId: owner(), auth: authVersion() }; }
    function sameIdentity(value) { return !destroyed && owner() === value.accountId && authVersion() === value.auth; }
    function current(snapshot) {
      const now = state();
      return !destroyed && now.visible && !now.blocked && now.accountId === snapshot.accountId && now.auth === snapshot.auth
        && now.revision === snapshot.revision && now.draft === snapshot.draft && now.save === snapshot.save && now.navigation === snapshot.navigation
        && now.english === snapshot.english && now.second === snapshot.second && now.language === snapshot.language;
    }
    function message(text) { notice = text; status.textContent = text; }
    function render() {
      if (destroyed) return;
      const now = state(), api = transport(), account = now.accountId;
      let operation = null, recoveryError = '';
      try { operation = loadPending(account); } catch (error) { recoveryError = error.message; }
      const credits = wallet.get(account);
      use.hidden = dismiss.hidden = !operation?.ready;
      use.disabled = !!now.blocked || !now.visible || operation?.ready?.english !== now.english.trim() || operation?.ready?.language !== now.language;
      button.hidden = !!operation?.ready;
      balance.textContent = credits ? `Test balance: ${credits.available} available · ${credits.held} held` : 'Credit balance has not been checked.';
      host.hidden = now.language === 'none' && !operation;
      button.textContent = busy.has(account) ? 'Checking AI action…' : operation ? 'Check AI Translation · No New Charge' : 'AI Translate · Uses 1 Credit';
      button.disabled = !!recoveryError || !api || !account || !!now.blocked || busy.has(account)
        || (!operation && (!now.english.trim() || now.language === 'none' || credits?.available === 0));
      if (recoveryError) status.textContent = recoveryError;
      else if (!api) status.textContent = 'AI credits are not connected in this local test build. You can always type your second-language wording yourself.';
      else if (!account) status.textContent = 'Sign in to use AI credits. Manual wording does not use credits.';
      else if (now.blocked) status.textContent = 'Your save is finishing. Manual wording is preserved; AI can wait.';
      else if (operation) status.textContent = operation.note || 'A translation is pending. Check this action instead of starting another.';
      else if (credits?.available === 0) status.textContent = 'You have 0 AI credits. Keep creating manually for free; translation uses 1 credit when you choose it.';
      else status.textContent = notice || 'Optional AI · 1 label, 1 selected language. You can type the wording yourself at no credit cost.';
    }
    async function refresh() {
      render(); const api = transport(), id = identity(), request = ++balanceRequest, generation = walletGeneration.get(id.accountId) || 0;
      if (!api || !id.accountId) return;
      try {
        const value = await bounded(api.balance({ ownerAccountId: id.accountId }));
        if (!sameIdentity(id) || request !== balanceRequest || generation !== (walletGeneration.get(id.accountId) || 0)) return;
        readWallet(value, id.accountId); render();
      } catch { if (sameIdentity(id) && request === balanceRequest) { message('Credit balance is unavailable. You can keep typing manually.'); render(); } }
    }
    async function run() {
      const api = transport(), snapshot = state(), id = identity(), account = id.accountId;
      if (!api || !account || snapshot.blocked || !snapshot.visible || busy.has(account)) return;
      let operation;
      try { operation = loadPending(account); } catch (error) { message(error.message); render(); return; }
      if (!operation && (!snapshot.english.trim() || snapshot.language === 'none')) return;
      let dispatchStarted = !!operation;
      const claim = {}; busy.set(account, claim); notify();
      try {
        if (operation?.ready) { render(); return; }
        if (operation) {
          const value = await bounded(api.status({ ownerAccountId: account, operationId: operation.operationId }));
          if (!sameIdentity(id)) return;
          accept(value, operation, binding, id); return;
        }
        const input = { english: snapshot.english.trim(), language: snapshot.language };
        if (!LANGUAGES.includes(input.language)) { message('Choose a supported second language before using AI. You can still type manually.'); return; }
        if (input.english.length > 160) { message('For AI translation, use 160 characters or fewer. Longer manual wording is still available.'); return; }
        const quote = verifyQuote(await bounded(api.quote({ ownerAccountId: account, action: 'translation', labels: [input.english], language: input.language })), account, input);
        if (!current(snapshot)) return; // The user only consented to the original draft.
        if (quote.available_credits < COST) { message('You have no available AI credits. Keep creating manually for free.'); return; }
        operation = { accountId: account, operationId: crypto.randomUUID(), input,
          origin: { current: () => current(snapshot), apply: text => { apply(text); revision++; } },
          note: 'Translation is running. Its credit is held while the result is checked.' };
        savePending(operation); notify();
        // One dispatch only. A network failure leaves the same operation recoverable.
        dispatchStarted = true;
        const value = await bounded(api.execute({ ownerAccountId: account, operationId: operation.operationId, action: 'translation', labels: [input.english], language: input.language,
          catalogVersion: quote.catalogVersion, confirmedCredits: COST, explicitAction: true }), 45000);
        if (!sameIdentity(id)) return;
        accept(value, operation, binding, id);
      } catch (error) {
        if (operation && !dispatchStarted) { clearPending(operation); operation = null; }
        if (sameIdentity(id)) {
          if (operation) operation.note = 'The AI outcome is not confirmed. Check this same action; no new AI or second charge will be started.';
          message(operation ? operation.note : (error.message || 'AI could not start. You can keep typing manually.'));
        }
      } finally { if (busy.get(account) === claim) busy.delete(account); notify(); }
    }
    const binding = { render, refresh, sameIdentity, message, changed() { revision++; notice = ''; render(); },
      destroy() { destroyed = true; revision++; balanceRequest++; bindings.delete(binding); } };
    use.addEventListener('click', () => {
      const now = state(); let operation; try { operation = loadPending(now.accountId); } catch { return; }
      if (!operation?.ready || now.blocked || !now.visible || now.english.trim() !== operation.ready.english || now.language !== operation.ready.language) return;
      apply(operation.ready.translation); revision++; clearPending(operation); message('Recovered translation added. No new AI action or charge.'); notify();
    });
    dismiss.addEventListener('click', () => {
      const now = state(); let operation; try { operation = loadPending(now.accountId); } catch { return; }
      if (!operation?.ready || !now.visible) return;
      clearPending(operation); message('Your wording was kept. The completed AI action will not run or charge again.'); notify();
    });
    button.addEventListener('click', run); bindings.add(binding); render();
    return binding;
  }
  document.addEventListener('little-label-auth-updated', notify);
  document.addEventListener('little-label-account-changed', () => { wallet.clear(); notify(); });
  const style = document.createElement('style');
  style.textContent = '.ll-ai-translate{margin-top:10px!important;background:#EEF7FD!important;color:#17375E!important}.ll-ai-translate:disabled{opacity:.7;cursor:not-allowed}.ll-ai-balance,.ll-ai-note{font-size:.82rem!important;line-height:1.45!important;margin:8px 0!important;color:#61758A!important}';
  document.head.append(style);
  window.LittleLabelsTranslationCredits = Object.freeze({ attach });
})();
