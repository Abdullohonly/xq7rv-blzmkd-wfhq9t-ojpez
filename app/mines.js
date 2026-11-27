/* Lahzam mini o'yini: Minesweeper (Mina) — minalarni topib, qolgan kataklarni oching */
(function () {
  const W = 9, H = 9, M = 10, BEST_KEY = 'lahzam_mines_best', SOUND_KEY = 'lahzam_flappy_sound';
  const NUMC = ['', '#4C7DFF', '#3FA34D', '#FF5A1F', '#7A3FD1', '#B0362B', '#1BA5A5', '#121212', '#777'];
  const soundOn = () => { try { return localStorage.getItem(SOUND_KEY) !== '0'; } catch (e) { return true; } };
  let actx = null;
  function beep(f, d = 0.06, v = 0.04) {
    if (!soundOn()) return;
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(f, t); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + d + 0.02); } catch (e) {}
  }
  function icon(size) {
    return `<svg viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true"><rect x="4" y="4" width="56" height="56" rx="14" fill="#2a2a2a"/>
      <rect x="10" y="10" width="13" height="13" rx="4" fill="#3a3a40"/><rect x="25.5" y="10" width="13" height="13" rx="4" fill="#F3EEE8"/><rect x="41" y="10" width="13" height="13" rx="4" fill="#3a3a40"/>
      <rect x="10" y="25.5" width="13" height="13" rx="4" fill="#F3EEE8"/><rect x="41" y="25.5" width="13" height="13" rx="4" fill="#F3EEE8"/>
      <rect x="10" y="41" width="13" height="13" rx="4" fill="#3a3a40"/><rect x="25.5" y="41" width="13" height="13" rx="4" fill="#F3EEE8"/><rect x="41" y="41" width="13" height="13" rx="4" fill="#3a3a40"/>
      <circle cx="32" cy="32" r="7.5" fill="#FF5A1F"/><path d="M32 21v4M32 39v4M21 32h4M39 32h4" stroke="#FF5A1F" stroke-width="2.6" stroke-linecap="round"/><circle cx="29.5" cy="29.5" r="2" fill="#fff"/>
      <text x="16.5" y="35.5" font-size="9" font-weight="800" text-anchor="middle" fill="#4C7DFF" font-family="sans-serif">1</text><text x="47.5" y="35.5" font-size="9" font-weight="800" text-anchor="middle" fill="#3FA34D" font-family="sans-serif">2</text></svg>`;
  }
  function open(opts) {
    const wrap = document.createElement('div');
    wrap.className = 'game-wrap';
    wrap.innerHTML = `<div class="game-box g48-box" role="dialog" aria-label="Mina o'yini">
      <div class="row" style="justify-content:space-between;margin-bottom:8px">
        <div class="row" style="gap:8px">${icon(34)}<div><b style="display:block">Mina</b><span style="font-size:12px;color:#bbb" data-rec></span></div></div>
        <div class="row" style="gap:6px"><button class="ibtn" data-sound aria-label="Ovoz" style="background:#2a2a2a"></button><button class="ibtn" data-close aria-label="Yopish" style="background:#2a2a2a">✕</button></div></div>
      <div class="g48-stats"><div><span>💣 Qoldi</span><b data-left>${M}</b></div><div><span>⏱ Vaqt</span><b data-time>0</b></div><button class="g48-new" data-new>↻ Yangi</button></div>
      <div class="mn-board" aria-label="O'yin maydoni"></div>
      <div class="mn-mode" role="group" aria-label="Rejim"><button data-mode="dig" class="on">⛏ Ochish</button><button data-mode="flag">🚩 Bayroq</button></div>
      <p class="g48-hint">Katakni bosing. Minani belgilash uchun 🚩 rejimini tanlang yoki katakni bosib turing.</p></div>`;
    document.body.appendChild(wrap);
    const $ = s => wrap.querySelector(s), boardEl = $('.mn-board'), recEl = $('[data-rec]'), sndBtn = $('[data-sound]');
    let best = 0; try { best = +localStorage.getItem(BEST_KEY) || 0; } catch (e) {}
    const setRec = () => { recEl.textContent = opts.solo ? (best ? `Eng yaxshi natijangiz: ${best} ochko` : 'Yakka o‘yin · natijangiz saqlanadi') : opts.record ? `Chat rekordi: ${opts.record} (@${opts.recordBy})` : 'Bu chatda hali rekord yo‘q'; };
    const setSnd = () => { sndBtn.textContent = soundOn() ? '🔊' : '🔇'; };
    let mine, open_, flag, near, started, over, won, t0, timer, secs, mode = 'dig', ended;
    function reset() {
      mine = Array(W * H).fill(false); open_ = Array(W * H).fill(false); flag = Array(W * H).fill(false); near = Array(W * H).fill(0);
      started = false; over = false; won = false; ended = false; secs = 0; clearInterval(timer); $('[data-time]').textContent = 0; draw();
    }
    const nb = i => { const x = i % W, y = (i / W) | 0, r = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < W && ny < H) r.push(ny * W + nx); } return r; };
    // birinchi bosilgan katak va atrofida mina bo'lmaydi
    function plant(safe) {
      const ban = new Set([safe, ...nb(safe)]); let n = 0;
      while (n < M) { const i = (Math.random() * W * H) | 0; if (!mine[i] && !ban.has(i)) { mine[i] = true; n++; } }
      for (let i = 0; i < W * H; i++) near[i] = nb(i).filter(j => mine[j]).length;
      started = true; t0 = Date.now(); timer = setInterval(() => { secs = Math.floor((Date.now() - t0) / 1000); $('[data-time]').textContent = secs; }, 500);
    }
    function reveal(i) {
      const st = [i];
      while (st.length) { const k = st.pop(); if (open_[k] || flag[k]) continue; open_[k] = true; if (!near[k] && !mine[k]) nb(k).forEach(j => !open_[j] && st.push(j)); }
    }
    const score = () => won ? Math.max(100, 1000 - secs * 3) : open_.filter(Boolean).length;
    function finish() {
      clearInterval(timer); secs = started ? Math.floor((Date.now() - t0) / 1000) : 0; $('[data-time]').textContent = secs;
      if (ended) return; ended = true; const s = score();
      if (s > best) { best = s; try { localStorage.setItem(BEST_KEY, best); } catch (e) {} }
      const res = opts.onEnd ? opts.onEnd(s) : null;
      if (res && res.record) { opts.record = res.record; opts.recordBy = res.recordBy; }
      setRec();
    }
    function act(i, asFlag) {
      if (over || won) return;
      if (asFlag) { if (open_[i]) return; flag[i] = !flag[i]; beep(flag[i] ? 520 : 300, 0.05); navigator.vibrate && navigator.vibrate(15); return draw(); }
      if (flag[i]) return;
      if (!started) plant(i);
      if (open_[i]) { // ochiq raqamni bossangiz: atrofdagi bayroqlar soni teng bo'lsa, qolganlari ochiladi
        const n = nb(i); if (n.filter(j => flag[j]).length !== near[i]) return;
        n.forEach(j => { if (!flag[j] && !open_[j]) { if (mine[j]) over = true; reveal(j); } });
      } else if (mine[i]) { over = true; open_[i] = true; }
      else reveal(i);
      if (over) { mine.forEach((m, k) => { if (m) open_[k] = true; }); beep(140, 0.5, 0.07); navigator.vibrate && navigator.vibrate([40, 40, 80]); finish(); }
      else { beep(380 + Math.random() * 120, 0.04, 0.025); if (open_.filter(Boolean).length === W * H - M) { won = true; mine.forEach((m, k) => { if (m) flag[k] = true; }); beep(880, 0.4, 0.06); finish(); } }
      draw();
    }
    function draw() {
      $('[data-left]').textContent = M - flag.filter(Boolean).length;
      boardEl.innerHTML = mine.map((m, i) => {
        if (!open_[i]) return `<button class="mn-c${flag[i] ? ' fl' : ''}" data-i="${i}" aria-label="Yopiq katak${flag[i] ? ', bayroq' : ''}">${flag[i] ? '🚩' : ''}</button>`;
        if (m) return `<span class="mn-c op boom">💣</span>`;
        return `<button class="mn-c op" data-i="${i}" style="color:${NUMC[near[i]]}" aria-label="${near[i] || 'Bo‘sh'}">${near[i] || ''}</button>`;
      }).join('') + (over || won ? `<div class="g48-over"><b>${won ? '🎉 Yutdingiz!' : '💥 Mina portladi'}</b><span>${score()} ochko${won ? ' · ' + secs + ' soniya' : ''}</span><button class="btn" style="background:#fff;color:#121212" data-new>Qayta o‘ynash</button></div>` : '');
    }
    // bosib turish = bayroq
    let pressT = 0, pressI = -1, longDone = false;
    boardEl.addEventListener('pointerdown', e => { const c = e.target.closest('[data-i]'); if (!c) return; pressI = +c.dataset.i; longDone = false; clearTimeout(pressT); pressT = setTimeout(() => { longDone = true; act(pressI, true); }, 380); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => boardEl.addEventListener(ev, () => clearTimeout(pressT)));
    boardEl.addEventListener('contextmenu', e => { e.preventDefault(); const c = e.target.closest('[data-i]'); if (c && !longDone) act(+c.dataset.i, true); longDone = true; });
    boardEl.addEventListener('click', e => { const c = e.target.closest('[data-i]'); if (!c) return; if (longDone) { longDone = false; return; } act(+c.dataset.i, mode === 'flag'); });
    const onKey = e => { if (e.key === 'Escape') close(); };
    function close() { clearInterval(timer); if (started && !ended && (over || won)) finish(); document.removeEventListener('keydown', onKey); wrap.remove(); }
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', e => {
      if (e.target === wrap || e.target.closest('[data-close]')) return close();
      if (e.target.closest('[data-new]')) reset();
      const md = e.target.closest('[data-mode]'); if (md) { mode = md.dataset.mode; wrap.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b === md)); }
      if (e.target.closest('[data-sound]')) { try { localStorage.setItem(SOUND_KEY, soundOn() ? '0' : '1'); } catch (err) {} setSnd(); }
    });
    setRec(); setSnd(); reset();
    return { close };
  }
  window.Mines = { open, icon };
})();
