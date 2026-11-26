/* Lahzam mini o'yini: 2048 — surib, bir xil sonlarni qo'shasiz */
(function () {
  const N = 4, BEST_KEY = 'lahzam_2048_best', SOUND_KEY = 'lahzam_flappy_sound';
  const COL = { 2: ['#F3EEE8', '#121212'], 4: ['#FFE3A3', '#121212'], 8: ['#FFB27A', '#121212'], 16: ['#FF8A4C', '#fff'], 32: ['#FF6A3D', '#fff'], 64: ['#FF5A1F', '#fff'],
    128: ['#FFD25A', '#121212'], 256: ['#FFC531', '#121212'], 512: ['#5EC84E', '#fff'], 1024: ['#4C7DFF', '#fff'], 2048: ['#B07CFF', '#fff'] };
  const soundOn = () => { try { return localStorage.getItem(SOUND_KEY) !== '0'; } catch (e) { return true; } };
  let actx = null;
  function beep(f, d = 0.07, v = 0.04) {
    if (!soundOn()) return;
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(f, t); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + d + 0.02); } catch (e) {}
  }
  function icon(size) {
    return `<svg viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true"><rect x="4" y="4" width="56" height="56" rx="14" fill="#2a2a2a"/>
      <rect x="10" y="10" width="20" height="20" rx="6" fill="#FFE3A3"/><rect x="34" y="10" width="20" height="20" rx="6" fill="#FF5A1F"/><rect x="10" y="34" width="20" height="20" rx="6" fill="#FFC531"/><rect x="34" y="34" width="20" height="20" rx="6" fill="#B07CFF"/>
      <text x="44" y="24" font-size="9" font-weight="800" text-anchor="middle" fill="#fff" font-family="sans-serif">64</text><text x="44" y="48" font-size="7" font-weight="800" text-anchor="middle" fill="#fff" font-family="sans-serif">2048</text></svg>`;
  }
  function open(opts) {
    const wrap = document.createElement('div');
    wrap.className = 'game-wrap';
    wrap.innerHTML = `<div class="game-box g48-box" role="dialog" aria-label="2048 o'yini">
      <div class="row" style="justify-content:space-between;margin-bottom:8px">
        <div class="row" style="gap:8px">${icon(34)}<div><b style="display:block">2048</b><span style="font-size:12px;color:#bbb" data-rec></span></div></div>
        <div class="row" style="gap:6px"><button class="ibtn" data-sound aria-label="Ovoz" style="background:#2a2a2a"></button><button class="ibtn" data-close aria-label="Yopish" style="background:#2a2a2a">✕</button></div></div>
      <div class="g48-stats"><div><span>Ochko</span><b data-score>0</b></div><div><span>Eng yaxshi</span><b data-best>0</b></div><button class="g48-new" data-new>↻ Yangi</button></div>
      <div class="g48-board" tabindex="0" aria-label="O'yin maydoni: barmoq bilan suring yoki strelkalarni bosing"></div>
      <p class="g48-hint">Barmoq bilan suring yoki ← ↑ → ↓ ni bosing. Bir xil sonlar qo‘shiladi!</p></div>`;
    document.body.appendChild(wrap);
    const $ = s => wrap.querySelector(s), boardEl = $('.g48-board'), recEl = $('[data-rec]'), sndBtn = $('[data-sound]');
    const setRec = () => { recEl.textContent = opts.solo ? 'Yakka o‘yin · eng yaxshi natijangiz saqlanadi' : opts.record ? `Chat rekordi: ${opts.record} (@${opts.recordBy})` : 'Bu chatda hali rekord yo‘q'; };
    const setSnd = () => { sndBtn.textContent = soundOn() ? '🔊' : '🔇'; };
    setRec(); setSnd();
    let best = 0; try { best = +localStorage.getItem(BEST_KEY) || 0; } catch (e) {}
    let grid, score, over, won, keepGoing, fresh = new Set(), merged = new Set(), ended;

    function addTile() {
      const empty = []; grid.forEach((v, i) => { if (!v) empty.push(i); }); if (!empty.length) return;
      const i = empty[Math.floor(Math.random() * empty.length)]; grid[i] = Math.random() < 0.9 ? 2 : 4; fresh.add(i);
    }
    function reset() { grid = Array(N * N).fill(0); score = 0; over = false; won = false; keepGoing = false; ended = false; fresh = new Set(); merged = new Set(); addTile(); addTile(); draw(); }
    function canMove() {
      if (grid.includes(0)) return true;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const v = grid[r * N + c]; if ((c < N - 1 && v === grid[r * N + c + 1]) || (r < N - 1 && v === grid[(r + 1) * N + c])) return true; }
      return false;
    }
    function move(dir) { // 0 chap, 1 o'ng, 2 tepa, 3 past
      if (over || (won && !keepGoing)) return;
      fresh = new Set(); merged = new Set(); let moved = false, gain = 0;
      for (let k = 0; k < N; k++) {
        const idx = []; for (let j = 0; j < N; j++) idx.push(dir < 2 ? k * N + j : j * N + k);
        if (dir === 1 || dir === 3) idx.reverse();
        const vals = idx.map(i => grid[i]).filter(Boolean), out = [];
        for (let j = 0; j < vals.length; j++) {
          if (vals[j] === vals[j + 1]) { const v = vals[j] * 2; out.push(v); gain += v; merged.add(idx[out.length - 1]); if (v === 2048 && !won) won = true; j++; }
          else out.push(vals[j]);
        }
        idx.forEach((i, j) => { const v = out[j] || 0; if (grid[i] !== v) moved = true; grid[i] = v; });
      }
      if (!moved) return;
      score += gain; gain ? beep(320 + Math.min(900, gain * 2), 0.09) : beep(220, 0.04, 0.02);
      addTile();
      if (!canMove()) { over = true; finish(); beep(160, 0.5, 0.06); }
      else if (won && !keepGoing) { finish(); beep(880, 0.4, 0.06); }
      draw();
    }
    function finish() {
      if (score > best) { best = score; try { localStorage.setItem(BEST_KEY, best); } catch (e) {} }
      if (ended) return; ended = true;
      const res = opts.onEnd ? opts.onEnd(score) : null;
      if (res && res.record) { opts.record = res.record; opts.recordBy = res.recordBy; setRec(); }
    }
    function draw() {
      $('[data-score]').textContent = score; $('[data-best]').textContent = Math.max(best, score);
      boardEl.innerHTML = grid.map((v, i) => {
        const [bg, fg] = COL[v] || ['#121212', '#FFC531'];
        return `<div class="g48-cell">${v ? `<div class="g48-tile${fresh.has(i) ? ' new' : ''}${merged.has(i) ? ' pop' : ''}" style="background:${bg};color:${fg};font-size:${v > 999 ? 20 : v > 99 ? 25 : 30}px">${v}</div>` : ''}</div>`;
      }).join('') + (over || (won && !keepGoing) ? `<div class="g48-over"><b>${over ? 'O‘yin tugadi' : '🎉 2048!'}</b><span>${score} ochko</span>
        <div class="row" style="gap:8px;justify-content:center">${won && !over ? '<button class="btn acc" data-cont>Davom etish</button>' : ''}<button class="btn" style="background:#fff;color:#121212" data-new>Qayta o‘ynash</button></div></div>` : '');
    }
    const keys = { ArrowLeft: 0, ArrowRight: 1, ArrowUp: 2, ArrowDown: 3, KeyA: 0, KeyD: 1, KeyW: 2, KeyS: 3 };
    const onKey = e => { if (e.key === 'Escape') return close(); if (e.code in keys) { e.preventDefault(); move(keys[e.code]); } };
    let sx = 0, sy = 0, down = false;
    boardEl.addEventListener('pointerdown', e => { down = true; sx = e.clientX; sy = e.clientY; });
    boardEl.addEventListener('pointerup', e => {
      if (!down) return; down = false; const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
      move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 0) : (dy > 0 ? 3 : 2));
    });
    boardEl.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
    function close() { if (score && !ended) finish(); document.removeEventListener('keydown', onKey); wrap.remove(); }
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', e => {
      if (e.target === wrap || e.target.closest('[data-close]')) return close();
      if (e.target.closest('[data-new]')) { if (score && !ended) finish(); reset(); }
      if (e.target.closest('[data-cont]')) { keepGoing = true; draw(); }
      if (e.target.closest('[data-sound]')) { try { localStorage.setItem(SOUND_KEY, soundOn() ? '0' : '1'); } catch (err) {} setSnd(); }
    });
    reset(); boardEl.focus();
    return { close };
  }
  window.G2048 = { open, icon };
})();
