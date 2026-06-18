// FAKE evergreen countdown — end-time computed from now + 24h on every visit.
(function () {
  var el = document.querySelector('[data-clock]');
  if (!el) return;
  var end = Date.now() + 86400000; // now + 24h — resets per visit
  setInterval(function () {
    var remaining = end - Date.now();
    if (remaining <= 0) end = Date.now() + 86400000;
    el.textContent = Math.floor(remaining / 1000) + 's';
  }, 1000);
})();
