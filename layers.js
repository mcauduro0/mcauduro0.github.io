// The layers filter on /stories/ (UX-1.17, 10 October 2026): the buttons under the series dek show
// the Parts of one layer of the AI value chain, or all of them. Without the script the buttons are
// inert and every Part is listed, so nothing is hidden from a reader without JavaScript. Additive.
(function () {
  'use strict';
  var doc = document;
  function init() {
    var bar = doc.querySelector('[data-layers]');
    if (!bar) return;
    var buttons = bar.querySelectorAll('button[data-layer]');
    var items = doc.querySelectorAll('[data-item-layer]');
    var count = doc.querySelector('[data-layer-count]');
    function apply(layer) {
      var shown = 0;
      Array.prototype.forEach.call(items, function (li) {
        var show = layer === 'all' || li.getAttribute('data-item-layer') === layer;
        li.hidden = !show;
        if (show) shown += 1;
      });
      Array.prototype.forEach.call(buttons, function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-layer') === layer)); });
      if (count) count.textContent = shown === 1 ? '1 Part' : shown + ' Parts';
      try { if (layer === 'all') history.replaceState(null, '', location.pathname + location.search); else history.replaceState(null, '', '#layer=' + layer); } catch (e) { /* the address stays */ }
    }
    Array.prototype.forEach.call(buttons, function (b) { b.addEventListener('click', function () { apply(b.getAttribute('data-layer')); }); });
    var fromHash = (location.hash.match(/^#layer=([a-z-]+)$/) || [])[1];
    if (fromHash && bar.querySelector('button[data-layer="' + fromHash + '"]')) apply(fromHash);
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
})();
