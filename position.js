// The reader's position on a Docket test (Onda 5, lane RP): the "I expect: Yes / No" control
// on a pending test posts {testId, side} to the endpoint the control carries in its data
// attribute (content/site.json positionEndpoint, the Worker's POST /position), shows the
// aggregate the Worker answers ("Readers so far: 62% yes · 38% no · n=100") and disables itself
// for that test in this browser, through localStorage and nothing else. Loaded only on a page
// that carries the control, which exists only when the key is set. The only network call is
// fetch(endpoint); no cookie, no identifier, no other transport. The Worker keeps a count per
// test and day and cannot tell one reader from another; the browser-side lock is a courtesy,
// not a record. scripts/check.mjs enforces these rules on the built file.
(function () {
  'use strict';

  var PREFIX = 'deepstack.position.';

  function payload(testId, side) {
    return { testId: String(testId || '').trim(), side: String(side || '').trim().toLowerCase() };
  }

  // The aggregate line from the Worker's answer: percentages of the yes and no counts, and n.
  function aggregateLine(answer, label) {
    var yes = Math.max(0, Math.trunc(Number(answer && answer.yes) || 0));
    var no = Math.max(0, Math.trunc(Number(answer && answer.no) || 0));
    var n = yes + no;
    if (!n) return '';
    var pct = Math.round((yes / n) * 100);
    return (label || 'Readers so far') + ': ' + pct + '% yes · ' + (100 - pct) + '% no · n=' + n;
  }

  function storageKey(testId) { return PREFIX + String(testId || '').trim(); }

  function readLock(win, testId) {
    try {
      var raw = win.localStorage.getItem(storageKey(testId));
      if (!raw) return null;
      var v = JSON.parse(raw);
      return v && (v.side === 'yes' || v.side === 'no') ? { side: v.side, line: typeof v.line === 'string' ? v.line : '' } : null;
    } catch (e) { return null; }
  }

  function writeLock(win, testId, side, line) {
    try { win.localStorage.setItem(storageKey(testId), JSON.stringify({ side: side, line: line })); } catch (e) { /* private mode: the control is still disabled on this page */ }
  }

  // text/plain is a simple request (no preflight); the Worker reads the body as JSON and answers
  // JSON with CORS open, so the aggregate can be read here. A stalled endpoint aborts after ten
  // seconds and the control says so.
  function post(endpoint, body) {
    return fetch(endpoint, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000)
    });
  }

  function settle(box, buttons, status, side, line) {
    Array.prototype.forEach.call(buttons, function (b) {
      b.disabled = true;
      if (b.getAttribute('data-side') === side) b.setAttribute('aria-pressed', 'true');
    });
    box.classList.add('is-done');
    status.textContent = line ? 'You expected ' + side + '. ' + line : 'You expected ' + side + '.';
  }

  function init(win, doc) {
    var boxes = doc.querySelectorAll('[data-position]');
    Array.prototype.forEach.call(boxes, function (box) {
      var endpoint = box.getAttribute('data-position-endpoint');
      var testId = box.getAttribute('data-test-id');
      var buttons = box.querySelectorAll('button[data-side]');
      var status = box.querySelector('.position-status');
      if (!endpoint || !testId || !buttons.length || !status) return;
      var lock = readLock(win, testId);
      if (lock) { settle(box, buttons, status, lock.side, lock.line); return; }
      Array.prototype.forEach.call(buttons, function (button) {
        button.addEventListener('click', function () {
          var side = button.getAttribute('data-side');
          Array.prototype.forEach.call(buttons, function (b) { b.disabled = true; });
          status.textContent = 'Counting…';
          post(endpoint, payload(testId, side)).then(function (response) {
            if (!response.ok) throw new Error(String(response.status));
            return response.json();
          }).then(function (answer) {
            var line = aggregateLine(answer);
            writeLock(win, testId, side, line);
            settle(box, buttons, status, side, line);
          }).catch(function () {
            Array.prototype.forEach.call(buttons, function (b) { b.disabled = false; });
            status.textContent = 'Your position could not be counted. Try again in a moment.';
          });
        });
      });
    });
  }

  var api = { payload: payload, aggregateLine: aggregateLine, storageKey: storageKey, PREFIX: PREFIX };
  if (typeof globalThis !== 'undefined') globalThis.DeepStackPosition = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    var start = function () { init(window, document); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  }
})();
