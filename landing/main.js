{
  const APP_URL = 'https://lahzam-app.vercel.app';
  for (const a of document.querySelectorAll('[data-app]')) a.href = APP_URL + a.dataset.app;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // scroll bo'yicha paydo bo'lish
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .15 });
  document.querySelectorAll('.rv').forEach(el => io.observe(el));
  addEventListener('scroll', () => { const h = document.documentElement; document.getElementById('bar').style.width = (h.scrollTop / (h.scrollHeight - h.clientHeight) * 100) + '%'; }, { passive: true });

  // aylanuvchi so'zlar
  const rs = [...document.querySelectorAll('#rot span')]; let ri = 0;
  setInterval(() => { rs[ri].classList.remove('on'); ri = (ri + 1) % rs.length; rs[ri].classList.add('on'); }, 2200);

  // telefon sichqonchaga ergashadi
  const ph = document.getElementById('phone');
  if (!reduce && matchMedia('(pointer:fine)').matches) addEventListener('mousemove', e => { const x = e.clientX / innerWidth - .5, y = e.clientY / innerHeight - .5; ph.style.transform = `rotateY(${-14 + x * 18}deg) rotateX(${6 - y * 12}deg) rotate(2deg)`; });

  // telefondagi lenta: postlar birin-ketin tushadi
  const POSTS = [
    ['Jasur', '4 daq', 'O‘zbekistonda eng ko‘p vaqtni nimaga yo‘qotamiz? Menimcha tirbandlikka 🚗', 214, 18],
    ['Aziza', '40 daq', 'Kitob tavsiya qiling: qishda o‘qish uchun issiq roman 📚 <b style="color:#C2410C">#kitob</b>', 96, 22],
    ['Bekzod', '1 soat', 'Do‘konimga birinchi onlayn buyurtma keldi. Alhamdulillah 🤲', 301, 40],
    ['Madina', '2 soat', 'IELTS 7.5 oldim!!! 🎉 Hammaga rahmat', 512, 63],
    ['Sardor', '3 soat', 'Guruhda Tetris turniri boshlandi, kim qo‘shiladi? 🧱', 77, 12]
  ];
  const feed = document.getElementById('feed'); let pi = 0;
  const card = p => `<div class="s-card"><b>${p[0]}</b> <span style="color:#777">· ${p[1]}</span><div>${p[2]}</div><div class="s-row"><span class="s-pill h">♥ ${p[3]}</span><span class="s-pill">${p[4]} javob</span></div></div>`;
  function nextPost() {
    feed.insertAdjacentHTML('afterbegin', card(POSTS[pi % POSTS.length])); pi++;
    while (feed.children.length > 3) feed.lastElementChild.remove();
    if (!reduce) { const h = document.createElement('span'); h.className = 'heart-pop'; h.textContent = '❤️'; h.style.left = (30 + Math.random() * 50) + '%'; h.style.top = '45%'; ph.querySelector('.screen').appendChild(h); setTimeout(() => h.remove(), 1300); }
  }
  nextPost(); nextPost(); setInterval(nextPost, 2800);

  // telefondagi menyu: oq fon suriladi
  const dk = document.getElementById('sdock'), ind = document.getElementById('sind'), tabs = [...dk.querySelectorAll('span:not(.s-ind):not(.plus)')]; let ti = 0;
  const putInd = () => { const t = tabs[ti]; ind.style.left = t.offsetLeft + 'px'; ind.style.width = t.offsetWidth + 'px'; tabs.forEach((x, i) => x.classList.toggle('on', i === ti)); };
  putInd(); setInterval(() => { ti = (ti + 1) % tabs.length; putInd(); }, 2400);

  // kun savoli: savol yoziladi, javoblar paydo bo'ladi
  const QS = [['Bugun sizni nima xursand qildi?', [['Madina', 'Onam pishirgan palov 😋'], ['Jasur', 'Imtihondan o‘tdim!'], ['Aziza', 'Ertalabki qor ❄️']]],
    ['Choy yoki qahva? ☕', [['Bekzod', 'Albatta choy, ko‘k choy 🍵'], ['Sardor', 'Ertalab qahva, kechqurun choy'], ['Nilufar', 'Limonli choy!']]],
    ['Qaysi shaharga borishni orzu qilasiz?', [['Aziz', 'Istanbul 🕌'], ['Malika', 'Samarqandni qayta ko‘rmoqchiman'], ['Javohir', 'Tokio 🇯🇵']]]];
  const qt = document.getElementById('qtext'), qa = document.getElementById('qans'); let qi = 0, started = false;
  async function runQ() {
    const [q, ans] = QS[qi++ % QS.length]; qa.innerHTML = ''; qt.innerHTML = '<span class="caret"></span>';
    for (let i = 1; i <= q.length; i++) { qt.innerHTML = q.slice(0, i) + '<span class="caret"></span>'; await new Promise(r => setTimeout(r, reduce ? 0 : 38)); }
    for (const [n, t] of ans) { await new Promise(r => setTimeout(r, 650)); const d = document.createElement('div'); d.className = 'qa'; d.innerHTML = `<b>${n}</b> ${t}`; qa.appendChild(d); requestAnimationFrame(() => requestAnimationFrame(() => d.classList.add('in'))); }
    setTimeout(runQ, 3200);
  }
  new IntersectionObserver((es, o) => { if (es[0].isIntersecting && !started) { started = true; runQ(); o.disconnect(); } }, { threshold: .3 }).observe(document.getElementById('qcard'));

  // chatdagi X/O: xabarlar chiqadi va o'yin o'ynaladi
  const chat = document.getElementById('chat'), ms = [...chat.querySelectorAll('.m')], cells = [...document.querySelectorAll('#xo i')], sys = document.getElementById('xosys');
  const MOVES = [[4, 'x'], [0, 'o'], [2, 'x'], [6, 'o'], [3, 'x'], [8, 'o'], [5, 'x']], WIN = [3, 4, 5];
  async function runChat() {
    const w = ms => new Promise(r => setTimeout(r, reduce ? 0 : ms));
    while (true) {
      ms.forEach(m => m.classList.remove('show')); sys.classList.remove('show'); cells.forEach(c => { c.className = ''; c.textContent = ''; });
      for (const m of ms) { await w(600); m.classList.add('show'); }
      for (const [i, s] of MOVES) { await w(650); cells[i].textContent = s === 'x' ? '✕' : '○'; cells[i].className = s + ' pop'; }
      await w(300); WIN.forEach(i => cells[i].classList.add('win')); await w(300); sys.classList.add('show');
      await w(3500);
    }
  }
  new IntersectionObserver((es, o) => { if (es[0].isIntersecting) { runChat(); o.disconnect(); } }, { threshold: .3 }).observe(chat);
}
