// Shared keyboard/focus behavior for the existing full-screen cards.
(() => {
  const stack = [], background = new Map();
  let suspended = false, refreshing = false;
  const hidden = '.hidden,.lla-hidden,.tl-hidden,.mli-hidden,.lls-hidden,.llh-hidden,.hide,[hidden]';
  function visible(el) {
    if (!el?.isConnected || el.closest(hidden)) return false;
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      const css = getComputedStyle(node);
      if (css.display === 'none' || css.visibility === 'hidden') return false;
    }
    return true;
  }
  function externalDialog() {
    return ['llAccessGate', 'llFeatureInfo'].some(id => visible(document.getElementById(id)));
  }
  const top = () => stack.at(-1);
  function focusables(el) {
    return [...el.querySelectorAll('button,input,textarea,select,a[href],summary,[tabindex]')]
      .filter(item => !item.disabled && item.tabIndex >= 0 && visible(item) && !item.closest('[inert]'));
  }
  function focusDialog(entry = top()) {
    if (!entry || suspended || externalDialog()) return;
    const requested = typeof entry.initialFocus === 'function' ? entry.initialFocus() : entry.initialFocus;
    const target = visible(requested) && !requested.disabled ? requested : focusables(entry.element)[0] || entry.element;
    target.focus({ preventScroll: true });
  }
  function unlock() {
    for (const [el, state] of background) {
      el.inert = state.inert;
      if (state.aria === null) el.removeAttribute('aria-hidden'); else el.setAttribute('aria-hidden', state.aria);
    }
    background.clear();
  }
  function lock() {
    const active = top()?.element;
    if (!active || suspended || externalDialog()) return;
    function visit(parent) {
      for (const el of parent.children) {
        if (el === active || ['SCRIPT', 'STYLE', 'LINK'].includes(el.tagName) || ['llAccessGate','llFeatureInfo'].includes(el.id)) continue;
        if (el.contains(active)) { visit(el); continue; }
        if (!background.has(el)) background.set(el, { inert: el.inert, aria: el.getAttribute('aria-hidden') });
        el.inert = true; el.setAttribute('aria-hidden', 'true');
      }
    }
    visit(document.body);
  }
  function focusAfterHidden(entry) {
    if (!entry || suspended || externalDialog() || (visible(document.activeElement) && !entry.element.contains(document.activeElement))) return;
    const target = visible(entry.returnFocus) && !entry.returnFocus.disabled ? entry.returnFocus :
      [...document.querySelectorAll('section:not(.hidden)')].flatMap(focusables)[0];
    target?.focus({ preventScroll:true });
  }
  function refresh() {
    if (refreshing || suspended || externalDialog()) return;
    refreshing = true;
    const previous = top();
    for (let i = stack.length - 1; i >= 0; i--) if (!visible(stack[i].element)) stack.splice(i, 1);
    if (previous !== top()) { unlock(); lock(); if (top()) focusDialog(); else focusAfterHidden(previous); }
    else lock();
    refreshing = false;
  }
  function open(element, options = {}) {
    const previous = stack.findIndex(entry => entry.element === element);
    if (previous >= 0) stack.splice(previous, 1);
    unlock();
    element.setAttribute('role', element.getAttribute('role') || 'dialog');
    element.setAttribute('aria-modal', 'true'); element.setAttribute('tabindex', '-1');
    if (!element.hasAttribute('aria-label') && !element.hasAttribute('aria-labelledby')) {
      const title = element.querySelector('h1,h2,h3');
      if (title) { title.id ||= element.id + 'Title'; element.setAttribute('aria-labelledby', title.id); }
    }
    stack.push({ element, ...options, returnFocus: options.returnFocus || document.activeElement });
    lock(); focusDialog();
  }
  function close(element, { restoreFocus = true } = {}) {
    const index = stack.findIndex(entry => entry.element === element);
    if (index < 0) return;
    const wasTop = index === stack.length - 1, entry = stack[index];
    stack.splice(index); unlock(); lock();
    if (!wasTop || suspended || externalDialog()) return;
    if (restoreFocus && visible(entry.returnFocus) && !entry.returnFocus.disabled && (!top() || top().element.contains(entry.returnFocus))) entry.returnFocus.focus({ preventScroll: true });
    else if (top()) focusDialog();
  }
  document.addEventListener('keydown', event => {
    const entry = top(); if (!entry || suspended || externalDialog()) return;
    if (event.key === 'Escape' && entry.onClose) { event.preventDefault(); event.stopImmediatePropagation(); entry.onClose(); return; }
    if (event.key !== 'Tab') return;
    const items = focusables(entry.element), first = items[0], last = items.at(-1);
    if (!first) { event.preventDefault(); entry.element.focus(); }
    else if (event.shiftKey && (document.activeElement === first || !items.includes(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !items.includes(document.activeElement))) { event.preventDefault(); first.focus(); }
  }, true);
  document.addEventListener('focusin', event => {
    const entry = top(); if (entry && !suspended && !externalDialog() && !entry.element.contains(event.target)) focusDialog();
  }, true);
  document.addEventListener('little-label-account-changed', () => { const previous = top(); stack.length = 0; unlock(); queueMicrotask(() => focusAfterHidden(previous)); });
  function observe() { new MutationObserver(refresh).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class','hidden'] }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observe, { once: true }); else observe();
  window.LittleLabelsDialog = { open, close, suspend() { suspended = true; unlock(); }, resume() { suspended = false; refresh(); if (top()) focusDialog(); } };
})();

(() => {
  const KEY = 'littleLabelsWelcomeSeenV1';
  const $ = id => document.getElementById(id);
  function closeHelp() { const o = $('llHelp'); o.classList.add('llh-hidden'); window.LittleLabelsDialog.close(o); }
  function help() {
    let o = $('llHelp'); if (o) return o;
    o = document.createElement('div'); o.id = 'llHelp'; o.className = 'llh-hidden';
    o.innerHTML = `<div class="llh-app"><button id="llhBack">← Back</button><div class="llh-card"><div class="llh-kicker">Little Labels</div><h2>How It Works ♡</h2><p class="llh-lead">A quick guide for making classroom labels on your phone, tablet, or computer.</p><div class="llh-phone"><div class="llh-phoneicon" aria-hidden="true">▣</div><div><strong>Keep Little Labels close ♡</strong><span>Use it in your browser, or add it to your Home Screen for quick access where supported.</span></div></div><details class="llh-install"><summary>iPhone / iPad instructions</summary><div><b>1.</b> Open Little Labels in <strong>Safari</strong>.<br><b>2.</b> Tap <strong>Share</strong> (you may first tap the ••• More button).<br><b>3.</b> Choose <strong>Add to Home Screen</strong>.<br><b>4.</b> If offered, leave <strong>Open as Web App</strong> turned on.<br><b>5.</b> Tap <strong>Add</strong>.</div></details><details class="llh-install"><summary>Android instructions</summary><div><b>1.</b> Open Little Labels in <strong>Chrome</strong>.<br><b>2.</b> Open the Chrome menu (⋮).<br><b>3.</b> Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.<br><b>4.</b> Confirm <strong>Install</strong> / <strong>Add</strong>.<br><span class="llh-small">The exact wording can vary by device and browser version.</span></div></details><details class="llh-install"><summary>Computer instructions</summary><div>Open Little Labels in your browser and bookmark it for easy access. If your browser offers an install option, you can use that too. Sign into the same account you use on your other devices.</div></details><details class="llh-install"><summary>Activation and account help</summary><div>First create or sign into your Little Labels account. Enter the activation code from your purchase’s <strong>Start Here guide</strong> once. Use that same account on every device. If a code has already been used, sign into the account you activated. Check your purchase materials if you need help finding the code.</div></details><div class="llh-step"><b>1</b><div><strong>Create</strong><span>Choose a photo, type a label, make a list, use a product link, or create student name labels.</span></div></div><div class="llh-step"><b>2</b><div><strong>Review</strong><span>Check the wording, optional second language, picture, label size, and copies before you save.</span></div></div><div class="llh-step"><b>3</b><div><strong>Save</strong><span>Keep approved labels in My Labels for reprints. Save &amp; Add to Print also puts the chosen copies in Ready to Print.</span></div></div><div class="llh-step"><b>4</b><div><strong>Print</strong><span>Create 8.5 × 11 sheets and print at 100% / Actual Size so label dimensions stay correct.</span></div></div><div class="llh-tip"><strong>Your devices work together</strong><br>Sign into the same Little Labels account on your phone, tablet, or computer to manage and print your saved labels.<br><br><strong>Good to know</strong><br>Ready to Print keeps your chosen copies until you print or remove them. In Settings, choose your second language, label sizes, and favorite label combinations.</div></div></div>`;
    document.body.append(o); $('llhBack').onclick = closeHelp; return o;
  }
  function openHelp(returnFocus) {
    const o = help(); o.classList.remove('llh-hidden');
    window.LittleLabelsDialog.open(o, { onClose: closeHelp, initialFocus: $('llhBack'), returnFocus }); window.scrollTo(0,0);
  }
  function welcome() {
    if (localStorage.getItem(KEY) || $('llWelcome') || !window.LittleLabelsAccess?.isActive()) return;
    if (!$('home') || $('home').classList.contains('hidden')) return;
    const o = document.createElement('div'); o.id = 'llWelcome';
    o.innerHTML = `<div class="llw-card"><div class="llw-heart" aria-hidden="true">♡</div><h2>Welcome to Little Labels</h2><p>Create classroom labels your way, save the ones you love, and print them when you're ready.</p><div class="llw-flow"><span>Create</span><i>→</i><span>Review</span><i>→</i><span>Save</span><i>→</i><span>Print</span></div><button id="llwPhone">Keep Little Labels Handy</button><button id="llwStart">Start Creating</button><button id="llwLearn">See How It Works</button></div>`;
    document.body.append(o);
    const done = () => { localStorage.setItem(KEY, '1'); o.remove(); window.LittleLabelsDialog.close(o); };
    $('llwStart').onclick = done;
    $('llwLearn').onclick = () => { done(); openHelp($('homeGalleryBtn')); };
    $('llwPhone').onclick = () => { done(); openHelp($('homeGalleryBtn')); $('llHelp').querySelector('.llh-install')?.scrollIntoView({ behavior:'smooth', block:'center' }); };
    window.LittleLabelsDialog.open(o, { onClose: done, initialFocus: $('llwStart'), returnFocus: $('homeGalleryBtn') });
  }
  function install() {
    help();
    const observer = new MutationObserver(() => {
      const settings = $('llSettings'), app = settings?.querySelector('.lls');
      if (!app || $('llHelpBtn')) return;
      const button = document.createElement('button'); button.id = 'llHelpBtn'; button.className = 'primary'; button.textContent = '♡ Help & How It Works'; button.style.marginTop = '4px'; button.onclick = () => openHelp(button); app.append(button);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(welcome, 500);
    document.addEventListener('little-label-access-updated', () => setTimeout(welcome, 0));
    document.addEventListener('little-label-account-changed', () => { $('llWelcome')?.remove(); $('llHelp')?.classList.add('llh-hidden'); });
  }
  const s = document.createElement('style');
  s.textContent = "#llWelcome{position:fixed;inset:0;z-index:20000;background:rgba(23,55,94,.28);display:flex;align-items:center;justify-content:center;padding:22px}.llw-card{max-width:420px;width:100%;background:#FFFDF9;border:1px solid #DDE6EC;border-radius:28px;padding:24px;text-align:center;box-shadow:0 18px 55px rgba(23,55,94,.18);color:#17375E}.llw-heart{width:58px;height:58px;border-radius:50%;background:#EEF7FD;margin:0 auto 10px;display:flex;align-items:center;justify-content:center;font-size:2rem}.llw-card h2{font:500 1.8rem Georgia,serif;margin:5px 0 8px}.llw-card p{color:#61758A;line-height:1.45}.llw-flow{display:flex;justify-content:center;align-items:center;gap:7px;margin:18px 0;color:#61758A;font-size:.82rem}.llw-flow span{background:#EEF7FD;padding:7px 9px;border-radius:999px}.llw-flow i{font-style:normal}.llw-card button{margin-top:8px}.llw-card #llwPhone{background:#F8F1DF;color:#17375E;border:1px solid #E9DDBD}.llw-card #llwStart{background:#BEDBF0;color:#17375E}.llw-card #llwLearn{background:#fff;color:#17375E;border:1px solid #DDE6EC}#llHelp{position:fixed;inset:0;z-index:19000;overflow:auto;background:#FCF8F0;color:#17375E}.llh-hidden{display:none!important}.llh-app{max-width:560px;margin:auto;padding:18px 16px 44px}.llh-app>button{width:auto!important;padding:9px 14px!important;border-radius:999px!important;background:#EEF7FD!important;color:#17375E!important;border:1px solid #D5E5F1!important}.llh-card{margin-top:14px;background:#FFFDF9;border:1px solid #DDE6EC;border-radius:23px;padding:18px}.llh-kicker{display:inline-block;background:#EEF7FD;padding:6px 10px;border-radius:999px;font-size:.78rem}.llh-card h2{font:500 1.75rem Georgia,serif;margin:7px 0}.llh-lead{color:#61758A;line-height:1.45}.llh-phone{display:grid;grid-template-columns:48px 1fr;gap:12px;align-items:center;background:#F8F1DF;border:1px solid #E9DDBD;border-radius:17px;padding:13px;margin:16px 0 9px}.llh-phoneicon{width:46px;height:46px;border-radius:13px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:1.35rem}.llh-phone strong,.llh-phone span{display:block}.llh-phone span{font-size:.85rem;color:#6D6045;line-height:1.4;margin-top:3px}.llh-install{border:1px solid #DDE6EC;border-radius:14px;margin:8px 0;background:#fff;overflow:hidden}.llh-install summary{padding:12px 13px;font-weight:800;cursor:pointer}.llh-install>div{padding:0 13px 13px;color:#61758A;font-size:.87rem;line-height:1.7}.llh-small{font-size:.78rem}.llh-step{display:grid;grid-template-columns:36px 1fr;gap:11px;padding:13px 0;border-bottom:1px solid #EDF1F4}.llh-step>b{width:34px;height:34px;border-radius:50%;background:#EEF7FD;display:flex;align-items:center;justify-content:center;color:#6B94B4}.llh-step strong,.llh-step span{display:block}.llh-step span{color:#61758A;font-size:.88rem;line-height:1.4;margin-top:3px}.llh-tip{margin-top:16px;padding:13px;border-radius:15px;background:#EEF7FD;color:#61758A;font-size:.86rem;line-height:1.45}" + '.llw-flow{flex-wrap:wrap}#llHelp :focus-visible,#llWelcome :focus-visible{outline:3px solid #17375E;outline-offset:4px}';
  document.head.append(s);
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', install, { once:true }) : install();
})();
