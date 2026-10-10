// Numbers with provenance in the page (UX-2.20, Sprint UX-2, 10 October 2026): a key number whose
// provenance the owner approved is a button; a click opens "Where this number comes from" under it,
// a second click or Escape closes it. A link to a number (the Call's line, a permalink such as
// /stories/<slug>/#number-p13-n1) opens the panel as it lands. Additive: without the script every
// panel stays folded and the number reads as a number.
(function () {
  'use strict';
  var doc = document;
  var ID = /^number-p\d\d-n\d$/;
  function buttonOf(id) { return doc.querySelector('.number-open[data-number="' + id.replace(/^number-/, '') + '"]'); }
  function setOpen(btn, open) {
    var panel = doc.getElementById(btn.getAttribute('aria-controls'));
    if (!panel) return;
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    var item = btn.closest('li');
    if (item) item.classList.toggle('is-open', open);
  }
  function openFromHash() {
    var id = (location.hash || '').slice(1);
    if (!ID.test(id)) return;
    var btn = buttonOf(id);
    if (btn) setOpen(btn, true);
  }
  function init() {
    var buttons = doc.querySelectorAll('.number-open[aria-controls]');
    if (!buttons.length) return;
    Array.prototype.forEach.call(buttons, function (btn) {
      btn.addEventListener('click', function () { setOpen(btn, btn.getAttribute('aria-expanded') !== 'true'); });
    });
    doc.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      Array.prototype.forEach.call(buttons, function (btn) {
        if (btn.getAttribute('aria-expanded') === 'true') { setOpen(btn, false); if (btn.closest('li') && btn.closest('li').contains(doc.activeElement)) btn.focus(); }
      });
    });
    Array.prototype.forEach.call(doc.querySelectorAll('[data-number-open]'), function (link) {
      link.addEventListener('click', function () { var btn = buttonOf('number-' + link.getAttribute('data-number-open')); if (btn) setOpen(btn, true); });
    });
    window.addEventListener('hashchange', openFromHash);
    openFromHash();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
})();
