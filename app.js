(function () {
  'use strict';

  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var BRIEFS = {
    'Sponsored briefing': 'a sponsored DeepStack briefing',
    'Research collaboration': 'a research collaboration with DeepStack',
    'Brand ambassadorship': 'a brand ambassadorship with DeepStack',
    'Video or podcast partnership': 'a partnership on DeepStack video or podcast formats'
  };

  function isValidEmail(value) { return EMAIL.test(String(value || '').trim()); }

  function buildBrief(format) {
    var what = BRIEFS[format] || BRIEFS['Sponsored briefing'];
    return 'Hi DeepStack,\n\nI am [name], [role] at [company]. We would like to explore ' + what + '.\n\nWhy it fits your readers: [one or two sentences].\nTiming and budget range: [details].\n\nWe understand sponsored work is labeled and that partners have no say over DeepStack\u2019s editorial views.\n\nThanks,\n[name]';
  }

  function orderParts(parts, order) {
    var copy = parts.slice();
    copy.sort(function (a, b) { return order === 'first' ? a - b : b - a; });
    return copy;
  }

  function initMenu(doc) {
    var toggle = doc.querySelector('.menu-toggle');
    var nav = doc.getElementById('site-nav');
    if (!toggle || !nav) return;
    var links = function () { return Array.prototype.slice.call(nav.querySelectorAll('a[href]')); };
    function set(open, focusFirst) {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      nav.classList.toggle('is-open', open);
      // UX-0.5 (10 October 2026): the nav sits before the button in the DOM, so Tab from the open
      // button used to skip the links. Opening by the button moves the focus to the first link;
      // Tab from the last link closes the menu and lands on the button, from where Tab goes on to
      // the page; Shift+Tab from the first link returns to the button. No focus trap: the menu is
      // not modal, and Escape still closes it and returns the focus.
      if (open && focusFirst) { var first = links()[0]; if (first) first.focus(); }
    }
    toggle.addEventListener('click', function () { var open = toggle.getAttribute('aria-expanded') !== 'true'; set(open, open); });
    nav.addEventListener('keydown', function (event) {
      if (event.key !== 'Tab' || toggle.getAttribute('aria-expanded') !== 'true') return;
      var all = links();
      var i = all.indexOf(doc.activeElement);
      if (i < 0) return;
      if (!event.shiftKey && i === all.length - 1) { event.preventDefault(); set(false); toggle.focus(); }
      else if (event.shiftKey && i === 0) { event.preventDefault(); toggle.focus(); }
    });
    nav.addEventListener('click', function (event) { if (event.target.closest && event.target.closest('a')) set(false); });
    doc.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') { set(false); toggle.focus(); }
    });
  }

  function initNewsletter(doc) {
    var forms = doc.querySelectorAll('.newsletter-form');
    Array.prototype.forEach.call(forms, function (form) {
      var input = form.querySelector('input[type="email"]');
      var status = form.querySelector('.form-status');
      form.addEventListener('submit', function (event) {
        if (!isValidEmail(input.value)) {
          event.preventDefault();
          input.setAttribute('aria-invalid', 'true');
          status.textContent = 'Please enter a valid email address.';
          input.focus();
          return;
        }
        input.value = input.value.trim();
        input.removeAttribute('aria-invalid');
        status.textContent = '';
      });
    });
  }

  function initShare(win, doc) {
    var button = doc.querySelector('[data-share]');
    if (!button) return;
    var status = doc.querySelector('.share-status');
    button.addEventListener('click', function () {
      var title = doc.title;
      var url = win.location.href.split('#')[0];
      function say(text) { if (status) { status.textContent = text; win.setTimeout(function () { status.textContent = ''; }, 3200); } }
      if (win.navigator.share) {
        win.navigator.share({ title: title, url: url }).catch(function () {});
      } else if (win.navigator.clipboard && win.navigator.clipboard.writeText) {
        win.navigator.clipboard.writeText(url).then(function () { say('Link copied.'); }, function () { say('Copy failed. Use the address bar to share.'); });
      } else {
        say('Use the address bar to copy this link.');
      }
    });
  }

  // UX-1.16: a second button shares the Call itself (the six lines of the thesis) rather than the
  // address: the share sheet where the browser has one, the clipboard elsewhere. The status is the
  // byline's own, found from the button, so both buttons speak through the same live region.
  function initShareCall(win, doc) {
    var button = doc.querySelector('[data-share-call]');
    if (!button) return;
    var byline = button.closest ? button.closest('.story-byline') : null;
    var status = (byline && byline.querySelector('.share-status')) || doc.querySelector('.share-status');
    button.addEventListener('click', function () {
      var text = button.getAttribute('data-share-text') || '';
      var title = button.getAttribute('data-share-title') || doc.title;
      function say(t) { if (status) { status.textContent = t; win.setTimeout(function () { status.textContent = ''; }, 3200); } }
      if (win.navigator.share) {
        win.navigator.share({ title: title, text: text, url: win.location.href }).catch(function () {});
      } else if (win.navigator.clipboard && win.navigator.clipboard.writeText) {
        win.navigator.clipboard.writeText(text).then(function () { say('The Call copied.'); }, function () { say('Copy failed. Use the address bar to share.'); });
      } else {
        say('Copy failed. Use the address bar to share.');
      }
    });
  }

  function initProgress(win, doc) {
    var bar = doc.querySelector('.progress span');
    var body = doc.querySelector('.story-body');
    if (!bar || !body) return;
    var ticking = false;
    function update() {
      ticking = false;
      var rect = body.getBoundingClientRect();
      var total = rect.height - win.innerHeight * 0.6;
      var done = Math.min(1, Math.max(0, (-rect.top + win.innerHeight * 0.25) / (total > 0 ? total : 1)));
      bar.style.transform = 'scaleX(' + done.toFixed(4) + ')';
    }
    win.addEventListener('scroll', function () { if (!ticking) { ticking = true; win.requestAnimationFrame(update); } }, { passive: true });
    win.addEventListener('resize', update);
    update();
  }

  function initToc(win, doc) {
    var links = doc.querySelectorAll('.toc a');
    if (!links.length || !('IntersectionObserver' in win)) return;
    var map = {};
    Array.prototype.forEach.call(links, function (link) { map[link.getAttribute('href').slice(1)] = link; });
    var observer = new win.IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        Array.prototype.forEach.call(links, function (link) { link.classList.remove('is-active'); link.removeAttribute('aria-current'); });
        var active = map[entry.target.id];
        if (active) { active.classList.add('is-active'); active.setAttribute('aria-current', 'true'); }
      });
    }, { rootMargin: '-20% 0px -70% 0px' });
    Object.keys(map).forEach(function (id) { var el = doc.getElementById(id); if (el) observer.observe(el); });
  }

  function initArchive(win, doc) {
    var list = doc.querySelector('[data-archive]');
    if (!list) return;
    var buttons = doc.querySelectorAll('[data-order]');
    function apply(order, updateUrl) {
      var items = Array.prototype.slice.call(list.children);
      var byPart = {};
      items.forEach(function (li) { byPart[li.getAttribute('data-part')] = li; });
      orderParts(items.map(function (li) { return Number(li.getAttribute('data-part')); }), order)
        .forEach(function (part) { list.appendChild(byPart[String(part)]); });
      Array.prototype.forEach.call(buttons, function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-order') === order)); });
      if (updateUrl && win.history && win.history.replaceState) {
        win.history.replaceState(null, '', order === 'first' ? '?order=first' : win.location.pathname);
      }
    }
    Array.prototype.forEach.call(buttons, function (b) {
      b.addEventListener('click', function () { apply(b.getAttribute('data-order'), true); });
    });
    var initial = /[?&]order=first\b/.test(win.location.search) ? 'first' : 'latest';
    if (initial === 'first') apply('first', false);
  }

  function initDialog(win, doc) {
    var dialog = doc.getElementById('partner-dialog');
    var opener = doc.querySelector('[data-open-dialog="partner-dialog"]');
    if (!dialog || !opener) return;
    var select = doc.getElementById('partner-format');
    var brief = doc.getElementById('partner-brief');
    var status = dialog.querySelector('.copy-status');
    function render() { brief.textContent = buildBrief(select.value); status.textContent = ''; }
    render();
    select.addEventListener('change', render);
    opener.addEventListener('click', function () {
      if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
      select.focus();
    });
    function close() { if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open'); opener.focus(); }
    dialog.querySelector('[data-close-dialog]').addEventListener('click', close);
    dialog.addEventListener('click', function (event) { if (event.target === dialog) close(); });
    dialog.querySelector('[data-copy-brief]').addEventListener('click', function () {
      var text = brief.textContent;
      if (win.navigator.clipboard && win.navigator.clipboard.writeText) {
        win.navigator.clipboard.writeText(text).then(function () { status.textContent = 'Inquiry copied.'; },
          function () { status.textContent = 'Copy failed. Select the text above and copy it manually.'; });
      } else {
        status.textContent = 'Select the text above and copy it manually.';
      }
    });
  }

  var api = { isValidEmail: isValidEmail, buildBrief: buildBrief, orderParts: orderParts };
  if (typeof globalThis !== 'undefined') globalThis.DeepStackApp = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    var start = function () {
      initMenu(document);
      initNewsletter(document);
      initShare(window, document);
      initShareCall(window, document);
      initProgress(window, document);
      initToc(window, document);
      initArchive(window, document);
      initDialog(window, document);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  }
})();
