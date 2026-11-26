/* Lahzam mini o'yini: "Flappy" — klassik piksel uslubi. Barcha sprite'lar Lahzam uchun o'zimiz chizgan. */
(function () {
  const W = 144, H = 256, GROUND = 56, FLOOR = H - GROUND;   // o'yin piksel o'lchamda
  const PW = 26, CAP = 12, GAP = 64, SPACING = 92, SPEED = 1.05, GRAV = 0.22, FLAP = -4.2, MAXV = 7, R = 5.2;
  const BEST_KEY = 'lahzam_flappy_best', SOUND_KEY = 'lahzam_flappy_sound';

  function birdSVG(size) {
    return `<svg viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">
      <ellipse cx="30" cy="34" rx="22" ry="19" fill="#FFC531"/>
      <ellipse cx="24" cy="40" rx="11" ry="7" fill="#FFE08A"/>
      <path d="M14 34c4-7 12-8 16-3-5 1-9 4-11 9z" fill="#F29E1B"/>
      <circle cx="38" cy="27" r="7" fill="#fff"/><circle cx="40" cy="27" r="3.2" fill="#121212"/>
      <path d="M49 33l12 3-12 4z" fill="#FF5A1F"/>
    </svg>`;
  }

  /* ---------- ovoz (WebAudio) ---------- */
  let actx = null;
  const soundOn = () => { try { return localStorage.getItem(SOUND_KEY) !== '0'; } catch (e) { return true; } };
  function tone(type, f1, f2, dur, vol, delay = 0) {
    const t = actx.currentTime + delay, o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol) {
    const n = actx.createBufferSource(), b = actx.createBuffer(1, Math.ceil(actx.sampleRate * dur), actx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const g = actx.createGain(); g.gain.value = vol; n.buffer = b; n.connect(g); g.connect(actx.destination); n.start();
  }
  function sfx(kind) {
    if (!soundOn()) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      if (kind === 'flap') { tone('square', 380, 620, 0.07, 0.05); noise(0.04, 0.03); }
      if (kind === 'score') { tone('square', 988, 988, 0.06, 0.05); tone('square', 1319, 1319, 0.14, 0.05, 0.06); }
      if (kind === 'hit') { noise(0.16, 0.25); tone('sawtooth', 200, 60, 0.22, 0.1); }
      if (kind === 'fall') tone('triangle', 560, 120, 0.42, 0.08);
      if (kind === 'swoosh') { noise(0.18, 0.05); tone('sine', 300, 900, 0.18, 0.03); }
      if (kind === 'record') [784, 988, 1175, 1568].forEach((f, i) => tone('square', f, f, 0.12, 0.05, i * 0.1));
    } catch (e) { /* ovozsiz ham ishlayveradi */ }
  }

  /* ---------- piksel sprite'lar (o'zimizniki) ---------- */
  const PAL = { k: '#3B2410', y: '#FFC531', l: '#FFE9A8', o: '#F39A1E', O: '#C8700E', w: '#FFFFFF', e: '#121212', r: '#FF5A1F' };
  const BODY = [
    '.....kkkkkk......',
    '...kkyyyyyykk....',
    '..kyyyyyyyywyk...',
    '.kyyyyyyyyyeyk...',
    'kyyyyyyyyyyyyykk.',
    'kyyyyyyylllyyrrrk',
    'kyyyyyyllllyyrrk.',
    '.kyyyyylllllyyk..',
    '..kyyyyylllyyk...',
    '...kkyyyyyykk....',
    '.....kkkkkk......'
  ];
  const WINGS = [
    { y: 3, rows: ['.ooo.', 'ooooo', 'OOOO.'] },
    { y: 4, rows: ['ooooo', 'ooooo', 'OOOO.'] },
    { y: 5, rows: ['ooooo', 'oooo.', '.OO..'] }
  ];
  const DEAD_EYE = [[10, 2, 'e'], [12, 2, 'e'], [11, 3, 'e'], [10, 4, 'e'], [12, 4, 'e']];
  function sprite(w, h, fn) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); fn(x); return c; }
  function paint(x, rows, ox = 0, oy = 0) { rows.forEach((row, j) => [...row].forEach((ch, i) => { if (PAL[ch]) { x.fillStyle = PAL[ch]; x.fillRect(ox + i, oy + j, 1, 1); } })); }
  const BIRD = WINGS.map(wg => sprite(17, 12, x => { paint(x, BODY); paint(x, wg.rows, 1, wg.y); }));
  const BIRD_DEAD = sprite(17, 12, x => { paint(x, BODY); paint(x, WINGS[1].rows, 1, WINGS[1].y); x.fillStyle = PAL.w; x.fillRect(10, 2, 3, 3); DEAD_EYE.forEach(([a, b, c]) => { x.fillStyle = PAL[c]; x.fillRect(a, b - 0, 1, 1); }); });

  // 5x7 piksel raqamlar
  const DIG = {
    0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'], 1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
    2: ['01110', '10001', '00001', '00110', '01000', '10000', '11111'], 3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
    4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'], 5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
    6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'], 7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
    8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'], 9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100']
  };
  function digits(x, n, cx, y, s = 1, color = '#fff') {
    const str = String(n), w = (str.length * 6 - 1) * s; let px = Math.round(cx - w / 2);
    for (const ch of str) {
      const g = DIG[ch];
      // qora kontur
      x.fillStyle = '#121212';
      g.forEach((r, j) => [...r].forEach((b, i) => { if (b === '1') x.fillRect(px + i * s - s, y + j * s - s, s * 3, s * 3); }));
      x.fillStyle = color;
      g.forEach((r, j) => [...r].forEach((b, i) => { if (b === '1') x.fillRect(px + i * s, y + j * s, s, s); }));
      px += 6 * s;
    }
  }

  /* ---------- fon (kunduz / tun) ---------- */
  const THEMES = {
    day: { sky: '#6CC8E6', cloud: '#E9FCD9', cloud2: '#CFF0E0', city: '#A7DFC9', win: '#D2F2E4', bush: '#5EC84E', bush2: '#4BB040' },
    dusk: { sky: '#F2A26B', cloud: '#FFD9B0', cloud2: '#F7C08F', city: '#C9786E', win: '#FFD49A', bush: '#6E9A48', bush2: '#5A853B' },
    night: { sky: '#123A63', cloud: '#2A5684', cloud2: '#1F4B78', city: '#21466E', win: '#FFD566', bush: '#2F6B3A', bush2: '#245A2F' }
  };
  function backdrop(T, night) {
    return sprite(W, FLOOR, x => {
      x.fillStyle = T.sky; x.fillRect(0, 0, W, FLOOR);
      if (night) { x.fillStyle = '#FFFFFF'; for (let i = 0; i < 40; i++) x.fillRect((i * 37) % W, (i * 53) % 110, 1, 1); x.fillStyle = '#F4F1E1'; x.fillRect(104, 18, 8, 8); x.fillRect(103, 19, 10, 6); x.fillStyle = T.sky; x.fillRect(107, 17, 7, 7); }
      // bulutlar
      const cy = FLOOR - 58;
      for (let i = -6; i < W + 12; i += 12) { const h = 6 + ((i * 7) & 7); x.fillStyle = T.cloud2; x.fillRect(i, cy - h, 14, h + 30); x.fillStyle = T.cloud; x.fillRect(i + 1, cy - h + 1, 12, h + 30); }
      // shahar
      let bx = 0, k = 3;
      while (bx < W) { k = (k * 17 + 11) % 29; const bw = 10 + (k % 9), bh = 18 + (k % 22); x.fillStyle = T.city; x.fillRect(bx, FLOOR - 16 - bh, bw, bh + 16); x.fillStyle = T.win; for (let wy = FLOOR - 13 - bh; wy < FLOOR - 18; wy += 5) for (let wx = bx + 2; wx < bx + bw - 2; wx += 3) if (!night || (wx + wy) % 3) x.fillRect(wx, wy, 1, 2); bx += bw + 1; }
      // butalar
      for (let i = -4; i < W + 8; i += 9) { const h = 7 + ((i * 5) & 3); x.fillStyle = T.bush2; x.fillRect(i, FLOOR - 9 - h, 11, h + 9); x.fillStyle = T.bush; x.fillRect(i + 1, FLOOR - 8 - h, 9, h + 8); }
    });
  }

  function open(opts) {
    const wrap = document.createElement('div');
    wrap.className = 'game-wrap';
    wrap.innerHTML = `<div class="game-box" role="dialog" aria-label="Flappy o'yini">
      <div class="row" style="justify-content:space-between;margin-bottom:10px">
        <div class="row" style="gap:8px">${birdSVG(34)}<div><b style="display:block">Flappy</b>
        <span style="font-size:12px;color:#bbb" data-rec></span></div></div>
        <div class="row" style="gap:6px">
          <button class="ibtn" data-sound aria-label="Ovoz" style="background:#2a2a2a"></button>
          <button class="ibtn" data-close aria-label="Yopish" style="background:#2a2a2a">✕</button>
        </div>
      </div>
      <canvas aria-label="O'yin maydoni" style="display:block;width:min(100%, calc(74vh * ${W / H}));height:auto;margin:0 auto;image-rendering:pixelated;border-radius:14px"></canvas>
      <p style="text-align:center;font-size:13px;color:#bbb;margin:10px 0 0">Bosing yoki probel — qush sakraydi</p>
    </div>`;
    document.body.appendChild(wrap);
    const S = Math.max(3, Math.round(3 * Math.min(2, window.devicePixelRatio || 1)));
    const cv = wrap.querySelector('canvas'), out = cv.getContext('2d');
    cv.width = W * S; cv.height = H * S;
    const lo = document.createElement('canvas'); lo.width = W; lo.height = H;
    const g = lo.getContext('2d');
    g.imageSmoothingEnabled = false; out.imageSmoothingEnabled = false;
    const recEl = wrap.querySelector('[data-rec]'), sndBtn = wrap.querySelector('[data-sound]');
    const setRec = () => { recEl.textContent = opts.record ? `Chat rekordi: ${opts.record} (@${opts.recordBy})` : 'Bu chatda hali rekord yo‘q'; };
    const setSnd = () => { sndBtn.textContent = soundOn() ? '🔊' : '🔇'; };
    setRec(); setSnd();
    let best = 0; try { best = +localStorage.getItem(BEST_KEY) || 0; } catch (e) {}
    const scenes = {};
    let theme, bg, bird, pipes, score, state, t, scroll, shake, flash, pop, overT, endAt, newBest, chatRecord, raf;

    function reset() {
      const r = Math.random(), name = r < 0.6 ? 'day' : r < 0.8 ? 'dusk' : 'night';
      theme = name; bg = scenes[name] || (scenes[name] = backdrop(THEMES[name], name === 'night'));
      bird = { x: 40, y: 110, vy: 0, rot: 0, frame: 0, since: 99 };
      pipes = []; score = 0; state = 'ready'; t = 0; scroll = 0; shake = 0; flash = 0; pop = 0; overT = 0; newBest = false; chatRecord = false;
    }
    function flap() {
      if (state === 'over') { if (performance.now() - endAt > 600) { reset(); sfx('swoosh'); } return; }
      if (state === 'dying') return;
      if (state === 'ready') state = 'play';
      bird.vy = FLAP; bird.since = 0; sfx('flap');
    }
    function addPipe() {
      const prev = pipes[pipes.length - 1];
      let mid = 50 + Math.random() * (FLOOR - 100);
      if (prev) mid = Math.max(prev.mid - 70, Math.min(prev.mid + 70, mid));
      pipes.push({ x: W + 4, mid: Math.round(mid), passed: false });
    }
    function die() {
      state = 'dying'; shake = 6; flash = 1; sfx('hit'); setTimeout(() => state === 'dying' && sfx('fall'), 200);
      if (score > best) { best = score; newBest = true; try { localStorage.setItem(BEST_KEY, best); } catch (e) {} }
      const res = opts.onEnd ? opts.onEnd(score) : null;
      if (res && res.record) { opts.record = res.record; opts.recordBy = res.recordBy; chatRecord = true; setRec(); setTimeout(() => sfx('record'), 500); }
    }
    function update() {
      t++;
      if (state === 'ready') { bird.y = 110 + Math.sin(t / 9) * 3; if (t % 6 === 0) bird.frame = (bird.frame + 1) % 3; scroll += SPEED; }
      if (state === 'play' || state === 'dying') { bird.vy = Math.min(MAXV, bird.vy + GRAV); bird.y += bird.vy; bird.since++; if (bird.y < -12) { bird.y = -12; bird.vy = 0; } }
      if (state === 'play') {
        if (t % (bird.vy < 0 ? 4 : 7) === 0) bird.frame = (bird.frame + 1) % 3;
        bird.rot = bird.since < 14 ? Math.max(-0.45, bird.rot - 0.15) : Math.min(1.5, bird.rot + 0.06);
        scroll += SPEED;
        if (!pipes.length || pipes[pipes.length - 1].x < W - SPACING) addPipe();
        for (const p of pipes) {
          p.x -= SPEED;
          if (!p.passed && p.x + PW < bird.x) { p.passed = true; score++; pop = 1; sfx('score'); }
          const top = p.mid - GAP / 2, bot = p.mid + GAP / 2;
          if (bird.x + R > p.x && bird.x - R < p.x + PW && (bird.y - R < top || bird.y + R > bot)) { die(); break; }
        }
        pipes = pipes.filter(p => p.x > -PW - 4);
        if (state === 'play' && bird.y + R >= FLOOR) { bird.y = FLOOR - R; die(); }
      }
      if (state === 'dying') { bird.rot = Math.min(1.57, bird.rot + 0.12); if (bird.y + R >= FLOOR) { bird.y = FLOOR - R; state = 'over'; endAt = performance.now(); } }
      if (state === 'over') overT = Math.min(1, overT + 0.07);
      shake = Math.max(0, shake - 0.4); flash = Math.max(0, flash - 0.08); pop = Math.max(0, pop - 0.1);
    }

    /* ---------- chizish ---------- */
    function pipe(x, y, h, capBottom) {
      x = Math.round(x); if (h <= 0) return;
      const cols = ['#2E5512', '#9CE659', '#B8F07A', '#86D44A', '#74BF2E', '#74BF2E', '#5DA526', '#4A8F1C', '#3E7A16', '#2E5512'];
      const step = PW / cols.length;
      for (let i = 0; i < cols.length; i++) { g.fillStyle = cols[i]; g.fillRect(x + Math.floor(i * step), y, Math.ceil(step), h); }
      const cy = capBottom ? y + h - CAP : y, cx = x - 2, cw = PW + 4;
      const cst = cw / cols.length;
      for (let i = 0; i < cols.length; i++) { g.fillStyle = cols[i]; g.fillRect(cx + Math.floor(i * cst), cy, Math.ceil(cst), CAP); }
      g.fillStyle = '#2E5512'; g.fillRect(cx, cy, cw, 1); g.fillRect(cx, cy + CAP - 1, cw, 1); g.fillRect(cx, cy, 1, CAP); g.fillRect(cx + cw - 1, cy, 1, CAP);
    }
    function ground() {
      const off = Math.floor(scroll) % 8;
      g.fillStyle = '#DED895'; g.fillRect(0, FLOOR, W, GROUND);
      g.fillStyle = '#543847'; g.fillRect(0, FLOOR, W, 1);
      for (let x = -off - 8; x < W + 8; x += 8) { g.fillStyle = '#9CE659'; g.fillRect(x, FLOOR + 1, 4, 5); g.fillStyle = '#73BF2E'; g.fillRect(x + 4, FLOOR + 1, 4, 5); }
      g.fillStyle = '#558022'; g.fillRect(0, FLOOR + 6, W, 1);
      g.fillStyle = '#D7A84C'; g.fillRect(0, FLOOR + 7, W, 2);
      g.fillStyle = '#E8E19E'; for (let x = -off * 2 - 16; x < W; x += 16) g.fillRect(x, FLOOR + 16, 8, 1);
    }
    function drawBird() {
      const img = state === 'over' || state === 'dying' ? BIRD_DEAD : BIRD[bird.frame];
      g.save(); g.translate(Math.round(bird.x), Math.round(bird.y)); g.rotate(bird.rot);
      g.drawImage(img, -9, -6); g.restore();
    }
    function render() {
      const sx = shake > 0.5 ? Math.round((Math.random() - 0.5) * shake) : 0, sy = shake > 0.5 ? Math.round((Math.random() - 0.5) * shake) : 0;
      g.setTransform(1, 0, 0, 1, sx, sy);
      g.drawImage(bg, -Math.floor(scroll * 0.25) % W, 0); g.drawImage(bg, W - Math.floor(scroll * 0.25) % W, 0);
      for (const p of pipes) { pipe(p.x, -2, p.mid - GAP / 2 + 2, true); pipe(p.x, p.mid + GAP / 2, FLOOR - (p.mid + GAP / 2), false); }
      ground();
      drawBird();
      if (state === 'play' || state === 'dying') digits(g, score, W / 2, 18 - Math.round(pop * 2), 2);
      g.setTransform(1, 0, 0, 1, 0, 0);
      if (flash > 0) { g.fillStyle = `rgba(255,255,255,${flash})`; g.fillRect(0, 0, W, H); }
      out.drawImage(lo, 0, 0, W * S, H * S);
      ui();
    }
    // Yozuvlar katta kanvasda (tiniq), o'yin esa piksel
    const U = n => n * S;
    function label(s, x, y, size, fill, lw = 3) {
      out.font = `700 ${U(size)}px Unbounded, sans-serif`; out.textAlign = 'center'; out.lineJoin = 'round';
      out.lineWidth = U(lw); out.strokeStyle = '#3B2410'; out.strokeText(s, U(x), U(y)); out.fillStyle = fill; out.fillText(s, U(x), U(y));
    }
    function box(x, y, w, h) {
      out.fillStyle = '#543847'; out.fillRect(U(x), U(y), U(w), U(h));
      out.fillStyle = '#DED895'; out.fillRect(U(x + 1), U(y + 1), U(w - 2), U(h - 2));
      out.fillStyle = '#E8E19E'; out.fillRect(U(x + 3), U(y + 3), U(w - 6), U(h - 6));
    }
    function medal(cx, cy) {
      const m = score >= 40 ? ['#E5F3FF', '#9CC7E8'] : score >= 30 ? ['#FFE680', '#E3B341'] : score >= 20 ? ['#F1F1F1', '#B5B5B5'] : score >= 10 ? ['#F4C08A', '#C07A3A'] : null;
      const px = (x, y, w, h, c) => { out.fillStyle = c; out.fillRect(U(x), U(y), U(w), U(h)); };
      if (!m) { px(cx - 11, cy - 11, 22, 22, '#CDBF7A'); return; }
      px(cx - 11, cy - 9, 22, 18, m[1]); px(cx - 9, cy - 11, 18, 22, m[1]); px(cx - 9, cy - 9, 18, 18, m[0]);
      px(cx - 1, cy - 6, 2, 12, '#FFFFFF'); px(cx - 6, cy - 1, 12, 2, '#FFFFFF'); px(cx - 3, cy - 3, 6, 6, '#FFFFFF');
    }
    function ui() {
      if (state === 'ready') {
        label('Tayyormisiz?', W / 2, 62, 15, '#FFC531');
        out.globalAlpha = 0.65 + Math.sin(t / 8) * 0.35;
        label('Bosing — uchadi', W / 2, 150, 8, '#FFFFFF', 2.4);
        out.globalAlpha = 1;
        if (best) label(`Eng yaxshi: ${best}`, W / 2, 80, 7, '#FFFFFF', 2.2);
      }
      if (state === 'over') {
        const e = 1 - Math.pow(1 - overT, 3), oy = (1 - e) * 60;
        out.globalAlpha = e;
        label('O‘yin tugadi', W / 2, 62 + oy, 15, '#FF8A5B');
        box(14, 76 + oy, W - 28, 64);
        medal(40, 108 + oy);
        out.textAlign = 'right'; out.fillStyle = '#C2410C'; out.font = `700 ${U(6)}px "Instrument Sans", sans-serif`;
        out.fillText('NATIJA', U(W - 22), U(90 + oy)); out.fillText('ENG YAXSHI', U(W - 22), U(116 + oy));
        const big = (n, y) => { out.font = `700 ${U(12)}px Unbounded, sans-serif`; out.lineWidth = U(2.5); out.strokeStyle = '#3B2410'; out.strokeText(n, U(W - 22), U(y)); out.fillStyle = '#fff'; out.fillText(n, U(W - 22), U(y)); };
        big(score, 104 + oy); big(best, 130 + oy);
        if (newBest) { out.fillStyle = '#FF5A1F'; out.fillRect(U(60), U(122 + oy), U(24), U(9)); out.fillStyle = '#fff'; out.textAlign = 'center'; out.font = `700 ${U(6)}px "Instrument Sans", sans-serif`; out.fillText('YANGI', U(72), U(129 + oy)); }
        if (chatRecord) label('🏆 Chat rekordi sizniki!', W / 2, 156 + oy, 8, '#FFC531', 2.4);
        if (performance.now() - endAt > 600) { out.globalAlpha = e * (0.65 + Math.sin(t / 8) * 0.35); label('Qayta o‘ynash uchun bosing', W / 2, chatRecord ? 172 : 160, 7, '#FFFFFF', 2.2); }
        out.globalAlpha = 1;
      }
    }

    let last = performance.now(), acc = 0;
    function loop(now) {
      acc += Math.min(100, now - last); last = now;
      while (acc >= 1000 / 60) { update(); acc -= 1000 / 60; }
      render(); raf = requestAnimationFrame(loop);
    }
    const onKey = e => { if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); flap(); } if (e.key === 'Escape') close(); };
    function close() { cancelAnimationFrame(raf); document.removeEventListener('keydown', onKey); wrap.remove(); }
    cv.addEventListener('pointerdown', e => { e.preventDefault(); flap(); });
    document.addEventListener('keydown', onKey);
    wrap.querySelector('[data-close]').addEventListener('click', close);
    sndBtn.addEventListener('click', () => { try { localStorage.setItem(SOUND_KEY, soundOn() ? '0' : '1'); } catch (e) {} setSnd(); });
    wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
    reset(); raf = requestAnimationFrame(loop);
    return { close };
  }
  window.Flappy = { open, birdSVG };
})();
