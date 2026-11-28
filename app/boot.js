/* Yangilangandan keyin: 'vX.Y.Z yuklanmoqda' ekrani (CSP inline skriptni taqiqlaydi, shuning uchun alohida fayl) */
try{var __v=sessionStorage.getItem('lahzam_upd');if(__v)document.addEventListener('DOMContentLoaded',function(){var o=document.createElement('div');o.id='upd-ov';o.innerHTML='<div class="upd-box"><svg viewBox="0 0 100 100" width="54" height="54" class="upd-logo"><path d="M14 12a8 8 0 0 1 8-8h14a8 8 0 0 1 8 8v46h34a8 8 0 0 1 8 8v14a8 8 0 0 1-8 8H30L14 98z" fill="#fff"/><circle cx="72" cy="30" r="13" fill="#121212"/></svg><b>'+(__v.length>1?'v'+__v+' yuklanmoqda':'Yangi versiya yuklanmoqda')+'</b><span>Bu bir necha soniya vaqt oladi</span><i class="upd-bar"><em></em></i></div>';document.body.appendChild(o);});}catch(e){}
/* 📲 Ilova (o'rnatilgan PWA) ochilganda: silliq logo animatsiyasi — sessiyada bir marta */
try{(function(){var sa=matchMedia('(display-mode: standalone)').matches||matchMedia('(display-mode: window-controls-overlay)').matches||navigator.standalone===true;
if(!sa||sessionStorage.getItem('lz_splash')||sessionStorage.getItem('lahzam_upd')||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
sessionStorage.setItem('lz_splash','1');
var P='M14 12a8 8 0 0 1 8-8h14a8 8 0 0 1 8 8v46h34a8 8 0 0 1 8 8v14a8 8 0 0 1-8 8H30L14 98z',L='lahzam',w='';
for(var i=0;i<L.length;i++)w+='<span style="animation-delay:'+(1.32+i*.07).toFixed(2)+'s">'+L[i]+'</span>';
function go(){var o=document.createElement('div');o.id='lz-splash';o.setAttribute('aria-hidden','true');
o.innerHTML='<div class="lzs-row"><svg viewBox="0 0 100 100" class="lzs-mark"><path class="lzs-L" d="'+P+'"/><circle class="lzs-halo" cx="72" cy="30" r="13"/>'+
'<g class="lzs-fx"><g class="lzs-fy"><g class="lzs-cA"><circle class="lzs-d lzs-wA" cx="72" cy="30" r="5"/></g><g class="lzs-cC"><circle class="lzs-d lzs-wC" cx="72" cy="30" r="5"/></g>'+
'<g class="lzs-gr"><g class="lzs-wB"><circle class="lzs-d lzs-main" cx="72" cy="30" r="5"/></g></g></g></g></svg><div class="lzs-word">'+w+'</div></div><p class="lzs-tag">Har lahza yoningizda!</p>';
document.body.appendChild(o);try{var wd=o.querySelector('.lzs-word');o.querySelector('.lzs-row').style.setProperty('--sh',(wd.getBoundingClientRect().width+16)/2+'px');}catch(e){}setTimeout(function(){o.classList.add('done');setTimeout(function(){o.remove();},500);},2750);}
if(document.body)go();else document.addEventListener('DOMContentLoaded',go);})();}catch(e){}
