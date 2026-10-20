// The readers' forecasts in the browser (F0 of the argued forecast, lane FB, 20 October 2026;
// docs/strategy/2026-10-20-plano-previsao-argumentada.md section 2). One script for four places,
// each found by its data attribute, each carrying the forecast Worker's address in
// data-forecast-endpoint (content/site.json forecastEndpoint; forecast-worker/README.md is the
// route contract):
//   [data-forecast]          "Your number" under a pending test: a range from 1 to 99 and Save
//                            (POST /forecast {testId, p}; a mirror posts its parent's id), the
//                            reader's standing number from GET /me, "Closed" once the date passed,
//                            and the reader's own mark on the Call's line; without a session, the
//                            link to the sign-in page stays
//   form[data-forecast-signin]  /forecast/: POST /signin {email, website}, the same answer for any address
//   [data-forecast-session]  /forecast/signin/: reads ?t= and POSTs {token} to /session; a GET of
//                            the page spends nothing, the script does the POST
//   [data-forecast-me]       /forecast/me/: GET /me rendered here (the pseudonym and its edit, the
//                            record against the Call, the calibration, every number), sign out,
//                            and delete with a confirm step
// The session is a 32-character token in ONE localStorage key and travels as Authorization: Bearer.
// The only network call is fetch(endpoint + route) with credentials omitted: no cookie, no
// sessionStorage, no other store, no other transport, no address in this file.
// scripts/check.mjs enforces these rules on the built file.
(function () {
  'use strict';

  var KEY = 'deepstack.forecast.session';
  var TOKEN = /^[A-Za-z0-9]{32}$/;
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var SIGNIN_LINE = 'Sign in by email to forecast';
  var SENT_LINE = 'Check your email. If the address is valid, a sign-in link is on its way; it works once, for 30 minutes.';
  var memory = null;

  // ---------- pure helpers (exposed for the tests) ----------

  function clampP(value) {
    var n = Math.round(Number(value));
    if (!Number.isFinite(n)) return 50;
    return Math.max(1, Math.min(99, n));
  }
  function payload(testId, p) { return { testId: String(testId || '').trim(), p: clampP(p) }; }
  function isClosed(closesAt, nowMs) {
    if (!closesAt) return false;
    var t = Date.parse(closesAt);
    return Number.isFinite(t) && nowMs >= t;
  }
  function tokenFrom(search) {
    var m = /[?&]t=([^&#]*)/.exec(String(search || ''));
    var t = m ? decodeURIComponent(m[1]) : '';
    return TOKEN.test(t) ? t : null;
  }
  function standingOf(me, testId) {
    var list = me && Array.isArray(me.forecasts) ? me.forecasts : [];
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].testId === testId) return list[i];
    return null;
  }
  function fmtBrier(v) { return typeof v === 'number' && Number.isFinite(v) ? v.toFixed(3) : '—'; }
  function fmtGap(v) { return typeof v === 'number' && Number.isFinite(v) ? (v < 0 ? '−' : v > 0 ? '+' : '') + Math.abs(v).toFixed(3) : '—'; }
  function gapLine(summary) {
    if (!summary || !summary.callN || typeof summary.callGap !== 'number') return 'No resolved test you share with the Call yet.';
    var tests = summary.callN + (summary.callN === 1 ? ' test' : ' tests');
    if (summary.callGap === 0) return 'On the ' + tests + ' you share with the Call, your mean Brier score equals the Call’s.';
    return 'On the ' + tests + ' you share with the Call, your mean Brier score is ' + Math.abs(summary.callGap).toFixed(3) + (summary.callGap < 0 ? ' lower than the Call’s: better.' : ' higher than the Call’s.');
  }
  // What a failed call tells the reader, by status; never the Worker's address and never a guess.
  function failureLine(status, data, what) {
    if (status === 429) return 'Too many tries in a short time. Wait a minute and try again.';
    if (status === 503) return 'The Docket could not be read just now. Try again in a minute.';
    if (status === 400 && data && typeof data.error === 'string') return data.error.charAt(0).toUpperCase() + data.error.slice(1) + '.';
    return (what || 'That did not go through') + '. Try again in a moment.';
  }
  var ANSWER = { yes: 'Yes', no: 'No', void: 'Inconclusive' };

  // ---------- the session: one key, nothing else ----------

  function readSession(win) {
    var v = null;
    try { var raw = win.localStorage.getItem(KEY); v = raw ? JSON.parse(raw) : null; } catch (e) { v = memory; }
    if (!v || typeof v.session !== 'string' || !TOKEN.test(v.session)) return null;
    if (v.expiresAt && Date.parse(v.expiresAt) <= Date.now()) return null;
    return { session: v.session, handle: typeof v.handle === 'string' ? v.handle : '', expiresAt: typeof v.expiresAt === 'string' ? v.expiresAt : null };
  }
  function writeSession(win, v) {
    memory = v ? { session: v.session, handle: v.handle || '', expiresAt: v.expiresAt || null } : null;
    try {
      if (memory) win.localStorage.setItem(KEY, JSON.stringify(memory));
      else win.localStorage.removeItem(KEY);
    } catch (e) { /* storage refused (private mode): the sign-in lasts as long as this page */ }
  }

  // ---------- the one transport ----------

  // text/plain bodies: the Worker reads JSON under any type. The reader's routes carry the
  // session as a Bearer header; no cookie ever travels (credentials omitted). Ten seconds at most.
  function call(endpoint, method, route, body, session) {
    var headers = {};
    if (body !== undefined) headers['Content-Type'] = 'text/plain';
    if (session) headers.Authorization = 'Bearer ' + session;
    var init = { method: method, mode: 'cors', credentials: 'omit', cache: 'no-store', headers: headers, signal: AbortSignal.timeout(10000) };
    if (body !== undefined) init.body = JSON.stringify(body);
    return fetch(endpoint + route, init).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) { return { status: response.status, data: data || {} }; });
    });
  }

  function el(doc, tag, cls, text) {
    var node = doc.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }
  function each(list, fn) { Array.prototype.forEach.call(list, fn); }

  // ---------- "Your number" under a pending test ----------

  function markRuler(doc, box, p) {
    var holder = box.parentNode;
    var ruler = holder && holder.querySelector ? holder.querySelector('svg.call-ruler') : null;
    if (!ruler) return;
    var mark = ruler.querySelector('.call-ruler-mine');
    if (!mark) {
      mark = doc.createElementNS(ruler.namespaceURI, 'rect');
      mark.setAttribute('class', 'call-ruler-mine');
      mark.setAttribute('y', '15.5');
      mark.setAttribute('width', '7');
      mark.setAttribute('height', '7');
      ruler.appendChild(mark);
    }
    mark.setAttribute('x', p + '%');
    ruler.setAttribute('data-mine', String(p));
    if (!ruler.hasAttribute('data-label')) ruler.setAttribute('data-label', ruler.getAttribute('aria-label') || '');
    ruler.setAttribute('aria-label', ruler.getAttribute('data-label') + ' Your number: ' + p + '%.');
  }

  function setupControl(win, doc, box, session, mine) {
    var endpoint = box.getAttribute('data-forecast-endpoint');
    var testId = box.getAttribute('data-test-id');
    var forecastId = box.getAttribute('data-forecast-id') || testId;
    var link = box.querySelector('.forecast-signin');
    var form = box.querySelector('.forecast-form');
    var range = box.querySelector('.forecast-range');
    var output = box.querySelector('.forecast-value');
    var save = box.querySelector('.forecast-save');
    var status = box.querySelector('.forecast-status');
    if (!endpoint || !testId || !form || !range || !output || !save || !status) return;
    var closed = isClosed(box.getAttribute('data-closes-at'), Date.now());
    var show = function (p) { output.textContent = p + '%'; range.setAttribute('aria-valuetext', p + '% chance of yes'); };
    var signedOut = function (line) {
      form.hidden = true;
      if (link) { link.hidden = false; }
      status.textContent = line || '';
    };
    var close = function (p) {
      closed = true;
      box.classList.add('is-closed');
      form.hidden = true;
      if (link) link.hidden = true;
      status.textContent = 'Closed.' + (p ? ' Your number: ' + p + '%.' : '');
    };
    show(clampP(range.value));
    range.addEventListener('input', function () { show(clampP(range.value)); });
    if (closed) close(null);
    if (!session) return;
    if (!closed) { if (link) link.hidden = true; form.hidden = false; }
    mine.then(function (me) {
      if (me === 'expired') { if (!closed) signedOut('Your sign-in has ended.'); return; }
      var f = standingOf(me, forecastId);
      if (!f || !Number.isInteger(f.p)) return;
      markRuler(doc, box, f.p);
      if (closed) { close(f.p); return; }
      range.value = String(f.p);
      show(f.p);
      status.textContent = 'Your number: ' + f.p + '%.';
    });
    save.addEventListener('click', function () {
      if (closed) return;
      var p = clampP(range.value);
      save.disabled = true;
      status.textContent = 'Saving…';
      call(endpoint, 'POST', '/forecast', payload(forecastId, p), session.session).then(function (r) {
        save.disabled = false;
        if (r.status === 201) { markRuler(doc, box, p); status.textContent = 'Saved: ' + p + '%. The last number before the date counts.'; return; }
        if (r.status === 401) { writeSession(win, null); signedOut('Your sign-in has ended.'); return; }
        if (r.status === 409 && r.data && r.data.closed) { close(p); status.textContent = 'Closed.'; return; }
        status.textContent = failureLine(r.status, r.data, 'Your number could not be saved');
      }).catch(function () {
        save.disabled = false;
        status.textContent = 'Your number could not be saved. Try again in a moment.';
      });
    });
  }

  function initControls(win, doc, state) {
    var boxes = doc.querySelectorAll('[data-forecast]');
    if (!boxes.length) return;
    var session = readSession(win);
    var mine = session ? me(win, state, boxes[0].getAttribute('data-forecast-endpoint'), session) : null;
    each(boxes, function (box) { setupControl(win, doc, box, session, mine); });
  }

  // One GET /me per page, shared by every control; 'expired' when the session is gone.
  function me(win, state, endpoint, session) {
    if (!state.me) {
      state.me = call(endpoint, 'GET', '/me', undefined, session.session).then(function (r) {
        if (r.status === 401) { writeSession(win, null); return 'expired'; }
        return r.status === 200 && r.data && r.data.ok ? r.data : null;
      }).catch(function () { return null; });
    }
    return state.me;
  }

  // ---------- /forecast/: the sign-in form ----------

  function initSignin(win, doc) {
    var form = doc.querySelector('form[data-forecast-signin]');
    if (!form) return;
    var endpoint = form.getAttribute('data-forecast-endpoint');
    var email = form.querySelector('input[name="email"]');
    var trap = form.querySelector('input[name="website"]');
    var status = form.querySelector('.form-status');
    var button = form.querySelector('button[type="submit"]');
    if (!endpoint || !email || !status || !button) return;
    var session = readSession(win);
    var signed = doc.querySelector('.forecast-signed-in');
    if (session && signed) {
      var name = signed.querySelector('.forecast-signed-in-name');
      if (name) name.textContent = session.handle || 'a reader';
      signed.hidden = false;
    }
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var value = String(email.value || '').trim();
      if (!EMAIL.test(value)) { status.textContent = 'Enter a valid email address.'; email.focus(); return; }
      button.disabled = true;
      status.textContent = 'Sending…';
      call(endpoint, 'POST', '/signin', { email: value, website: trap ? String(trap.value || '') : '' }).then(function (r) {
        button.disabled = false;
        if (r.status === 202) { form.classList.add('is-done'); status.textContent = SENT_LINE; return; }
        status.textContent = r.status === 400 ? 'Enter a valid email address.' : failureLine(r.status, null, 'The link could not be sent');
      }).catch(function () {
        button.disabled = false;
        status.textContent = 'The link could not be sent. Try again in a moment.';
      });
    });
  }

  // ---------- /forecast/signin/: the link becomes a session ----------

  function initSession(win, doc) {
    var box = doc.querySelector('[data-forecast-session]');
    if (!box) return;
    var endpoint = box.getAttribute('data-forecast-endpoint');
    var status = box.querySelector('.forecast-session-status');
    var next = box.querySelector('.forecast-session-next');
    var again = box.querySelector('.forecast-session-again');
    if (!endpoint || !status) return;
    var token = tokenFrom(win.location.search);
    // The token leaves the address bar at once: it is spent below and must not stay in the history.
    try { if (win.location.search) win.history.replaceState(null, '', win.location.pathname); } catch (e) { /* the page still works */ }
    if (!token) {
      status.textContent = 'This page needs the link from your email, and that link works once.';
      if (again) again.hidden = false;
      return;
    }
    status.textContent = 'Signing you in…';
    call(endpoint, 'POST', '/session', { token: token }).then(function (r) {
      if (r.status === 200 && r.data && TOKEN.test(String(r.data.session || ''))) {
        writeSession(win, { session: r.data.session, handle: r.data.handle, expiresAt: r.data.expiresAt });
        status.textContent = 'Signed in as ' + (r.data.handle || 'a reader') + '. This browser stays signed in for ninety days or until you sign out.';
        if (next) next.hidden = false;
        return;
      }
      status.textContent = r.status === 401 ? 'This sign-in link was already used or has expired. Ask for a new one.' : failureLine(r.status, null, 'The sign-in did not go through');
      if (again) again.hidden = false;
    }).catch(function () {
      status.textContent = 'The sign-in did not go through. Try the link again in a moment.';
      if (again) again.hidden = false;
    });
  }

  // ---------- /forecast/me/: the reader's own page ----------

  // The calibration curve, drawn here as markup the way the readers' table draws it (src/pages.mjs
  // calibrationSvg): ten bands, a bar per band as tall as its share of yes, over the diagonal.
  function calibrationMarkup(bins) {
    var list = (Array.isArray(bins) ? bins : []).slice(0, 10);
    var ok = function (b) { return b && Number(b.n) > 0 && Number.isFinite(Number(b.yesRate)); };
    var used = list.filter(ok);
    if (!used.length) return '';
    var said = used.map(function (b) { return Number(b.lo) + ' to ' + Number(b.hi) + ', ' + Number(b.n) + (Number(b.n) === 1 ? ' number' : ' numbers') + ', ' + Number(b.yesRate) + '% yes'; }).join('; ');
    var bars = list.map(function (b, i) { if (!ok(b)) return ''; var h = Math.max(2, Math.min(100, Number(b.yesRate))); return '<rect class="calibration-bar" x="' + (i * 10 + 1) + '" y="' + (100 - h).toFixed(1) + '" width="8" height="' + h.toFixed(1) + '"/>'; }).join('');
    // Numbers only go into the markup (every value passes through Number), so no reader text is parsed.
    return '<svg class="calibration calibration-lg" viewBox="0 0 100 100" preserveAspectRatio="none" width="240" height="120" role="img" aria-label="Calibration: ' + said + '."><rect class="calibration-frame" x="0" y="0" width="100" height="100"/>' + bars + '<line class="calibration-diagonal" x1="0" y1="100" x2="100" y2="0" vector-effect="non-scaling-stroke"/></svg>';
  }

  function testsIndex(doc) {
    var node = doc.getElementById('forecast-tests');
    try { return node ? JSON.parse(node.textContent) : {}; } catch (e) { return {}; }
  }

  function renderMe(win, doc, box, data, endpoint, session) {
    var part = function (name) { return box.querySelector('[data-me-part="' + name + '"]'); };
    var tests = testsIndex(doc);
    // The pseudonym and its edit.
    var who = box.querySelector('.forecast-me-who');
    var setWho = function (handle) { who.textContent = 'Signed in as ' + handle + (data.email ? ' (' + data.email + ')' : '') + '. The readers’ table prints the pseudonym, never the address.'; };
    setWho(data.handle);
    var handleForm = box.querySelector('.forecast-handle-form');
    var handleInput = box.querySelector('#me-handle');
    var handleStatus = handleForm ? handleForm.querySelector('.form-status') : null;
    if (handleInput) handleInput.value = data.handle || '';
    if (handleForm && handleInput && handleStatus) {
      handleForm.addEventListener('submit', function (event) {
        event.preventDefault();
        var handle = String(handleInput.value || '').trim();
        if (!/^[A-Za-z0-9_-]{3,24}$/.test(handle)) { handleStatus.textContent = 'Use 3 to 24 letters, digits, underscores or dashes.'; return; }
        handleStatus.textContent = 'Saving…';
        call(endpoint, 'PATCH', '/me', { handle: handle }, session.session).then(function (r) {
          if (r.status === 200) { data.handle = r.data.handle || handle; setWho(data.handle); writeSession(win, { session: session.session, handle: data.handle, expiresAt: session.expiresAt }); handleStatus.textContent = 'Saved.'; return; }
          if (r.status === 409) { handleStatus.textContent = 'That pseudonym is taken; choose another.'; return; }
          if (r.status === 401) { writeSession(win, null); handleStatus.textContent = 'Your sign-in has ended.'; return; }
          handleStatus.textContent = failureLine(r.status, r.data, 'The name could not be saved');
        }).catch(function () { handleStatus.textContent = 'The name could not be saved. Try again in a moment.'; });
      });
    }
    part('name').hidden = false;

    // The record against the Call, and the calibration.
    var s = data.summary || {};
    var dl = box.querySelector('.forecast-me-summary');
    var cell = function (label, value, key) { var div = el(doc, 'div'); div.appendChild(el(doc, 'dt', 'n-label', label)); var dd = el(doc, 'dd', 'n-value', value); dd.setAttribute('data-me', key); div.appendChild(dd); dl.appendChild(div); };
    cell('Tests with your number', String(s.n || 0), 'n');
    cell('Resolved', String(s.nResolved || 0), 'resolved');
    cell('Mean Brier score', fmtBrier(s.meanBrier), 'brier');
    cell('Against the Call', fmtGap(s.callGap), 'gap');
    box.querySelector('.forecast-me-gap').textContent = gapLine(s);
    var chart = calibrationMarkup(s.calibration);
    var chartBox = box.querySelector('.forecast-me-calibration');
    if (chart) box.querySelector('.forecast-me-calibration-chart').innerHTML = chart;
    else if (chartBox) chartBox.hidden = true;
    part('summary').hidden = false;

    // Every number, by test.
    var body = box.querySelector('.forecast-me-table tbody');
    var list = (Array.isArray(data.forecasts) ? data.forecasts : []).slice().sort(function (a, b) { return String(a.testId).localeCompare(String(b.testId)); });
    list.forEach(function (f) {
      var row = el(doc, 'tr');
      row.setAttribute('data-test-id', f.testId);
      var th = el(doc, 'th');
      th.setAttribute('scope', 'row');
      var info = tests[f.testId] || null;
      var a = el(doc, 'a', null, f.testId);
      a.setAttribute('href', info && info.href ? info.href : '/docket/#test-' + f.testId);
      th.appendChild(a);
      if (info && info.q) th.appendChild(el(doc, 'span', 'forecast-me-question', ' ' + info.q));
      row.appendChild(th);
      row.appendChild(el(doc, 'td', null, f.p + '%'));
      row.appendChild(el(doc, 'td', null, String(f.updates || 1)));
      row.appendChild(el(doc, 'td', null, f.outcome ? ANSWER[f.outcome] || f.outcome : 'Pending'));
      row.appendChild(el(doc, 'td', null, fmtBrier(f.brier)));
      row.appendChild(el(doc, 'td', null, fmtBrier(f.callBrier)));
      body.appendChild(row);
    });
    box.querySelector('.forecast-me-empty').hidden = list.length > 0;
    part('list').hidden = false;

    // Sign out, and delete with a confirm step.
    var leave = part('leave');
    var leaveStatus = leave.querySelector('.forecast-me-leave-status');
    var confirmBox = leave.querySelector('.forecast-confirm');
    var gone = function (line) {
      writeSession(win, null);
      each(box.querySelectorAll('[data-me-part]'), function (p) { if (p !== leave) p.hidden = true; });
      each(leave.querySelectorAll('button'), function (b) { b.disabled = true; });
      confirmBox.hidden = true;
      leaveStatus.textContent = line;
      box.querySelector('.forecast-me-status').textContent = '';
    };
    leave.querySelector('.forecast-signout').addEventListener('click', function () {
      call(endpoint, 'POST', '/signout', undefined, session.session).then(function () { gone('Signed out of this browser.'); }).catch(function () { gone('Signed out of this browser.'); });
    });
    leave.querySelector('.forecast-delete').addEventListener('click', function () { confirmBox.hidden = false; leave.querySelector('.forecast-delete-confirm').focus(); });
    leave.querySelector('.forecast-delete-cancel').addEventListener('click', function () { confirmBox.hidden = true; leave.querySelector('.forecast-delete').focus(); });
    leave.querySelector('.forecast-delete-confirm').addEventListener('click', function () {
      leaveStatus.textContent = 'Deleting…';
      call(endpoint, 'POST', '/me/delete', undefined, session.session).then(function (r) {
        if (r.status === 200) { gone('Deleted: the address, the pseudonym and every number are gone.'); return; }
        if (r.status === 401) { gone('Your sign-in has ended; sign in again to delete.'); return; }
        leaveStatus.textContent = failureLine(r.status, r.data, 'Nothing was deleted');
      }).catch(function () { leaveStatus.textContent = 'Nothing was deleted. Try again in a moment.'; });
    });
    leave.hidden = false;
  }

  function initMe(win, doc) {
    var box = doc.querySelector('[data-forecast-me]');
    if (!box) return;
    var endpoint = box.getAttribute('data-forecast-endpoint');
    var status = box.querySelector('.forecast-me-status');
    if (!endpoint || !status) return;
    var session = readSession(win);
    if (!session) return; // the page's own line: sign in by email
    status.textContent = 'Reading your numbers…';
    call(endpoint, 'GET', '/me', undefined, session.session).then(function (r) {
      if (r.status === 401) { writeSession(win, null); status.textContent = 'Your sign-in has ended. '; status.appendChild(signinLink(doc)); return; }
      if (r.status !== 200 || !r.data || !r.data.ok) { status.textContent = 'Your numbers could not be read. Try again in a moment.'; return; }
      status.textContent = '';
      renderMe(win, doc, box, r.data, endpoint, session);
    }).catch(function () { status.textContent = 'Your numbers could not be read. Try again in a moment.'; });
  }
  function signinLink(doc) { var a = el(doc, 'a', null, SIGNIN_LINE); a.setAttribute('href', '/forecast/#sign-in'); return a; }

  function init(win, doc) {
    var state = {};
    initControls(win, doc, state);
    initSignin(win, doc);
    initSession(win, doc);
    initMe(win, doc);
  }

  var api = { KEY: KEY, payload: payload, clampP: clampP, isClosed: isClosed, tokenFrom: tokenFrom, standingOf: standingOf, fmtBrier: fmtBrier, fmtGap: fmtGap, gapLine: gapLine, failureLine: failureLine, readSession: readSession, writeSession: writeSession, markRuler: markRuler, calibrationMarkup: calibrationMarkup };
  if (typeof globalThis !== 'undefined') globalThis.DeepStackForecast = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    var start = function () { init(window, document); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  }
})();
