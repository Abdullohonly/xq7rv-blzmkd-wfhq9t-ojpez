/* Lahzam huquqiy hujjatlari: Foydalanish shartlari, Maxfiylik siyosati, Jamiyat qoidalari.
   Matn ilovaning haqiqiy ishlashiga mos yozilgan. O'zgartirsangiz, TERMS_VER ni oshiring: hamma qayta rozilik beradi. */
(function () {
  const DATE = '26-noyabr 2026';
  const S = (t, body) => `<section><h2>${t}</h2>${body}</section>`;
  const UL = items => `<ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>`;

  const shartlar = {
    title: 'Foydalanish shartlari',
    html: `<p class="doc-meta">Kuchga kirgan sana: ${DATE} · Versiya 1</p>
<p>Lahzam — o‘zbek tilidagi ijtimoiy tarmoq: ochiq postlar, guruhlar, shaxsiy suhbatlar va mini o‘yinlar. Lahzamdan foydalanish orqali siz quyidagi shartlarga rozilik bildirasiz. Rozi bo‘lmasangiz, iltimos, Lahzamdan foydalanmang.</p>
${S('1. Kim foydalana oladi', `<p>Lahzamdan faqat <b>13 yosh va undan katta</b> shaxslar foydalanishi mumkin. Akkaunt ochayotganda siz 13 yoshdan katta ekaningizni tasdiqlaysiz. 18 yoshga to‘lmagan bo‘lsangiz, Lahzamdan ota-onangiz yoki vasiyingiz bilan kelishib foydalaning.</p><p>13 yoshga to‘lmagan foydalanuvchi aniqlansa, akkaunt ogohlantirishsiz o‘chiriladi.</p>`)}
${S('2. Akkaunt', UL([
  'Akkaunt faqat Google akkaunti orqali ochiladi. Har bir Gmail uchun bitta akkaunt.',
  'Username, ism va parolni o‘zingiz tanlaysiz. Parolingizni hech kimga bermang: Lahzam xodimlari hech qachon parolingizni so‘ramaydi.',
  'Akkauntingizda bo‘layotgan barcha harakatlar uchun o‘zingiz javobgarsiz.',
  'Boshqa odam nomidan, uning rasmidan yoki ismidan foydalanib akkaunt ochish taqiqlanadi.'
]))}
${S('3. Sizning kontentingiz', `<p>Siz yozgan postlar, javoblar, xabarlar va yuklagan rasmlar sizniki bo‘lib qoladi. Ularni Lahzamga joylash orqali siz Lahzamga ushbu kontentni xizmat doirasida saqlash, ko‘rsatish va yetkazish uchun bepul, bekor qilinadigan ruxsat berasiz. Kontentni o‘chirsangiz, bu ruxsat ham tugaydi.</p><p>Ochiq maydondagi postlaringizni Lahzamdagi barcha foydalanuvchilar ko‘radi. Ochiq postga havola esa Lahzamdan tashqarida ham ulashilishi mumkin.</p>`)}
${S('4. Taqiqlangan harakatlar', `<p>Quyidagilar taqiqlanadi (batafsil: <a href="/qoidalar" data-link>Jamiyat qoidalari</a>):</p>` + UL([
  'Qonunga zid kontent, zo‘ravonlik, terrorizm va ekstremizmni targ‘ib qilish',
  'Odob-axloqqa zid, behayo yoki 18+ kontent',
  'Haqorat, tahdid, kamsitish, bezorilik (bullying) va ta’qib qilish',
  'Spam, firibgarlik, aldov havolalari, boshqalarning parol yoki ma’lumotlarini so‘rash',
  'Birovning shaxsiy ma’lumotlarini (telefon, manzil, hujjat) uning roziligisiz tarqatish',
  'Lahzamni buzishga, ortiqcha yuklashga yoki xavfsizlik tizimini chetlab o‘tishga urinish'
]))}
${S('5. Moderatsiya', `<p>Qoidalar buzilganda Lahzam ogohlantirish berishi, kontentni yashirishi yoki o‘chirishi, akkauntni vaqtincha yoki butunlay bloklashi mumkin. Jiddiy holatlarda akkauntga bog‘langan Gmail ham bloklanadi. Guruh admini o‘z guruhidan a‘zoni chetlatishi mumkin.</p><p>Har bir postda “Shikoyat qilish” tugmasi bor. Shikoyatlarni moderator ko‘rib chiqadi.</p>`)}
${S('6. Xizmat “boricha” taqdim etiladi', `<p>Lahzam doim ishlab turishiga harakat qilamiz, lekin uzilishlar, xatolar yoki ma’lumot yo‘qolishi bo‘lmasligiga kafolat bera olmaymiz. Muhim ma’lumotlaringizning nusxasini o‘zingizda saqlang. Lahzam funksiyalari oldindan ogohlantirmasdan o‘zgarishi, qo‘shilishi yoki olib tashlanishi mumkin.</p>`)}
${S('7. Akkauntni yopish', `<p>Istalgan vaqtda Lahzamdan foydalanishni to‘xtatishingiz mumkin. Akkauntingizni va ma’lumotlaringizni butunlay o‘chirish uchun: <b>Sozlamalar → Akkaunt → Akkauntni o‘chirish</b>. Ma’lumotlaringiz darhol o‘chiriladi.</p>`)}
${S('8. Shartlarning o‘zgarishi', `<p>Shartlar o‘zgarsa, ilovada xabar beramiz va yangi shartlarga rozilik so‘raymiz. Rozi bo‘lmasangiz, akkauntingizdan foydalanishni to‘xtatib, uni o‘chirishni so‘rashingiz mumkin.</p>`)}
${S('9. Aloqa', `<p>Savol va takliflar uchun Lahzam ichida <a href="/@musoxon" data-link>@musoxon</a> ga yozing.</p>`)}`
  };

  const maxfiylik = {
    title: 'Maxfiylik siyosati',
    html: `<p class="doc-meta">Kuchga kirgan sana: ${DATE} · Versiya 1</p>
<p>Bu hujjat Lahzam qanday ma’lumotlaringizni oladi, ulardan nima uchun foydalanadi, kimga ko‘rinadi va qayerda saqlanadi — shularni tushuntiradi. Biz ma’lumotlaringizni <b>sotmaymiz</b> va reklama uchun ishlatmaymiz.</p>
${S('1. Biz oladigan ma’lumotlar', `<p><b>Google orqali kirganingizda:</b></p>` + UL([
  '<b>Email (Gmail) manzilingiz</b> — akkauntni aniqlash va kirish uchun. Boshqa foydalanuvchilarga ko‘rsatilmaydi.',
  '<b>Ism va familiyangiz</b> — profilingizda ko‘rinadi (keyin o‘zgartirishingiz mumkin).',
  '<b>Google profil rasmingiz</b> — profil rasmi sifatida (keyin o‘zgartirish yoki olib tashlash mumkin).',
  'Google akkauntingizning ichki raqami (ID) — qayta kirganingizda sizni tanish uchun.'
]) + `<p><b>Siz o‘zingiz kiritadigan ma’lumotlar:</b> username, bio, profil rangi, profil rasmi, parol (biz uni ochiq holda saqlamaymiz: faqat qaytarib bo‘lmaydigan “xesh” ko‘rinishida).</p>
<p><b>Lahzamdan foydalanganingizda:</b> postlar, javoblar, rasmlar, layklar, ko‘rishlar soni, kuzatuvlar, guruh a’zoligi, chatdagi xabarlar, reaksiyalar, so‘rovnoma ovozlari, o‘yin rekordlari, bildirishnomalar, oxirgi marta onlayn bo‘lgan vaqtingiz va “yozmoqda…” holati.</p>
<p><b>Texnik ma’lumotlar:</b> IP manzilingiz faqat spam va hujumlardan himoya (so‘rovlar sonini cheklash) uchun qisqa muddat ishlatiladi. Push bildirishnomalarni yoqsangiz, brauzeringizning push manzili saqlanadi.</p>`)}
${S('2. Nima uchun ishlatamiz', UL([
  'Lahzam ishlashi uchun: postlaringizni ko‘rsatish, xabarlarni yetkazish, bildirishnoma yuborish',
  'Xavfsizlik uchun: spam, firibgarlik va qoidabuzarliklarga qarshi kurash',
  'Xizmatni yaxshilash uchun: umumiy statistika (foydalanuvchilar soni, xotira hajmi)'
]) + `<p>Biz ma’lumotlaringizni reklama, profil tuzish yoki uchinchi shaxslarga sotish uchun <b>ishlatmaymiz</b>.</p>`)}
${S('3. Kim nimani ko‘radi', UL([
  '<b>Ochiq postlar, javoblar, profilingiz</b> (ism, username, rasm, bio, kuzatuvchilar) — barcha foydalanuvchilarga ko‘rinadi.',
  '<b>Shaxsiy chatlar</b> — faqat suhbatdagi ikki kishiga ko‘rinadi.',
  '<b>Guruh xabarlari</b> — faqat guruh a’zolariga. Ochiq guruhlarni Lahzam moderatori qoidabuzarliklarni tekshirish uchun ko‘rishi mumkin.',
  '<b>Onlayn holatingiz, “yozmoqda…” va “o‘qildi” belgisi</b> — siz bilan suhbatdagi odamlarga ko‘rinadi.',
  '<b>Emailingiz</b> — hech bir foydalanuvchiga ko‘rinmaydi.'
]))}
${S('4. Shaxsiy chatlar kuzatilmaydi', `<p>Biz shaxsiy chatlaringizni <b>o‘qimaymiz, kuzatmaymiz va avtomatik tekshirmaymiz</b>. Ulardan reklama yoki boshqa maqsadda foydalanmaymiz.</p><p>Ochiq aytamiz: xabarlar “uchdan-uchga” (end-to-end) shifrlanmagan. Ular xabarni yetkazish uchun serverimizda saqlanadi va internet orqali shifrlangan holda (HTTPS) uzatiladi. Server ma’lumotlariga faqat Lahzam egasi texnik jihatdan kira oladi va bunga faqat qonun talab qilganda yoki sizning shikoyatingiz bo‘yicha jiddiy xavf (masalan, tahdid yoki firibgarlik) tekshirilganda murojaat qilinadi.</p>`)}
${S('5. Qayerda saqlanadi', UL([
  '<b>Ma’lumotlar bazasi:</b> Neon (PostgreSQL), Germaniya (Frankfurt) serverlari',
  '<b>Rasmlar:</b> Cloudflare R2 bulutli xotirasi',
  '<b>Sayt va server:</b> Vercel, Frankfurt',
  '<b>Kirish:</b> Google Sign-In (Google bizga faqat email, ism va rasmingizni beradi; parolingizni bermaydi)',
  '<b>Push bildirishnomalar:</b> brauzeringizning push xizmati (Google, Apple yoki Mozilla) orqali shifrlangan holda yetkaziladi'
]) + `<p>Bu xizmatlar ma’lumotlaringizni faqat Lahzam uchun saqlaydi va uzatadi.</p>`)}
${S('6. Brauzeringizda saqlanadigan narsalar', `<p>Kirgan holatingizni saqlash uchun bitta xavfsiz cookie ishlatamiz (JavaScript uni o‘qiy olmaydi). Ilova tez ochilishi uchun ma’lumotlarning nusxasi va sozlamalaringiz (tungi rejim, matn o‘lchami) brauzeringizda saqlanadi. Reklama yoki kuzatuv cookie’lari ishlatilmaydi.</p>`)}
${S('7. Qancha vaqt saqlanadi', `<p>Ma’lumotlaringiz akkauntingiz mavjud ekan saqlanadi. O‘chirgan post, javob va xabarlaringiz darhol o‘chiriladi. 24 soatlik “Lahza” postlari 24 soatdan keyin ko‘rinmay qoladi. Akkauntni o‘chirsangiz (Sozlamalar → Akkauntni o‘chirish), barcha ma’lumotlaringiz darhol o‘chiriladi.</p>`)}
${S('8. Sizning huquqlaringiz', UL([
  'Ma’lumotlaringizni ko‘rish va tuzatish: ism, bio, rasm va sozlamalarni o‘zingiz o‘zgartira olasiz',
  'Post, javob va xabarlaringizni o‘chirish',
  'Bildirishnoma va push’ni o‘chirish, kim sizga yoza olishini cheklash',
  'Akkauntingiz va barcha ma’lumotlaringizni o‘zingiz butunlay o‘chirish (Sozlamalar → Akkauntni o‘chirish)'
]) + `<p>Savollar bo‘lsa, Lahzam ichida <a href="/@musoxon" data-link>@musoxon</a> ga yozing.</p>`)}
${S('9. Xavfsizlik', UL([
  'Barcha ulanishlar HTTPS orqali shifrlangan',
  'Parollar qaytarib bo‘lmaydigan xesh (scrypt) ko‘rinishida saqlanadi',
  'Admin paneli alohida maxfiy so‘z bilan himoyalangan',
  'Spam va hujumlarga qarshi so‘rovlar soni cheklangan'
]) + `<p>Hech bir tizim 100% xavfsiz emas. Akkauntingizda shubhali harakatni sezsangiz, darhol bizga xabar bering.</p>`)}
${S('10. Bolalar', `<p>Lahzam 13 yoshga to‘lmaganlar uchun emas va ulardan ataylab ma’lumot to‘plamaydi. Bunday akkaunt aniqlansa, u ma’lumotlari bilan birga o‘chiriladi.</p>`)}
${S('11. O‘zgarishlar va aloqa', `<p>Siyosat o‘zgarsa, ilovada xabar beramiz va qayta rozilik so‘raymiz. Savollar uchun Lahzam ichida <a href="/@musoxon" data-link>@musoxon</a> ga yozing.</p>`)}`
  };

  const qoidalar = {
    title: 'Jamiyat qoidalari',
    html: `<p class="doc-meta">Kuchga kirgan sana: ${DATE}</p>
<p>Lahzam — hurmat va foydali suhbat joyi. Bu qoidalar hammaga birdek amal qiladi.</p>
${S('✅ Qiling', UL([
  'Bir-biringizni hurmat qiling, fikrga fikr bilan javob bering',
  'Foydali bilim, tajriba va yaxshi gaplar bilan bo‘lishing',
  'Qoidabuzarlikni ko‘rsangiz, “Shikoyat qilish” tugmasini bosing'
]))}
${S('🚫 Qilmang', UL([
  'Haqorat, so‘kinish, tahdid, kamsitish va bezorilik',
  'Behayo, odob-axloqqa zid yoki 18+ kontent',
  'Zo‘ravonlik, ekstremizm, giyohvandlik yoki qonunga zid ishlarni targ‘ib qilish',
  'Millat, din, til yoki jinsga qarab kamsitish',
  'Spam, reklama to‘ldirish, firibgarlik va aldov havolalari',
  'Birovning shaxsiy ma’lumotini yoki rasmini ruxsatsiz tarqatish',
  'Yolg‘on yangilik va mish-mishlarni ataylab tarqatish',
  'Boshqa odam nomidan akkaunt ochish'
]))}
${S('⚖️ Oqibatlari', `<p>Qoidani buzganlar avval ogohlantiriladi. Takrorlansa yoki holat jiddiy bo‘lsa, kontent o‘chiriladi va akkaunt bloklanadi. Spam yuborgan akkaunt avtomatik ravishda vaqtincha cheklanadi.</p>`)}`
  };

  window.LahzamDocs = { shartlar, maxfiylik, qoidalar };
})();
