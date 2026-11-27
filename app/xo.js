/* Lahzam mini o'yini: X/O (Tic-tac-toe). Yakka: kompyuterga qarshi. Chatda: ikki kishi navbat bilan. */
(function () {
  const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  const BEST_KEY = 'lahzam_xo_best';
  function winner(b) {
    for (const [a, c, d] of LINES) if (b[a] !== '.' && b[a] === b[c] && b[a] === b[d]) return { w: b[a], line: [a, c, d] };
    return b.includes('.') ? null : { w: 'd', line: [] };
  }
  function icon(size) {
    return `<svg viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true"><rect x="4" y="4" width="56" height="56" rx="14" fill="#2a2a2a"/>
      <path d="M25 13v38M39 13v38M13 25h38M13 39h38" stroke="#4a4a50" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M14.5 14.5l6 6M20.5 14.5l-6 6" stroke="#FF5A1F" stroke-width="3" stroke-linecap="round"/>
      <circle cx="32" cy="32" r="3.6" fill="none" stroke="#FFC531" stroke-width="2.8"/>
      <path d="M42.5 42.5l6 6M48.5 42.5l-6 6" stroke="#FF5A1F" stroke-width="3" stroke-linecap="round"/>
      <circle cx="45.5" cy="17.5" r="3.6" fill="none" stroke="#FFC531" stroke-width="2.8"/></svg>`;
  }
  const mark = (v, big) => v === 'x' ? `<svg viewBox="0 0 24 24" width="${big}" height="${big}"><path d="M6 6l12 12M18 6L6 18" stroke="#FF5A1F" stroke-width="3.2" stroke-linecap="round"/></svg>`
    : v === 'o' ? `<svg viewBox="0 0 24 24" width="${big}" height="${big}"><circle cx="12" cy="12" r="7" fill="none" stroke="#FFC531" stroke-width="3.2"/></svg>` : '';
  // kompyuter: ko'pincha eng yaxshi yurish (minimax), ba'zan adashadi — yutish mumkin bo'lsin
  function mm(b, me) {
    const r = winner(b); if (r) return r.w === 'o' ? 10 : r.w === 'x' ? -10 : 0;
    let best = me === 'o' ? -99 : 99;
    for (let i = 0; i < 9; i++) if (b[i] === '.') { const nb = b.slice(0, i) + me + b.slice(i + 1), s = mm(nb, me === 'o' ? 'x' : 'o'); best = me === 'o' ? Math.max(best, s) : Math.min(best, s); }
    return best;
  }
  function aiMove(b) {
    const free = [...b].map((v, i) => v === '.' ? i : -1).filter(i => i > -1);
    if (Math.random() < 0.22) return free[(Math.random() * free.length) | 0];
    let bi = free[0], bs = -99; for (const i of free) { const s = mm(b.slice(0, i) + 'o' + b.slice(i + 1), 'x'); if (s > bs) { bs = s; bi = i; } }
    return bi;
  }
  function open(opts) {
    const wrap = document.createElement('div');
    wrap.className = 'game-wrap';
    wrap.innerHTML = `<div class="game-box g48-box" role="dialog" aria-label="X/O o'yini">
      <div class="row" style="justify-content:space-between;margin-bottom:8px">
        <div class="row" style="gap:8px">${icon(34)}<div><b style="display:block">X/O</b><span style="font-size:12px;color:#bbb">Kompyuterga qarshi · siz ❌</span></div></div>
        <button class="ibtn" data-close aria-label="Yopish" style="background:#2a2a2a">✕</button></div>
      <div class="g48-stats"><div><span>Siz</span><b data-w>0</b></div><div><span>Durang</span><b data-d>0</b></div><div><span>Kompyuter</span><b data-l>0</b></div></div>
      <div class="xo-board xo-big"></div>
      <p class="g48-hint" data-st>Sizning navbatingiz ❌</p>
      <button class="btn acc full" style="margin-top:10px;height:46px;border-radius:999px" data-new>↻ Yangi o‘yin</button></div>`;
    document.body.appendChild(wrap);
    const $ = s => wrap.querySelector(s); let sc = { w: 0, d: 0, l: 0 }; try { sc = JSON.parse(localStorage.getItem(BEST_KEY)) || sc; } catch (e) {}
    let b, busy, res;
    function draw() {
      $('[data-w]').textContent = sc.w; $('[data-d]').textContent = sc.d; $('[data-l]').textContent = sc.l;
      $('.xo-board').innerHTML = [...b].map((v, i) => `<button class="xo-c${res && res.line.includes(i) ? ' win' : ''}" data-i="${i}" ${v !== '.' || res ? 'disabled' : ''} aria-label="${v === '.' ? 'Bo‘sh katak' : v.toUpperCase()}">${mark(v, 46)}</button>`).join('');
      $('[data-st]').textContent = !res ? (busy ? 'Kompyuter o‘ylayapti…' : 'Sizning navbatingiz ❌') : res.w === 'x' ? '🎉 Siz yutdingiz!' : res.w === 'o' ? '🤖 Kompyuter yutdi' : '🤝 Durang';
    }
    function end() { res = winner(b); if (!res) return false; sc[res.w === 'x' ? 'w' : res.w === 'o' ? 'l' : 'd']++; try { localStorage.setItem(BEST_KEY, JSON.stringify(sc)); } catch (e) {} navigator.vibrate && navigator.vibrate(res.w === 'x' ? [20, 30, 20] : 30); return true; }
    function reset() { b = '.........'; busy = false; res = null; draw(); }
    wrap.addEventListener('click', e => {
      if (e.target === wrap || e.target.closest('[data-close]')) return wrap.remove();
      if (e.target.closest('[data-new]')) return reset();
      const c = e.target.closest('[data-i]'); if (!c || busy || res) return;
      const i = +c.dataset.i; if (b[i] !== '.') return;
      b = b.slice(0, i) + 'x' + b.slice(i + 1); if (end()) return draw();
      busy = true; draw();
      setTimeout(() => { const j = aiMove(b); b = b.slice(0, j) + 'o' + b.slice(j + 1); busy = false; end(); draw(); }, 380);
    });
    reset();
  }
  window.XO = { open, icon, mark, winner };
})();
