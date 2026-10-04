// Full-panel text layout shared by the name editor, print sheets and PDF.
(() => {
  const DPI = 300;
  const original = window.rasterizeFinishedLabel;
  function roundRect(ctx, x, y, w, h, radius) {
    const r = Math.min(radius, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function textMetrics(ctx, text, size) {
    const m = ctx.measureText(text);
    const left = Number.isFinite(m.actualBoundingBoxLeft) ? m.actualBoundingBoxLeft : 0;
    const right = Number.isFinite(m.actualBoundingBoxRight) ? m.actualBoundingBoxRight : m.width;
    return { text, left, right, width: Math.max(m.width, left + right),
      ascent: Number.isFinite(m.actualBoundingBoxAscent) ? m.actualBoundingBoxAscent : size * .8,
      descent: Number.isFinite(m.actualBoundingBoxDescent) ? m.actualBoundingBoxDescent : size * .2 };
  }
  function linesAt(ctx, text, size, maxWidth, maxLines) {
    ctx.font = `800 ${size}px Arial, sans-serif`;
    const words = text.split(/\s+/), lines = [];
    let line = '';
    for (const word of words) {
      const joined = line ? line + ' ' + word : word;
      if (line && textMetrics(ctx, joined, size).width > maxWidth) { lines.push(line); line = word; }
      else line = joined;
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) return null;
    const metrics = lines.map(value => textMetrics(ctx, value, size));
    if (metrics.some(m => m.width > maxWidth)) return null;
    const gap = size * .22;
    const height = metrics.reduce((sum, m) => sum + m.ascent + m.descent, 0) + Math.max(0, metrics.length - 1) * gap;
    return { size, metrics, gap, height };
  }
  function fit(ctx, text, width, height, maxLines) {
    let low = 0, high = height * .8, best = null;
    // Fractional sizing keeps even long unbroken names intact and inside the card.
    for (let i = 0; i < 22; i++) {
      const size = (low + high) / 2, result = linesAt(ctx, text, size, width, maxLines);
      if (result && result.height <= height) { best = result; low = size; }
      else high = size;
    }
    return best;
  }
  function drawName(ctx, name, box) {
    const text = String(name || '').trim().replace(/\s+/g, ' ');
    if (!text) return;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    // Leave breathing room around large names and accents, using the actual ink bounds.
    const width = box.w * .90, height = box.h * .76;
    let layout = fit(ctx, text, width, height, 1);
    const wrapped = fit(ctx, text, width, height, 2);
    if (wrapped && (!layout || wrapped.size > layout.size * 1.2)) layout = wrapped;
    if (!layout) return;
    ctx.font = `800 ${layout.size}px Arial, sans-serif`; ctx.fillStyle = '#0e4c88';
    let top = box.y + (box.h - layout.height) / 2;
    for (const line of layout.metrics) {
      const x = box.x + box.w / 2 - (line.right - line.left) / 2;
      ctx.fillText(line.text, x, top + line.ascent);
      top += line.ascent + line.descent + layout.gap;
    }
  }
  async function render(item, dimensions) {
    const d = dimensions || window.labelDimensions(item);
    const W = Math.round(d.w * DPI), H = Math.round(d.h * DPI);
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const folded = d.type === 'cp', top = folded ? Math.round(H / 2) : 0, height = H - top;
    if (folded) {
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
      ctx.save(); ctx.strokeStyle = '#9aa9b5'; ctx.lineWidth = 2; ctx.setLineDash([10, 8]);
      ctx.beginPath(); ctx.moveTo(0, top); ctx.lineTo(W, top); ctx.stroke(); ctx.restore();
    }
    const bg = ctx.createLinearGradient(0, top, W, H);
    bg.addColorStop(0, '#e6f2fb'); bg.addColorStop(.48, '#f7fbfe'); bg.addColorStop(1, '#dcecf8');
    ctx.fillStyle = bg; ctx.fillRect(0, top, W, height);
    const inset = Math.max(9, Math.round(Math.min(W, height) * .035));
    const card = { x: inset, y: top + inset, w: W - 2 * inset, h: height - 2 * inset };
    const radius = Math.max(18, Math.round(Math.min(W, height) * .055));
    ctx.save(); ctx.shadowColor = 'rgba(48,88,118,.16)'; ctx.shadowBlur = Math.round(Math.min(W, height) * .025);
    ctx.shadowOffsetY = Math.round(Math.min(W, height) * .01);
    roundRect(ctx, card.x, card.y, card.w, card.h, radius); ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();
    roundRect(ctx, card.x, card.y, card.w, card.h, radius);
    ctx.strokeStyle = '#7fb3d8'; ctx.lineWidth = Math.max(3, Math.round(Math.min(W, height) * .006)); ctx.stroke();
    drawName(ctx, item.english, card);
    return canvas.toDataURL('image/png');
  }
  // Legacy Name Only records have no separate style field. The same layout
  // applies to other image-free, single-language labels without rewriting data.
  const matches = item => !String(item?.photo || '').trim() && !String(item?.spanish || '').trim();
  window.LittleLabelNameOnly = { render, matches };
  if (typeof original === 'function') window.rasterizeFinishedLabel = item => matches(item) ? render(item) : original(item);
})();
