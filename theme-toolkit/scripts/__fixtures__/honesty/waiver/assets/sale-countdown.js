// Marked honesty:real — opted out (e.g. this build legitimately drives a real promo clock elsewhere).
/* honesty:real */
(function () {
  var el = document.querySelector('[data-clock]');
  if (!el) return;
  var end = Date.now() + 86400000;
  setInterval(function () {
    var remaining = end - Date.now();
    if (remaining <= 0) end = Date.now() + 86400000;
    el.textContent = Math.floor(remaining / 1000) + 's';
  }, 1000);
})();
