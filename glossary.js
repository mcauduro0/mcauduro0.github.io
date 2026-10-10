// The glossary in the page (UX-1.11, 10 October 2026): a marked term shows its definition on hover
// and on focus through CSS alone; this script adds the tap. The first tap on a term opens the
// definition instead of following the link to /glossary/, a second tap follows it; Escape and a
// click elsewhere close whatever is open. Additive: without the script every term is a plain link.
(function () {
  'use strict';
  var doc = document;
  function closeAll(except) {
    Array.prototype.forEach.call(doc.querySelectorAll('.term.is-open'), function (el) { if (el !== except) { el.classList.remove('is-open'); var a = el.querySelector('.term-link'); if (a) a.setAttribute('aria-expanded', 'false'); } });
  }
  function init() {
    var terms = doc.querySelectorAll('.term');
    if (!terms.length) return;
    Array.prototype.forEach.call(terms, function (el) {
      var link = el.querySelector('.term-link');
      if (!link) return;
      link.setAttribute('aria-expanded', 'false');
      link.addEventListener('click', function (event) {
        if (el.classList.contains('is-open')) return; // the second tap follows the link
        event.preventDefault();
        closeAll(el);
        el.classList.add('is-open');
        link.setAttribute('aria-expanded', 'true');
      });
    });
    doc.addEventListener('click', function (event) { if (!(event.target.closest && event.target.closest('.term'))) closeAll(null); });
    doc.addEventListener('keydown', function (event) { if (event.key === 'Escape') closeAll(null); });
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
})();
