// Toza muhit: haqoratli so'zlar avtomatik *** bilan yopiladi (o'zbek, rus; lotin va kirill)
const ROOTS = [
  'х[уy][йиеёяю]', 'п[иi]зд', 'бля', 'ебат', 'ебан', 'ёб[аа-я]', 'еб[ауи]', 'сук[аи]', 'мудак', 'пидор', 'пидар', 'залуп', 'шлюх', 'гандон', 'дебил',
  'xu[yi]', 'hu[yi]', 'pizd', 'bly[a@]', 'blyat', 'yeban', 'eban', 'suka', 'mudak', 'pid[oa]r', 'zalup', 'shlyux', 'gandon',
  'jalab', 'жалаб', 'qanjiq', 'қанжиқ', 'qo[\'‘ʻ`]?taq', 'қўтоқ', 'siktir', 'сиктир', 'sik(?:ay|aman|dim|ib|ish|aver)', 'сик(?:ай|аман|дим|иб|иш)', 'onangni\\s*s', 'онангни\\s*с', 'fohisha', 'фоҳиша', 'iflos', 'ифлос'
];
const RE = new RegExp(`(^|[^\\p{L}])(${ROOTS.join('|')})[\\p{L}]*`, 'giu');
export const clean = t => String(t || '').replace(RE, (m, pre, w) => pre + '*'.repeat(Math.min(8, m.length - pre.length)));
