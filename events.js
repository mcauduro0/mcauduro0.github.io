// The instruments of section 6 of the launch plan (Sprint UX-3, lane F, UX-3.28): a click on a
// control that carries data-event is sent as {event, page} to the endpoint the page names in
// <meta name="deepstack-events">, which src/pages.mjs prints from content/site.json eventEndpoint
// and only when that key is set; without the meta nothing is sent and no listener is attached.
// The page is location.pathname: no query, no hash, no referrer, no title. The body goes as
// text/plain by navigator.sendBeacon (no preflight, survives a navigation), by a keepalive fetch
// when the browser has no beacon; the page never reads the answer. One send per element per
// second, so a double click is one count. An element that carries data-event-view sends its
// event once when the page loads (the Result page's effect chip). window.deepstackEvent(name)
// is the hook for scripts that confirm an action (subscribe.js on a follow that went through,
// charts.js on a scenario link copied). No cookie, no storage, no identifier of any kind; the
// Worker keeps a count per UTC day, event and page and nothing else (mcp-worker/src/events.js).
// scripts/check.mjs enforces these rules on the built file.
(function () {
  'use strict';

  // The allowlist, the Worker's own (mcp-worker/src/events.js EVENTS); test/ux3-events.test.mjs
  // keeps the two identical. A name outside it is not sent.
  var EVENTS = ['orient_click', 'number_open', 'glossary_open', 'scenario_share', 'expect_click', 'follow_submit', 'ics_download', 'result_effect_view', 'layer_open', 'share_call'];
  var META = 'meta[name="deepstack-events"]';
  var WINDOW_MS = 1000;

  // The endpoint the page names, or null: the one source, printed only when site.json carries the key.
  function endpointOf(doc) {
    var meta = doc && doc.querySelector ? doc.querySelector(META) : null;
    var value = meta ? String(meta.getAttribute('content') || '').trim() : '';
    return value || null;
  }

  // The page as the Worker counts it: the path alone (location.pathname carries no query and no hash).
  function pageOf(loc) {
    var p = loc && typeof loc.pathname === 'string' ? loc.pathname : '/';
    return p.charAt(0) === '/' ? p : '/';
  }

  function payload(event, page) {
    return { event: String(event || '').trim(), page: String(page || '/') };
  }

  // The transport: sendBeacon with a string body (text/plain, no preflight), a keepalive fetch
  // with no credentials when the beacon is missing or refused. Nothing is read back.
  function send(endpoint, event, page) {
    if (!endpoint || EVENTS.indexOf(event) < 0) return false;
    var body = JSON.stringify(payload(event, page));
    try { if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(endpoint, body)) return true; } catch (e) { /* the fetch below */ }
    try {
      if (typeof fetch === 'function') {
        var p = fetch(endpoint, { method: 'POST', body: body, keepalive: true, credentials: 'omit', headers: { 'content-type': 'text/plain' } });
        if (p && typeof p.catch === 'function') p.catch(function () {});
        return true;
      }
    } catch (e) { /* a blocked transport sends nothing; the page is unaffected */ }
    return false;
  }

  // One sender per page: a click on one element counts once per second, however many times the
  // element fires inside the window (a double click, a key repeat); a named confirmation
  // (deepstackEvent) counts once per second per name.
  function makeSender(endpoint, now, transport) {
    var stamps = typeof WeakMap === 'function' ? new WeakMap() : null;
    var named = {};
    var go = transport || send;
    return function (event, page, el) {
      var name = String(event || '').trim();
      if (!endpoint || EVENTS.indexOf(name) < 0) return false;
      var t = now();
      if (el && stamps) {
        var at = stamps.get(el);
        if (at !== undefined && t - at < WINDOW_MS) return false;
        stamps.set(el, t);
      } else {
        if (named[name] !== undefined && t - named[name] < WINDOW_MS) return false;
        named[name] = t;
      }
      return go(endpoint, name, page);
    };
  }

  function init(win, doc) {
    var endpoint = endpointOf(doc);
    var page = pageOf(win.location);
    var emit = endpoint ? makeSender(endpoint, function () { return Date.now(); }) : null;
    // The hook for scripts that confirm an action; without the endpoint it does nothing.
    win.deepstackEvent = function (name) { return emit ? emit(name, page, null) : false; };
    if (!emit) return;
    // Capture phase, so a handler that stops the bubble (a dialog, a menu) still leaves the count.
    doc.addEventListener('click', function (event) {
      var target = event.target;
      var el = target && typeof target.closest === 'function' ? target.closest('[data-event]') : null;
      if (!el) return;
      emit(el.getAttribute('data-event'), page, el);
    }, true);
    var views = doc.querySelectorAll('[data-event-view]');
    for (var i = 0; i < views.length; i++) emit(views[i].getAttribute('data-event-view'), page, views[i]);
  }

  var api = { EVENTS: EVENTS, META: META, WINDOW_MS: WINDOW_MS, endpointOf: endpointOf, pageOf: pageOf, payload: payload, makeSender: makeSender, send: send };
  if (typeof globalThis !== 'undefined') globalThis.DeepStackEvents = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    var start = function () { init(window, document); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  }
})();
