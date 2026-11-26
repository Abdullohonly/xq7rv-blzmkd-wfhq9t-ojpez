/* Lahzam mini o'yini: "Tetris" — bloklar Lahzam ranglarida, butunlay o'zimiz yozgan */
(function () {
  const COLS = 10, ROWS = 20, BEST_KEY = 'lahzam_tetris_best', SOUND_KEY = 'lahzam_flappy_sound';
  // 7 ta shakl (SRS tartibida), har biri 4 aylanish holatida hisoblanadi
  const SHAPES = {
    I: [[0, 1], [1, 1], [2, 1], [3, 1]], O: [[1, 0], [2, 0], [1, 1], [2, 1]], T: [[1, 0], [0, 1], [1, 1], [2, 1]],
    S: [[1, 0], [2, 0], [0, 1], [1, 1]], Z: [[0, 0], [1, 0], [1, 1], [2, 1]], J: [[0, 0], [0, 1], [1, 1], [2, 1]], L: [[2, 0], [0, 1], [1, 1], [2, 1]]
  };
  const COLORS = { I: '#5FD3F3', O: '#FFC531', T: '#B07CFF', S: '#5EC84E', Z: '#FF5A5F', J: '#4C7DFF', L: '#FF8A2B' };
  const SIZE = { I: 4, O: 4, T: 3, S: 3, Z: 3, J: 3, L: 3 };
  const rot = (cells, n, k) => { let c = cells; for (let i = 0; i < k; i++) c = c.map(([x, y]) => [n - 1 - y, x]); return c; };
  const KICKS = [[0, 0], [-1, 0], [1, 0], [0, -1], [-2, 0], [2, 0]];
  const LINE_PTS = [0, 100, 300, 500, 800];
  const speed = lvl => Math.max(70, 800 - (lvl - 1) * 70); // ms har qatorga tushish

  /* ovoz */
  let actx = null;
  const soundOn = () => { try { return localStorage.getItem(SOUND_KEY) !== '0'; } catch (e) { return true; } };
  function beep(f1, f2, dur, vol = 0.04, type = 'square', delay = 0) {
    if (!soundOn()) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume();
      const t = actx.currentTime + delay, o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + dur + 0.02);
    } catch (e) {}
  }

  function icon(size) {
    return `<svg viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">
      <rect x="6" y="30" width="16" height="16" rx="3" fill="#B07CFF"/><rect x="22" y="30" width="16" height="16" rx="3" fill="#B07CFF"/><rect x="38" y="30" width="16" height="16" rx="3" fill="#B07CFF"/><rect x="22" y="14" width="16" height="16" rx="3" fill="#B07CFF"/>
      <rect x="6" y="46" width="16" height="12" rx="3" fill="#FF8A2B"/><rect x="38" y="46" width="16" height="12" rx="3" fill="#5FD3F3"/><rect x="22" y="46" width="16" height="12" rx="3" fill="#FFC531"/></svg>`;
  }

  function open(opts) {
    const wrap = document.createElement('div');
    wrap.className = 'game-wrap';
    wrap.innerHTML = `<div class="game-box tet-box" role="dialog" aria-label="Tetris o'yini">
      <div class="row" style="justify-content:space-between;margin-bottom:8px">
        <div class="row" style="gap:8px">${icon(34)}<div><b style="display:block">Tetris</b><span style="font-size:12px;color:#bbb" data-rec></span></div></div>
        <div class="row" style="gap:6px"><button class="ibtn" data-sound aria-label="Ovoz" style="background:#2a2a2a"></button><button class="ibtn" data-close aria-label="Yopish" style="background:#2a2a2a">✕</button></div>
      </div>
      <div class="tet-main"><canvas class="tet-board" aria-label="O'yin maydoni"></canvas>
        <div class="tet-side"><div class="tet-k">Keyingi</div><canvas class="tet-next" width="80" height="80"></canvas>
          <div class="tet-k">Ochko</div><b data-score>0</b><div class="tet-k">Qator</div><b data-lines>0</b><div class="tet-k">Daraja</div><b data-level>1</b><div class="tet-k">Eng yaxshi</div><b data-best>0</b></div></div>
      <div class="tet-pad">
        <button data-k="left" aria-label="Chapga">◀</button><button data-k="rot" aria-label="Aylantirish">⟳</button><button data-k="right" aria-label="O'ngga">▶</button>
        <button data-k="soft" aria-label="Pastga">▼</button><button data-k="drop" aria-label="Tashlash" class="tet-drop">⤓ Tashlash</button>
      </div></div>`;
    document.body.appendChild(wrap);
    const board = wrap.querySelector('.tet-board'), g = board.getContext('2d'), nx = wrap.querySelector('.tet-next').getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1), CELL = Math.floor(Math.min(28, (Math.min(window.innerHeight * 0.62, 560)) / ROWS));
    board.width = COLS * CELL * dpr; board.height = ROWS * CELL * dpr; board.style.width = COLS * CELL + 'px'; board.style.height = ROWS * CELL + 'px'; g.scale(dpr, dpr);
    const $ = s => wrap.querySelector(s), recEl = $('[data-rec]'), sndBtn = $('[data-sound]');
    const setRec = () => { recEl.textContent = opts.record ? `Chat rekordi: ${opts.record} (@${opts.recordBy})` : 'Bu chatda hali rekord yo‘q'; };
    const setSnd = () => { sndBtn.textContent = soundOn() ? '🔊' : '🔇'; };
    setRec(); setSnd();
    let best = 0; try { best = +localStorage.getItem(BEST_KEY) || 0; } catch (e) {}
    let grid, cur, next, bag, score, lines, level, state, dropAcc, last, raf, flashRows, flashT, chatRecord, newBest, overAt = 0;

    function takeBag() { if (!bag.length) { bag = Object.keys(SHAPES); for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; } } return bag.pop(); }
    const cellsOf = p => rot(SHAPES[p.t], SIZE[p.t], p.r).map(([x, y]) => [x + p.x, y + p.y]);
    const fits = p => cellsOf(p).every(([x, y]) => x >= 0 && x < COLS && y < ROWS && (y < 0 || !grid[y][x]));
    function spawn() { cur = { t: next, r: 0, x: next === 'O' ? 3 : 3, y: next === 'I' ? -1 : 0 }; next = takeBag(); if (!fits(cur)) over(); }
    function reset() { grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null)); bag = []; next = takeBag(); score = 0; lines = 0; level = 1; state = 'ready'; dropAcc = 0; flashRows = []; chatRecord = false; newBest = false; spawn(); hud(); }
    function hud() { $('[data-score]').textContent = score; $('[data-lines]').textContent = lines; $('[data-level]').textContent = level; $('[data-best]').textContent = best; }
    function move(dx, dy) { const p = { ...cur, x: cur.x + dx, y: cur.y + dy }; if (fits(p)) { cur = p; return true; } return false; }
    function rotate() { for (const [kx, ky] of KICKS) { const p = { ...cur, r: (cur.r + 1) % 4, x: cur.x + kx, y: cur.y + ky }; if (fits(p)) { cur = p; beep(520, 660, 0.05, 0.03); return; } } }
    function lock() {
      for (const [x, y] of cellsOf(cur)) { if (y < 0) return over(); grid[y][x] = cur.t; }
      const full = grid.map((row, y) => row.every(Boolean) ? y : -1).filter(y => y >= 0);
      if (full.length) {
        flashRows = full; flashT = performance.now();
        score += LINE_PTS[full.length] * level; lines += full.length;
        const nl = Math.floor(lines / 10) + 1; if (nl > level) { level = nl; beep(660, 1320, 0.25, 0.05); }
        beep(full.length === 4 ? 880 : 700, full.length === 4 ? 1760 : 1000, 0.12 + full.length * 0.04, 0.05);
        setTimeout(() => { grid = grid.filter((_, y) => !full.includes(y)); while (grid.length < ROWS) grid.unshift(Array(COLS).fill(null)); flashRows = []; }, 160);
      } else beep(180, 120, 0.06, 0.04, 'triangle');
      hud(); spawn();
    }
    function hardDrop() { let n = 0; while (move(0, 1)) n++; score += n * 2; lock(); }
    function over() {
      state = 'over'; overAt = performance.now(); beep(400, 90, 0.6, 0.07, 'sawtooth');
      if (score > best) { best = score; newBest = true; try { localStorage.setItem(BEST_KEY, best); } catch (e) {} }
      const res = opts.onEnd ? opts.onEnd(score) : null;
      if (res && res.record) { opts.record = res.record; opts.recordBy = res.recordBy; chatRecord = true; setRec(); }
      hud();
    }
    function act(k) {
      if (state === 'over') { if (performance.now() - overAt > 700) reset(); return; }
      if (state === 'ready') state = 'play';
      if (state !== 'play') return;
      if (k === 'left') move(-1, 0); else if (k === 'right') move(1, 0); else if (k === 'rot') rotate();
      else if (k === 'soft') { if (move(0, 1)) score += 1; else lock(); hud(); } else if (k === 'drop') hardDrop();
    }

    /* chizish */
    function block(ctx, x, y, s, color, alpha = 1) {
      ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(x + 1, y + 1, s - 2, Math.max(2, s * 0.18));
      ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(x + 1, y + s - 1 - Math.max(2, s * 0.14), s - 2, Math.max(2, s * 0.14)); ctx.globalAlpha = 1;
    }
    function draw(now) {
      g.fillStyle = '#16161A'; g.fillRect(0, 0, COLS * CELL, ROWS * CELL);
      g.strokeStyle = 'rgba(255,255,255,.04)'; for (let x = 1; x < COLS; x++) { g.beginPath(); g.moveTo(x * CELL, 0); g.lineTo(x * CELL, ROWS * CELL); g.stroke(); }
      grid.forEach((row, y) => row.forEach((t, x) => { if (t) block(g, x * CELL, y * CELL, CELL, flashRows.includes(y) ? '#FFFFFF' : COLORS[t]); }));
      if (state !== 'over' && cur) {
        const ghost = { ...cur }; while (fits({ ...ghost, y: ghost.y + 1 })) ghost.y++;
        cellsOf(ghost).forEach(([x, y]) => y >= 0 && block(g, x * CELL, y * CELL, CELL, COLORS[cur.t], 0.18));
        cellsOf(cur).forEach(([x, y]) => y >= 0 && block(g, x * CELL, y * CELL, CELL, COLORS[cur.t]));
      }
      nx.clearRect(0, 0, 80, 80); const nc = rot(SHAPES[next], SIZE[next], 0), s = 16, w = (Math.max(...nc.map(c => c[0])) + 1) * s, h = (Math.max(...nc.map(c => c[1])) + 1) * s;
      nc.forEach(([x, y]) => block(nx, (80 - w) / 2 + x * s, (80 - h) / 2 + y * s, s, COLORS[next]));
      if (state !== 'play') {
        g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, 0, COLS * CELL, ROWS * CELL); g.textAlign = 'center'; g.fillStyle = '#fff';
        g.font = `700 ${CELL * 0.9}px Unbounded, sans-serif`;
        if (state === 'ready') { g.fillText('Tetris', COLS * CELL / 2, ROWS * CELL * 0.42); g.font = `600 ${CELL * 0.5}px "Instrument Sans", sans-serif`; g.fillText('Boshlash uchun istalgan tugma', COLS * CELL / 2, ROWS * CELL * 0.52); }
        else {
          g.fillStyle = '#FF8A5B'; g.fillText('O‘yin tugadi', COLS * CELL / 2, ROWS * CELL * 0.38); g.fillStyle = '#fff';
          g.font = `700 ${CELL * 1.3}px Unbounded, sans-serif`; g.fillText(score, COLS * CELL / 2, ROWS * CELL * 0.5);
          g.font = `600 ${CELL * 0.5}px "Instrument Sans", sans-serif`;
          if (chatRecord) { g.fillStyle = '#FFC531'; g.fillText('🏆 Chat rekordi sizniki!', COLS * CELL / 2, ROWS * CELL * 0.58); g.fillStyle = '#fff'; }
          else if (newBest) g.fillText('Yangi shaxsiy rekord!', COLS * CELL / 2, ROWS * CELL * 0.58);
          g.fillText('Qayta o‘ynash uchun bosing', COLS * CELL / 2, ROWS * CELL * 0.66);
        }
      }
    }
    function loop(now) {
      const dt = Math.min(100, now - (last || now)); last = now;
      if (state === 'play' && !flashRows.length) { dropAcc += dt; if (dropAcc >= speed(level)) { dropAcc = 0; if (!move(0, 1)) lock(); } }
      draw(now); raf = requestAnimationFrame(loop);
    }

    /* boshqaruv: klaviatura, tugmalar, surish (swipe) */
    const keys = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'rot', KeyX: 'rot', ArrowDown: 'soft', Space: 'drop' };
    const onKey = e => { if (e.key === 'Escape') return close(); const k = keys[e.code]; if (k) { e.preventDefault(); act(k); } };
    let holdT = null;
    wrap.querySelectorAll('.tet-pad button').forEach(b => {
      const k = b.dataset.k;
      b.addEventListener('pointerdown', e => { e.preventDefault(); act(k); if (k === 'left' || k === 'right' || k === 'soft') { clearInterval(holdT); holdT = setTimeout(() => { holdT = setInterval(() => act(k), 55); }, 180); } });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, () => { clearTimeout(holdT); clearInterval(holdT); }));
    });
    let sx = 0, sy = 0, st = 0, moved = 0;
    board.addEventListener('pointerdown', e => { e.preventDefault(); sx = e.clientX; sy = e.clientY; st = performance.now(); moved = 0; });
    board.addEventListener('pointermove', e => {
      if (!st) return; const dx = e.clientX - sx;
      if (Math.abs(dx) > CELL) { act(dx > 0 ? 'right' : 'left'); sx = e.clientX; moved++; }
      if (e.clientY - sy > CELL * 1.2) { act('soft'); sy = e.clientY; moved++; }
    });
    board.addEventListener('pointerup', e => {
      if (!st) return; const dy = e.clientY - sy, fast = performance.now() - st < 250;
      if (!moved) act(dy > CELL * 3 && fast ? 'drop' : 'rot'); st = 0;
    });
    function close() { cancelAnimationFrame(raf); clearInterval(holdT); document.removeEventListener('keydown', onKey); wrap.remove(); }
    document.addEventListener('keydown', onKey);
    $('[data-close]').addEventListener('click', close);
    sndBtn.addEventListener('click', () => { try { localStorage.setItem(SOUND_KEY, soundOn() ? '0' : '1'); } catch (e) {} setSnd(); });
    wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
    reset(); raf = requestAnimationFrame(loop);
    return { close };
  }
  window.Tetris = { open, icon };
})();
