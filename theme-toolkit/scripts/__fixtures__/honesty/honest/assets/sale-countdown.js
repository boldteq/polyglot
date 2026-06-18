// Real countdown — reads a FIXED end date from the data-end attribute (no now+duration).
(function () {
  var el = document.querySelector('.sale-countdown');
  if (!el) return;
  var end = new Date(el.getAttribute('data-end')).getTime();
  setInterval(function () {
    var remaining = end - Date.now();
    if (remaining <= 0) { el.textContent = 'Sale ended'; return; }
    el.querySelector('time').textContent = Math.floor(remaining / 1000) + 's';
  }, 1000);
})();
