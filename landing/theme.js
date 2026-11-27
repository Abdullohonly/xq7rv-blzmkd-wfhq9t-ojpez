/* Mavzuni sahifa chizilishidan OLDIN qo'yadi (oq-qora miltillash bo'lmasin) */
(function () {
  var t = null;
  try { t = localStorage.getItem('lz_land_theme'); } catch (e) {}
  if (t !== 'dark' && t !== 'light') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
})();
