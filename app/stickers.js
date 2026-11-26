/* Lahzam stikerlari: "Lahzamcha" qahramoni, butunlay o'zimiz chizgan SVG */
(function () {
  // har stiker: [kalit, yozuv, tana rangi, ko'z, og'iz, qo'shimcha]
  const LIST = [
    ['salom', 'Assalomu alaykum!', '#FF5A1F', 'happy', 'smile', 'wave'],
    ['rahmat', 'Rahmat!', '#FF7A45', 'closed', 'smile', 'hearts'],
    ['haha', 'Haha!', '#FFC531', 'laugh', 'open', 'tears'],
    ['zor', 'Zo‘r!', '#5EC84E', 'happy', 'grin', 'thumb'],
    ['ha', 'Ha!', '#4C7DFF', 'happy', 'smile', 'check'],
    ['yoq', 'Yo‘q', '#8C8C99', 'flat', 'flat', 'cross'],
    ['voy', 'Voy!', '#B07CFF', 'wide', 'o', 'spark'],
    ['sevaman', 'Yaxshi ko‘raman', '#FF5A7A', 'heart', 'smile', 'heart'],
    ['kutaman', 'Kutaman…', '#5FD3F3', 'side', 'flat', 'clock'],
    ['tun', 'Xayrli tun', '#3B3F72', 'closed', 'small', 'moon'],
    ['jahl', 'Grr…', '#E8423A', 'angry', 'frown', 'steam'],
    ['tabrik', 'Tabriklayman!', '#FF8A2B', 'closed', 'open', 'confetti'],
    ['omad', 'Omad!', '#2BB673', 'happy', 'grin', 'star'],
    ['xafa', 'Xafa bo‘ldim', '#7A8CA8', 'sad', 'frown', 'drop'],
    ['ishla', 'Ishlayapman', '#121212', 'focus', 'flat', 'laptop'],
    ['duo', 'Alloh rozi bo‘lsin', '#1F9E8A', 'closed', 'smile', 'hands']
  ];
  const eyes = {
    happy: '<path d="M54 66q6-8 12 0M94 66q6-8 12 0" stroke="#121212" stroke-width="5" fill="none" stroke-linecap="round"/>',
    closed: '<path d="M53 64q7 7 14 0M93 64q7 7 14 0" stroke="#121212" stroke-width="5" fill="none" stroke-linecap="round"/>',
    laugh: '<path d="M52 60l12 6-12 6M108 60l-12 6 12 6" stroke="#121212" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    flat: '<path d="M53 66h14M93 66h14" stroke="#121212" stroke-width="5" stroke-linecap="round"/>',
    wide: '<circle cx="60" cy="64" r="9" fill="#fff"/><circle cx="100" cy="64" r="9" fill="#fff"/><circle cx="60" cy="65" r="4.5" fill="#121212"/><circle cx="100" cy="65" r="4.5" fill="#121212"/>',
    heart: '<path d="M60 74l-8-8a5 5 0 0 1 8-6 5 5 0 0 1 8 6zM100 74l-8-8a5 5 0 0 1 8-6 5 5 0 0 1 8 6z" fill="#fff"/>',
    side: '<circle cx="64" cy="64" r="5" fill="#121212"/><circle cx="104" cy="64" r="5" fill="#121212"/>',
    angry: '<path d="M50 56l16 6M110 56l-16 6" stroke="#121212" stroke-width="5" stroke-linecap="round"/><circle cx="60" cy="68" r="4.5" fill="#121212"/><circle cx="100" cy="68" r="4.5" fill="#121212"/>',
    sad: '<path d="M52 60l14-4M108 60l-14-4" stroke="#121212" stroke-width="4" stroke-linecap="round"/><circle cx="60" cy="68" r="4.5" fill="#121212"/><circle cx="100" cy="68" r="4.5" fill="#121212"/>',
    focus: '<rect x="48" y="58" width="26" height="16" rx="6" fill="none" stroke="#fff" stroke-width="4"/><rect x="86" y="58" width="26" height="16" rx="6" fill="none" stroke="#fff" stroke-width="4"/><path d="M74 66h12" stroke="#fff" stroke-width="4"/><circle cx="61" cy="66" r="3.5" fill="#fff"/><circle cx="99" cy="66" r="3.5" fill="#fff"/>'
  };
  const mouths = {
    smile: '<path d="M66 86q14 12 28 0" stroke="#121212" stroke-width="5" fill="none" stroke-linecap="round"/>',
    grin: '<path d="M62 84h36q-4 16-18 16t-18-16z" fill="#121212"/><path d="M68 85h24v5H68z" fill="#fff"/>',
    open: '<path d="M64 84h32q-2 20-16 20t-16-20z" fill="#121212"/><path d="M72 98q8-6 16 0" fill="#FF8FA3"/>',
    flat: '<path d="M68 92h24" stroke="#121212" stroke-width="5" stroke-linecap="round"/>',
    o: '<ellipse cx="80" cy="92" rx="8" ry="10" fill="#121212"/>',
    small: '<path d="M73 90q7 5 14 0" stroke="#121212" stroke-width="4" fill="none" stroke-linecap="round"/>',
    frown: '<path d="M66 96q14-12 28 0" stroke="#121212" stroke-width="5" fill="none" stroke-linecap="round"/>'
  };
  const extras = {
    wave: '<g transform="rotate(-18 128 60)"><rect x="118" y="34" width="22" height="30" rx="11" fill="#FFD9C7" stroke="#121212" stroke-width="3"/></g><path d="M140 28q8 4 8 14M146 22q10 6 10 20" stroke="#121212" stroke-width="3" fill="none" stroke-linecap="round"/>',
    hearts: '<path d="M134 34l-7-7a4.5 4.5 0 0 1 7-5.5 4.5 4.5 0 0 1 7 5.5z" fill="#FF3B5C"/><path d="M24 44l-5-5a3.3 3.3 0 0 1 5-4 3.3 3.3 0 0 1 5 4z" fill="#FF3B5C"/>',
    tears: '<path d="M46 76q-6 10 0 14q6-4 0-14zM114 76q-6 10 0 14q6-4 0-14z" fill="#5FD3F3"/>',
    thumb: '<path d="M122 92h10V70l8-16q8 0 6 10l-3 10h12q6 0 5 7l-4 16q-2 5-7 5h-27z" fill="#FFD9C7" stroke="#121212" stroke-width="3" stroke-linejoin="round"/>',
    check: '<circle cx="134" cy="36" r="16" fill="#fff" stroke="#121212" stroke-width="3"/><path d="M126 36l6 6 10-12" stroke="#2BB673" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    cross: '<circle cx="134" cy="36" r="16" fill="#fff" stroke="#121212" stroke-width="3"/><path d="M127 29l14 14M141 29l-14 14" stroke="#E8423A" stroke-width="5" stroke-linecap="round"/>',
    spark: '<path d="M134 18l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" fill="#FFC531" stroke="#121212" stroke-width="2.5" stroke-linejoin="round"/>',
    heart: '<path d="M134 52l-13-13a8 8 0 0 1 13-10 8 8 0 0 1 13 10z" fill="#FF3B5C" stroke="#121212" stroke-width="3" stroke-linejoin="round"/>',
    clock: '<circle cx="134" cy="36" r="17" fill="#fff" stroke="#121212" stroke-width="3"/><path d="M134 26v10l7 5" stroke="#121212" stroke-width="3.5" fill="none" stroke-linecap="round"/>',
    moon: '<path d="M142 18a16 16 0 1 0 8 28 13 13 0 0 1-8-28z" fill="#FFE27A" stroke="#121212" stroke-width="3"/><text x="18" y="44" font-size="16" font-weight="800" fill="#fff" font-family="sans-serif">z z</text>',
    steam: '<path d="M30 30q6 6 0 12q-6 6 0 12M130 30q6 6 0 12q-6 6 0 12" stroke="#B0B0B0" stroke-width="4" fill="none" stroke-linecap="round"/>',
    confetti: '<rect x="122" y="20" width="7" height="7" rx="2" fill="#FFC531" transform="rotate(20 125 23)"/><rect x="140" y="34" width="7" height="7" rx="2" fill="#4C7DFF"/><circle cx="26" cy="30" r="4" fill="#5EC84E"/><rect x="34" y="16" width="6" height="6" rx="2" fill="#FF3B5C"/><circle cx="146" cy="16" r="3.5" fill="#B07CFF"/>',
    star: '<path d="M134 16l5 11 12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1z" fill="#FFC531" stroke="#121212" stroke-width="2.5" stroke-linejoin="round"/>',
    drop: '<path d="M112 72q-6 10 0 14q6-4 0-14z" fill="#5FD3F3"/>',
    laptop: '<rect x="44" y="104" width="72" height="8" rx="3" fill="#B0B0B0"/><rect x="50" y="88" width="60" height="18" rx="3" fill="#3A3A3A"/>',
    hands: '<path d="M44 112q-6-22 6-30l6 18zM116 112q6-22-6-30l-6 18z" fill="#FFD9C7" stroke="#121212" stroke-width="3" stroke-linejoin="round"/>'
  };
  function svg(k) {
    const s = LIST.find(x => x[0] === k); if (!s) return '';
    const [, label, color, e, m, x] = s, dark = color === '#121212' || color === '#3B3F72';
    return `<svg viewBox="0 0 160 160" width="100%" height="100%" role="img" aria-label="${label}">
      <ellipse cx="80" cy="128" rx="44" ry="6" fill="rgba(0,0,0,.12)"/>
      <path d="M40 40a22 22 0 0 1 22-22h36a22 22 0 0 1 22 22v44a28 28 0 0 1-28 28H54l-14 12z" fill="${color}" stroke="#121212" stroke-width="4" stroke-linejoin="round"/>
      <circle cx="106" cy="32" r="7" fill="${dark ? '#FF5A1F' : '#121212'}"/>
      ${e === 'heart' || e === 'focus' ? '' : '<ellipse cx="50" cy="82" rx="7" ry="4" fill="rgba(255,255,255,.35)"/><ellipse cx="110" cy="82" rx="7" ry="4" fill="rgba(255,255,255,.35)"/>'}
      ${dark ? eyes[e].replace(/#121212/g, '#fff') : eyes[e]}${dark ? mouths[m].replace(/#121212/g, '#fff') : mouths[m]}${extras[x] || ''}
      <g transform="translate(80 146)"><rect x="${-label.length * 4.6 - 10}" y="-13" width="${label.length * 9.2 + 20}" height="24" rx="12" fill="#fff" stroke="#121212" stroke-width="3"/>
      <text y="4" text-anchor="middle" font-size="14" font-weight="800" fill="#121212" font-family="Unbounded, Instrument Sans, sans-serif">${label}</text></g></svg>`;
  }
  window.Stickers = { list: LIST.map(x => x[0]), label: k => (LIST.find(x => x[0] === k) || [])[1], svg, re: /^\[s:([a-z]+)\]$/ };
})();
