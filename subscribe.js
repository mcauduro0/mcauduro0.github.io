// Subscribe, contact and follow forms: posts JSON to the house endpoints configured in
// content/site.json. Loaded only when an endpoint exists. The only network call
// in the site is fetch(endpoint), where endpoint comes from the form's data
// attribute; scripts/check.mjs enforces that rule on the built file.
//
// The visit's origin (Onda 7, lane OR; docs/growth/medicao-spec.md M1 and M2): on the first page
// of the visit the campaign tags (utm_source, utm_medium, utm_campaign, utm_content) and the
// referrer's host are read once and kept in sessionStorage under ds_arrival with the landing
// path, so nothing outlives the tab; the subscribe form sends them beside the address, and one
// POST /arrive per tab counts the visit when it carried a tag or came from a referrer the map
// below knows. The host only, never the referrer's URL; no cookie, no localStorage.
(function () {
  'use strict';

  // A stalled endpoint aborts after ten seconds, so the form lands in its error state
  // instead of hanging on "Sending…".
  function post(endpoint, payload) {
    return fetch(endpoint, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000)
    });
  }

  // The arrival beacon: text/plain so it is a simple request (no preflight) and keepalive so a
  // navigation does not cancel it. The endpoint is the Worker's /arrive, named from the same
  // attribute a form on the page carries (arriveEndpoint below); the Worker checks the origin.
  function beacon(endpoint, payload) {
    return fetch(endpoint, { method: 'POST', body: JSON.stringify(payload), keepalive: true, credentials: 'omit', headers: { 'Content-Type': 'text/plain' } });
  }

  // UX-3.28: a follow that went through is confirmed to src/events.js when the page loads it
  // (window.deepstackEvent, named by content/site.json eventEndpoint); without it nothing happens.
  function confirmEvent(name) {
    try { if (typeof window !== 'undefined' && typeof window.deepstackEvent === 'function') window.deepstackEvent(name); } catch (e) { /* the count is a courtesy */ }
  }

  // ---------- the visit's origin ----------

  var ARRIVAL_KEY = 'ds_arrival';
  // The closed alphabet the Worker applies too (subscribe-worker/src/arrivals.js): a value outside
  // it is dropped here and would be dropped there.
  var FIELD_RE = /^[a-z0-9._-]{1,64}$/;
  var LANDING_RE = /^\/[a-z0-9/._-]{0,119}$/;
  var ARRIVAL_KEYS = ['channel', 'medium', 'campaign', 'content', 'referrer_host', 'landing'];
  // The referrer-to-channel map of M1, the Worker's copy being the one that decides; the site's
  // test keeps the two identical. A host matches a domain exactly or as a subdomain.
  var REFERRER_CHANNELS = [
    ['chatgpt.com', 'chatgpt'], ['perplexity.ai', 'perplexity'], ['gemini.google.com', 'gemini'], ['claude.ai', 'claude'], ['copilot.microsoft.com', 'copilot'],
    ['linkedin.com', 'linkedin-organic'], ['lnkd.in', 'linkedin-organic'], ['t.co', 'x-organic'], ['x.com', 'x-organic'], ['reddit.com', 'reddit-organic'],
    ['news.google.com', 'google-news'], ['bsky.app', 'bluesky-organic'], ['t.me', 'telegram-organic'], ['substack.com', 'substack'], ['news.ycombinator.com', 'hn']
  ];
  var GOOGLE_ANY = /^(?:[a-z0-9-]+\.)*google\.[a-z]{2,}(?:\.[a-z]{2,})?$/;

  function cleanField(value) {
    var s = String(value == null ? '' : value).trim().toLowerCase();
    return FIELD_RE.test(s) ? s : null;
  }

  function cleanLanding(value) {
    var s = String(value == null ? '' : value).trim().toLowerCase();
    return LANDING_RE.test(s) ? s : null;
  }

  function referrerChannel(host) {
    var h = String(host || '').trim().toLowerCase();
    if (!h) return null;
    for (var i = 0; i < REFERRER_CHANNELS.length; i++) {
      var domain = REFERRER_CHANNELS[i][0];
      if (h === domain || h.slice(-(domain.length + 1)) === '.' + domain) return REFERRER_CHANNELS[i][1];
    }
    return GOOGLE_ANY.test(h) ? 'google-organic' : null;
  }

  function hostOf(referrer) {
    try { return String(new URL(String(referrer || '')).hostname || '').toLowerCase(); } catch (e) { return ''; }
  }

  function sameSite(a, b) {
    return String(a || '').replace(/^www\./, '') === String(b || '').replace(/^www\./, '');
  }

  // What this page says about the visit: the tags in its address, the referrer's host when it is
  // another site, the path. `channel` is utm_source, else the mapped referrer, else null.
  function arrivalFromVisit(visit) {
    var v = visit || {};
    var params = new URLSearchParams(String(v.search || ''));
    var ref = hostOf(v.referrer);
    var referrerHost = ref && !sameSite(ref, String(v.host || '').toLowerCase()) ? cleanField(ref) : null;
    var tagged = cleanField(params.get('utm_source'));
    return {
      channel: tagged || referrerChannel(referrerHost),
      medium: cleanField(params.get('utm_medium')),
      campaign: cleanField(params.get('utm_campaign')),
      content: cleanField(params.get('utm_content')),
      referrer_host: referrerHost,
      landing: cleanLanding(v.pathname),
      posted: false
    };
  }

  // The tab keeps its first arrival. The one exception: a tab that began with no channel and
  // then opens an address with one (a reader who came back through a tagged link) takes the
  // tagged arrival, so the campaign is the one credited.
  function resolveArrival(stored, current) {
    if (!stored || typeof stored !== 'object') return current;
    if (!stored.channel && current && current.channel) return current;
    return stored;
  }

  function readArrival(storage) {
    try {
      var raw = storage ? storage.getItem(ARRIVAL_KEY) : null;
      var a = raw ? JSON.parse(raw) : null;
      return a && typeof a === 'object' && !Array.isArray(a) ? a : null;
    } catch (e) { return null; }
  }

  function writeArrival(storage, arrival) {
    try { storage.setItem(ARRIVAL_KEY, JSON.stringify(arrival)); return true; } catch (e) { return false; }
  }

  // The six fields, only those with a value: the body of /arrive and the extra fields of /subscribe.
  function arrivePayload(arrival) {
    var out = {};
    var a = arrival || {};
    for (var i = 0; i < ARRIVAL_KEYS.length; i++) if (a[ARRIVAL_KEYS[i]] != null) out[ARRIVAL_KEYS[i]] = a[ARRIVAL_KEYS[i]];
    return out;
  }

  // /arrive on the same Worker as the form's endpoint: the last path segment swapped. A value
  // that is not an absolute address with a path gives null, and nothing is sent.
  function arriveEndpointFrom(value) {
    var s = String(value || '').replace(/\/+$/, '');
    var scheme = s.indexOf('//');
    var i = s.lastIndexOf('/');
    if (scheme < 0 || i < scheme + 3) return null;
    return s.slice(0, i) + '/arrive';
  }

  function arriveEndpoint(doc) {
    var form = doc.querySelector('form[data-subscribe-endpoint], form[data-follow-endpoint], form[data-contact-endpoint]');
    if (!form) return null;
    return arriveEndpointFrom(form.getAttribute('data-subscribe-endpoint') || form.getAttribute('data-follow-endpoint') || form.getAttribute('data-contact-endpoint'));
  }

  function storageOf(win) {
    try { return win.sessionStorage || null; } catch (e) { return null; }
  }

  // On every page: settle the tab's arrival, and post it once when it names a channel and a form
  // on the page says where the Worker is (a page without one leaves `posted` false for the next).
  function initArrival(win, doc) {
    var storage = storageOf(win);
    if (!storage) return null;
    var current = arrivalFromVisit({ search: win.location.search, host: win.location.hostname, referrer: doc.referrer, pathname: win.location.pathname });
    var stored = readArrival(storage);
    var arrival = resolveArrival(stored, current);
    if (arrival !== stored) writeArrival(storage, arrival);
    if (arrival.channel && !arrival.posted) {
      var endpoint = arriveEndpoint(doc);
      if (endpoint) {
        arrival.posted = true;
        writeArrival(storage, arrival);
        try { beacon(endpoint, arrivePayload(arrival)).catch(function () {}); } catch (e) { /* a blocked transport sends nothing */ }
      }
    }
    return arrival;
  }

  // {email, source} plus the tab's origin fields (never `posted`): the Worker keeps them on the row.
  function subscribePayload(email, source, arrival) {
    var payload = { email: String(email || '').trim(), source: String(source || '/') };
    var extra = arrivePayload(arrival);
    for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) payload[k] = extra[k];
    return payload;
  }

  // The support form on /contact/ carries a hidden subject ("support"); the partner dialog carries none.
  // The partner form on /partners/ carries the subject "partner" and a select of B2B formats the
  // Worker's own list does not know: the choice is written into the message as "[<format>] " so it
  // survives in the stored text whatever format the Worker files the row under.
  function contactPayload(fields) {
    var payload = {
      name: String(fields.name || '').trim(),
      email: String(fields.email || '').trim(),
      format: String(fields.format || '').trim(),
      message: String(fields.message || '').trim()
    };
    var subject = String(fields.subject || '').trim();
    if (subject) payload.subject = subject;
    if (subject.toLowerCase() === 'partner' && payload.format && payload.message) payload.message = '[' + payload.format + '] ' + payload.message;
    return payload;
  }

  function initSubscribe(win, doc) {
    var forms = doc.querySelectorAll('form[data-subscribe-endpoint]');
    Array.prototype.forEach.call(forms, function (form) {
      var endpoint = form.getAttribute('data-subscribe-endpoint');
      var input = form.querySelector('input[type="email"]');
      var button = form.querySelector('button[type="submit"]');
      var status = form.querySelector('.form-status');
      var trap = form.querySelector('input[name="website"]');
      if (!endpoint || !input || !button || !status) return;
      form.addEventListener('submit', function (event) {
        if (event.defaultPrevented) return; // app.js rejected the address
        event.preventDefault();
        if (trap && trap.value) { status.textContent = 'Check your inbox for a confirmation email from DeepStack.'; return; }
        button.disabled = true;
        status.textContent = 'Sending…';
        post(endpoint, subscribePayload(input.value, win.location.pathname, readArrival(storageOf(win)))).then(function (response) {
          if (!response.ok) throw new Error(String(response.status));
          form.classList.add('is-done');
          input.value = '';
          status.textContent = 'Check your inbox: one confirmation email from DeepStack is on its way.';
        }).catch(function () {
          status.textContent = 'Sign-up could not be sent. Try again in a moment, or follow the RSS feed.';
        }).then(function () { button.disabled = false; });
      });
    });
  }

  function initContact(doc) {
    var form = doc.querySelector('form[data-contact-endpoint]');
    if (!form) return;
    var endpoint = form.getAttribute('data-contact-endpoint');
    var status = form.querySelector('.form-status');
    var button = form.querySelector('button[type="submit"]');
    var format = doc.getElementById('partner-format');
    var subject = form.querySelector('input[name="subject"]');
    var trap = form.querySelector('input[name="website"]');
    if (!endpoint || !status || !button) return;
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var fields = {
        name: form.querySelector('[name="name"]').value,
        email: form.querySelector('[name="email"]').value,
        format: format ? format.value : '',
        subject: subject ? subject.value : '',
        message: form.querySelector('[name="message"]').value
      };
      if (trap && trap.value) { status.textContent = 'Received.'; return; }
      if (!fields.name || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(fields.email) || !fields.message) {
        status.textContent = 'Add your name, a valid email address and a short message.';
        return;
      }
      button.disabled = true;
      status.textContent = 'Sending…';
      post(endpoint, contactPayload(fields)).then(function (response) {
        if (!response.ok) throw new Error(String(response.status));
        form.classList.add('is-done');
        status.textContent = 'Received. DeepStack replies to serious inquiries within a few business days.';
      }).catch(function () {
        status.textContent = 'The inquiry could not be sent. Copy the brief above and try again later.';
      }).then(function () { button.disabled = false; });
    });
  }

  // The Follow box (Seguir v0): {email, kind, slug, label} to the follow endpoint from the form's
  // attribute; the label is the page's name, which the Worker keeps for its emails and pages.
  // app.js validates only the newsletter form, so the address is checked here. The Worker
  // answers the same "pending" for every address: one confirmation email, whoever it is.
  function followPayload(email, kind, slug, label) {
    var payload = { email: String(email || '').trim(), kind: String(kind || '').trim(), slug: String(slug || '').trim() };
    var name = String(label || '').trim();
    if (name) payload.label = name.slice(0, 80);
    return payload;
  }

  function initFollow(doc) {
    var forms = doc.querySelectorAll('form[data-follow-endpoint]');
    Array.prototype.forEach.call(forms, function (form) {
      var endpoint = form.getAttribute('data-follow-endpoint');
      var input = form.querySelector('input[type="email"]');
      var button = form.querySelector('button[type="submit"]');
      var status = form.querySelector('.form-status');
      var trap = form.querySelector('input[name="website"]');
      var kind = form.querySelector('input[name="kind"]');
      var slug = form.querySelector('input[name="slug"]');
      var label = form.querySelector('input[name="label"]');
      var name = (label && label.value) || form.getAttribute('data-follow-name') || '';
      if (!endpoint || !input || !button || !status || !kind || !slug) return;
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        var email = String(input.value || '').trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
          input.setAttribute('aria-invalid', 'true');
          status.textContent = 'Enter a valid email address.';
          input.focus();
          return;
        }
        input.removeAttribute('aria-invalid');
        if (trap && trap.value) { status.textContent = 'Check your inbox for a confirmation email from DeepStack.'; return; }
        button.disabled = true;
        status.textContent = 'Sending…';
        post(endpoint, followPayload(email, kind.value, slug.value, name)).then(function (response) {
          if (!response.ok) throw new Error(String(response.status));
          return response.json().catch(function () { return {}; });
        }).then(function () {
          form.classList.add('is-done');
          input.value = '';
          status.textContent = 'Check your inbox: one confirmation email from DeepStack starts the follow when you open its link.';
          confirmEvent('follow_submit');
        }).catch(function () {
          status.textContent = 'The follow could not be sent. Try again in a moment.';
        }).then(function () { button.disabled = false; });
      });
    });
  }

  var api = {
    subscribePayload: subscribePayload, contactPayload: contactPayload, followPayload: followPayload,
    ARRIVAL_KEY: ARRIVAL_KEY, REFERRER_CHANNELS: REFERRER_CHANNELS, cleanField: cleanField, cleanLanding: cleanLanding, referrerChannel: referrerChannel,
    arrivalFromVisit: arrivalFromVisit, resolveArrival: resolveArrival, readArrival: readArrival, writeArrival: writeArrival, arrivePayload: arrivePayload, arriveEndpointFrom: arriveEndpointFrom
  };
  if (typeof globalThis !== 'undefined') globalThis.DeepStackSubscribe = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    var start = function () { initArrival(window, document); initSubscribe(window, document); initContact(document); initFollow(document); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  }
})();
