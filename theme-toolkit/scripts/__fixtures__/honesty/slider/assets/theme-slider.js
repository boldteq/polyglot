// Hero slideshow controller — cross-fade auto-advance. NOT a countdown.
(function () {
  var hero = document.querySelector('.hero');
  if (!hero) return;
  var slides = hero.querySelectorAll('.hero__slide');
  if (slides.length < 2) return;
  var current = 0, isAnimating = false;
  var checkTimer = setTimeout(function () { init(); }, 100);
  function init() {
    setInterval(function () {
      if (isAnimating) return;
      slides[current].classList.remove('is-active');
      current = (current + 1) % slides.length;
      slides[current].classList.add('is-active');
    }, 6000);
  }
})();
