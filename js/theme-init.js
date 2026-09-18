// Applies the saved theme before first paint to avoid a light/dark flash.
// Kept in its own file so the page can ship a Content-Security-Policy without inline scripts.
(function () {
  try {
    if (localStorage.getItem('geoscope.theme') === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  } catch (e) { /* storage unavailable */ }
})();
