(() => {
  let students = [], style = 'name', type = 'business', copies = 1, previewVersion = 0, previewIndex = 0, owner = currentUser?.id || null;
  const $ = id => document.getElementById(id), ownerNow = () => currentUser?.id || null;
  const CP = 'M42 18 Q18 18 18 42 L18 196 Q18 220 44 230 Q500 92 956 230 Q982 220 982 196 L982 42 Q982 18 958 18 Z';
  const esc = value => String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  function closeDecision(restoreFocus = true) {
    const dialog = $('nlMissingPhotos'); if (!dialog) return;
    dialog.hidden = true; window.LittleLabelsDialog?.close(dialog, { restoreFocus });
  }
  function close(restoreFocus = true) {
    closeDecision(false); const overlay = $('nameLabelsOverlay'); if (!overlay) return;
    overlay.classList.add('hide'); window.LittleLabelsDialog?.close(overlay, { restoreFocus });
  }
  function checkOwner() {
    if (owner === ownerNow()) return true;
    students = []; previewIndex = 0; owner = ownerNow(); if ($('nlNames')) $('nlNames').value = ''; renderPhotoGuidance(); close(false); return false;
  }
  function names() { return ($('nlNames')?.value || '').split(/\n+/).map(value => value.trim()).filter(Boolean); }
  function sync() {
    checkOwner(); const selected = students[previewIndex], old = new Map();
    for (const student of students) { if (!old.has(student.name)) old.set(student.name, []); old.get(student.name).push(student); }
    students = names().map(name => old.get(name)?.shift() || { name, photo: '' });
    const retained = students.indexOf(selected); previewIndex = retained >= 0 ? retained : Math.max(0, Math.min(previewIndex, students.length - 1));
    $('nlCount').textContent = `${students.length} student${students.length === 1 ? '' : 's'} · ${copies} cop${copies === 1 ? 'y' : 'ies'} each`;
    renderPhotos(); preview();
  }
  function renderPhotoGuidance() {
    const guidance = $('nlPhotoGuidance'), status = $('nlPhotoStatus'), next = $('nlNext'); if (!guidance || !status || !next) return;
    const visible = style === 'photo' && students.length > 0;
    guidance.hidden = !visible;
    if (!visible) { status.textContent = ''; next.removeAttribute('aria-describedby'); return; }
    const missing = students.filter(student => !student.photo && !student.reading).length, reading = students.filter(student => student.reading).length;
    const message = [];
    if (missing) message.push(`${missing} of ${students.length} student${students.length === 1 ? '' : 's'} ${missing === 1 ? 'is' : 'are'} missing a photo.`);
    if (reading) message.push(`${reading} photo${reading === 1 ? ' is' : 's are'} still loading. Wait for loading to finish before saving.`);
    if (!missing && !reading) message.push(students.length === 1 ? 'Photo added for this student.' : `Photos added for all ${students.length} students.`);
    const text = message.join(' '); if (status.textContent !== text) status.textContent = text;
    $('nlPhotoChoices').hidden = !missing;
    next.setAttribute('aria-describedby', 'nlPhotoStatus' + (missing ? ' nlPhotoHelp' : ''));
  }
  function focusMissingPhoto() {
    const index = students.findIndex(student => !student.photo && !student.reading);
    previewIndex = Math.max(0, index); preview(); $('nlPhotos').querySelector(`[data-i="${index}"]`)?.focus();
  }
  function renderPhotos() {
    renderPhotoGuidance();
    const container = $('nlPhotos'); if (!container) return;
    container.innerHTML = ''; if (style !== 'photo') return;
    students.forEach((student, index) => {
      const row = document.createElement('div'); row.className = 'nl-student';
      row.innerHTML = `<div class="nl-photo">${student.photo ? `<img src="${student.photo}" alt="Photo of ${esc(student.name)}">` : 'Photo'}</div><strong>${esc(student.name)}</strong><button data-i="${index}" aria-label="${student.photo ? 'Change photo' : 'Add photo'} for ${esc(student.name)}"${student.reading ? ' aria-busy="true"' : ''}>${student.reading ? 'Loading…' : student.photo ? 'Change' : 'Add Photo'}</button>`;
      row.querySelector('button').onclick = () => photo(index); container.append(row);
    });
  }
  function photo(index) {
    const target = students[index], readingOwner = owner; if (!target) return;
    const fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.capture = 'user';
    fileInput.onchange = () => {
      const file = fileInput.files?.[0]; if (!file || ownerNow() !== readingOwner || !students.includes(target)) return;
      const version = (target.readVersion || 0) + 1; target.readVersion = version; target.reading = true; renderPhotos();
      const reader = new FileReader();
      reader.onload = () => {
        if (ownerNow() !== readingOwner || !students.includes(target) || target.readVersion !== version) return;
        target.photo = reader.result; target.reading = false; previewIndex = students.indexOf(target); renderPhotos(); preview();
      };
      reader.onerror = () => {
        if (ownerNow() !== readingOwner || !students.includes(target) || target.readVersion !== version) return;
        target.reading = false; renderPhotos(); alert('This photo could not be read. Please choose it again.');
      };
      reader.onabort = reader.onerror;
      try { reader.readAsDataURL(file); } catch (_) { reader.onerror(); }
    };
    fileInput.click();
  }
  function svg(student) {
    const photo = style === 'photo' && student.photo ? `<image href="${student.photo}" x="150" y="42" width="170" height="125" preserveAspectRatio="xMidYMid slice"/>` : '';
    return `<svg viewBox="0 0 1000 260" role="img" aria-label="Label preview for ${esc(student.name)}"><path d="${CP}" fill="#fff" stroke="#8da2b3" stroke-width="3"/>${photo}<text x="${photo ? 640 : 500}" y="85" text-anchor="middle" dominant-baseline="middle" font-family="Arial" font-size="${student.name.length > 12 ? 58 : 74}" font-weight="800" fill="#17375E">${esc(student.name)}</text></svg>`;
  }
  function preview() {
    const container = $('nlPreview'), student = students[previewIndex] || { name: 'Your Student', photo: '' }, version = ++previewVersion;
    if (!container) return;
    $('nlPreviewPosition').textContent = students.length ? `${previewIndex + 1} of ${students.length} · ${student.name}` : 'Add names to preview your labels';
    $('nlPrevStudent').disabled = !students.length || previewIndex === 0; $('nlNextStudent').disabled = !students.length || previewIndex >= students.length - 1;
    if (style === 'name' && window.LittleLabelNameOnly) {
      const dimensions = window.LittleLabelSettings?.meta?.[type] || { w:3.375, h:2 };
      container.className = 'nl-preview nl-name-only'; container.innerHTML = '';
      window.LittleLabelNameOnly.render({ english:student.name }, { w:dimensions.w, h:dimensions.h, type }).then(src => {
        if (version !== previewVersion) return;
        const img = document.createElement('img'); img.src = src; img.alt = 'Name-only label preview for ' + student.name; container.replaceChildren(img);
      }).catch(() => {
        if (version !== previewVersion) return;
        const name = document.createElement('strong'); name.textContent = student.name; container.className = 'nl-preview'; container.replaceChildren(name);
      });
    } else if (type === 'cp') { container.innerHTML = svg(student); container.className = 'nl-preview cp'; }
    else { container.className = 'nl-preview'; container.innerHTML = `${style === 'photo' && student.photo ? `<img src="${student.photo}" alt="Photo of ${esc(student.name)}">` : ''}<strong>${esc(student.name)}</strong>`; }
  }
  function setStyle(value) {
    style = value;
    document.querySelectorAll('#nameLabelsOverlay [data-style]').forEach(button => { button.classList.toggle('on', button.dataset.style === value); button.setAttribute('aria-pressed', String(button.dataset.style === value)); });
    renderPhotos(); preview();
  }
  function setType(value) {
    type = value;
    document.querySelectorAll('#nameLabelsOverlay [data-type]').forEach(button => { button.classList.toggle('on', button.dataset.type === value); button.setAttribute('aria-pressed', String(button.dataset.type === value)); });
    preview();
  }
  function open() {
    const overlay = $('nameLabelsOverlay'), trigger = document.activeElement; overlay.classList.remove('hide'); sync();
    window.LittleLabelsDialog?.open(overlay, { onClose: close, initialFocus:$('nlNames'), returnFocus:trigger });
  }
  function reviewMissingPhotos() {
    if (style !== 'photo' || !students.some(student => !student.photo)) return false;
    const dialog = $('nlMissingPhotos'); if (!dialog.hidden) return true;
    const missing = students.filter(student => !student.photo).length;
    $('nlMissingMessage').textContent = `${missing} of ${students.length} student${students.length === 1 ? '' : 's'} ${missing === 1 ? 'is' : 'are'} missing a photo. Add photos, or continue with name-only labels for this whole batch. Photos you already added stay in this draft if you switch back.`;
    dialog.hidden = false; window.LittleLabelsDialog?.open(dialog, { onClose:closeDecision, initialFocus:$('nlAddMissingPhotos'), returnFocus:$('nlNext') }); return true;
  }
  window.NLStudents = () => { sync(); return students.map(student => ({ ...student })); };
  window.NLStyle = () => style; window.NLCheckOwner = checkOwner; window.NLReviewMissingPhotos = reviewMissingPhotos; window.NLClose = close;
  window.NLReset = () => { owner = ownerNow(); students = []; previewIndex = 0; if (!$('nlNames')) return; $('nlNames').value = ''; closeDecision(false); setStyle('name'); sync(); };
  document.addEventListener('little-label-account-changed', () => { window.NLReset(); close(false); });
  document.addEventListener('nl-size-change', event => setType(event.detail));
  function install() {
    const css = document.createElement('style');
    css.textContent = "#nameLabelsOverlay{position:fixed;inset:0;z-index:13000;overflow:auto;background:#FCF8F0;color:#17375E}.hide{display:none!important}.nl-app{max-width:560px;margin:auto;padding:18px 16px 44px}.nl-back{width:auto!important;padding:9px 14px!important;border-radius:999px!important;background:#EEF7FD!important;color:#17375E!important;border:1px solid #D5E5F1!important}.nl-hero{margin:14px 0 16px}.nl-kicker{display:inline-block;background:#EEF7FD;padding:6px 10px;border-radius:999px;font-size:.78rem}.nl-hero h2{font:500 1.8rem Georgia,serif;margin:7px 0}.nl-hero p{color:#61758A;margin:0}.nl-card{background:#FFFDF9;border:1px solid #DDE6EC;border-radius:20px;padding:16px;margin:12px 0}.nl-card h3{font:500 1.12rem Georgia,serif;margin:0 0 10px}.nl-card textarea{width:100%;min-height:155px;padding:12px;border:1px solid #CBD9E4;border-radius:13px;background:#fff;font:inherit}.nl-count{color:#61758A;font-size:.83rem;margin-top:7px}.nl-tabs,.nl-types{display:grid;grid-template-columns:1fr 1fr;gap:8px}.nl-tabs button,.nl-option{border:1px solid #D5E5F1!important;border-radius:14px!important;background:#fff!important;color:#17375E!important;padding:12px!important}.nl-tabs button.on,.nl-option.on{background:#EEF7FD!important;border:2px solid #8EB9D7!important}.nl-option{text-align:left}.nl-option strong,.nl-option small{display:block}.nl-option small{color:#61758A;margin-top:3px}.nl-student{display:grid;grid-template-columns:58px 1fr auto;gap:9px;align-items:center;padding:9px 0;border-top:1px solid #EDF1F4}.nl-photo{width:58px;height:58px;border-radius:12px;background:#EEF7FD;display:flex;align-items:center;justify-content:center;color:#8A9BAA;font-size:.72rem;overflow:hidden}.nl-photo img{width:100%;height:100%;object-fit:cover}.nl-student button{width:auto!important;padding:8px!important;background:#EEF7FD!important;color:#17375E!important}.nl-preview{height:150px;border:1px solid #DDE6EC;border-radius:16px;background:#fff;display:flex;align-items:center;justify-content:center;gap:12px;padding:12px}.nl-preview img{width:75px;height:75px;object-fit:cover;border-radius:12px}.nl-preview strong{font-size:2rem}.nl-preview.nl-name-only{height:auto;min-height:0;padding:0;border:0;border-radius:0;background:transparent;line-height:0}.nl-preview.nl-name-only img{display:block;width:100%;height:auto;max-height:360px;object-fit:contain;border-radius:0}.nl-preview.cp{height:190px;border:0;background:transparent}.nl-preview.cp svg{width:100%;height:100%}.nl-select{width:100%;padding:12px;border:1px solid #CBD9E4;border-radius:13px;background:#fff}.nl-next{background:#BEDBF0!important;color:#17375E!important}.nl-tip{padding:11px 12px;border-radius:14px;background:#F8F1DF;color:#6D6045;font-size:.83rem;margin:10px 0}" + '.nl-preview-nav{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px}.nl-preview-nav button{width:auto;background:#EEF7FD;color:#17375E;padding:10px}.nl-preview-nav button:disabled{opacity:.5}.nl-preview-position{font-size:.85rem;color:#61758A;text-align:center}.nl-photo-guidance[hidden],.nl-photo-choices[hidden],.nl-decision[hidden]{display:none!important}.nl-photo-guidance{margin:14px 0 10px;padding:14px;border:1px solid #D5E5F1;border-radius:14px;background:#EEF7FD;font-size:.9rem}.nl-photo-guidance p{margin:0;line-height:1.5}.nl-photo-guidance #nlPhotoStatus{font-weight:700}.nl-photo-choices p{margin-top:6px;color:#536B80}.nl-photo-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.nl-photo-actions button{width:auto!important;flex:1 1 130px;min-height:44px;padding:10px 12px!important;border:1px solid #AAC5D9!important;background:#FFFDF9!important;color:#17375E!important}.nl-decision{position:fixed;inset:0;z-index:13100;background:rgba(23,55,94,.28);display:flex;align-items:center;justify-content:center;padding:20px}.nl-decision .nl-card{max-width:430px}.nl-decision button{margin-top:10px;background:#EEF7FD;color:#17375E}#nameLabelsOverlay :focus-visible{outline:3px solid #17375E;outline-offset:4px}';
    document.head.append(css);
    const overlay = document.createElement('div'); overlay.id = 'nameLabelsOverlay'; overlay.className = 'hide';
    overlay.innerHTML = `<div class="nl-app"><button id="nlBack" class="nl-back">← Back</button><div class="nl-hero"><div class="nl-kicker">Classroom Names</div><h2>Name Labels ♡</h2><p>Create cubby, chair, basket, and classroom name labels for your whole class at once.</p></div><div class="nl-card"><h3>1. Add Student Names</h3><textarea id="nlNames" aria-label="Student names, one per line"></textarea><div id="nlCount" class="nl-count">0 students</div></div><div class="nl-card"><h3>2. Choose What Shows</h3><div class="nl-tabs"><button class="on" aria-pressed="true" data-style="name">Name Only</button><button aria-pressed="false" data-style="photo">Name + Photo</button></div><div id="nlPhotos"></div></div><div class="nl-card"><h3>3. Choose Label Size</h3><div class="nl-types"><button class="nl-option on" aria-pressed="true" data-type="business"><strong>Business Card</strong><small>3.375 × 2 in</small></button><button class="nl-option" aria-pressed="false" data-type="cp"><strong>Compact Cubby</strong><small>Community Playthings shape</small></button></div><div class="nl-tip">These are the sizes you have turned on in Settings → Available label sizes. Choose one size for this batch, then copies per student below.</div></div><div class="nl-card"><h3>4. Copies Per Student</h3><select id="nlCopies" aria-label="Copies per student" class="nl-select"><option value="1">1 copy each</option><option value="2">2 copies each</option><option value="3">3 copies each</option><option value="4">4 copies each</option><option value="5">5 copies each</option></select></div><div class="nl-card"><h3>Preview</h3><div id="nlPreview" class="nl-preview"><strong>Your Student</strong></div><div class="nl-preview-nav"><button id="nlPrevStudent" aria-label="Preview previous student">← Previous</button><div id="nlPreviewPosition" class="nl-preview-position" role="status" aria-live="polite"></div><button id="nlNextStudent" aria-label="Preview next student">Next →</button></div></div><div id="nlPhotoGuidance" class="nl-photo-guidance" hidden><p id="nlPhotoStatus" role="status" aria-live="polite" aria-atomic="true"></p><div id="nlPhotoChoices" class="nl-photo-choices"><p id="nlPhotoHelp">Add the missing photos, or use name-only labels for this whole batch. Photos already added stay in this draft.</p><div class="nl-photo-actions"><button id="nlInlineAddPhotos">Add Photos</button><button id="nlUseNameOnly">Use Name Only</button></div></div></div><button id="nlNext" class="nl-next">Save &amp; Add to Print</button></div><div id="nlMissingPhotos" class="nl-decision" hidden role="alertdialog" aria-labelledby="nlMissingTitle" aria-describedby="nlMissingMessage"><div class="nl-card"><h2 id="nlMissingTitle">Some photos are missing</h2><p id="nlMissingMessage"></p><button id="nlAddMissingPhotos">Add Photos</button><button id="nlContinueNameOnly">Continue Name Only</button></div></div>`;
    document.body.append(overlay);
    $('nlBack').onclick = () => close(); $('nlNames').oninput = sync;
    overlay.querySelectorAll('[data-style]').forEach(button => button.onclick = () => setStyle(button.dataset.style));
    overlay.querySelectorAll('[data-type]').forEach(button => button.onclick = () => setType(button.dataset.type));
    $('nlCopies').onchange = event => { copies = +event.target.value || 1; sync(); };
    $('nlPrevStudent').onclick = () => { previewIndex = Math.max(0, previewIndex - 1); preview(); };
    $('nlNextStudent').onclick = () => { previewIndex = Math.min(students.length - 1, previewIndex + 1); preview(); };
    $('nlInlineAddPhotos').onclick = focusMissingPhoto;
    $('nlUseNameOnly').onclick = () => { setStyle('name'); overlay.querySelector('[data-style="name"]').focus(); };
    $('nlAddMissingPhotos').onclick = () => { closeDecision(false); focusMissingPhoto(); };
    $('nlContinueNameOnly').onclick = () => { closeDecision(false); setStyle('name'); $('nlNext').click(); };
    $('nlNext').onclick = () => { sync(); if (!students.length) return alert('Add at least one student name.'); if (reviewMissingPhotos()) return; alert(`Name Labels are ready for the next step: ${students.length} students × ${copies} labels.`); };
    let trigger = [...document.querySelectorAll('.home-action')].find(button => button.textContent.includes('Name Labels'));
    if (!trigger) { const grid = document.querySelector('.home-create-grid'); if (grid) { trigger = document.createElement('button'); trigger.className = 'home-action'; trigger.innerHTML = '<span class="home-icon">👤</span><strong>Name Labels</strong><small>Names for cubbies, chairs & more</small>'; grid.append(trigger); } }
    if (trigger) { trigger.id ||= 'homeNameBtn'; trigger.onclick = open; }
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', install, { once:true }) : install();
})();
