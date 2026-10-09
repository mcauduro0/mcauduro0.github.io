// Subscribe, contact and follow forms: posts JSON to the house endpoints configured in
// content/site.json. Loaded only when an endpoint exists. The only network call
// in the site is fetch(endpoint), where endpoint comes from the form's data
// attribute; scripts/check.mjs enforces that rule on the built file.
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

  function subscribePayload(email, source) {
    return { email: String(email || '').trim(), source: String(source || '/') };
  }

  // The support form on /contact/ carries a hidden subject ("support"); the partner dialog carries none.
  function contactPayload(fields) {
    var payload = {
      name: String(fields.name || '').trim(),
      email: String(fields.email || '').trim(),
      format: String(fields.format || '').trim(),
      message: String(fields.message || '').trim()
    };
    var subject = String(fields.subject || '').trim();
    if (subject) payload.subject = subject;
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
        post(endpoint, subscribePayload(input.value, win.location.pathname)).then(function (response) {
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
        }).catch(function () {
          status.textContent = 'The follow could not be sent. Try again in a moment.';
        }).then(function () { button.disabled = false; });
      });
    });
  }

  var api = { subscribePayload: subscribePayload, contactPayload: contactPayload, followPayload: followPayload };
  if (typeof globalThis !== 'undefined') globalThis.DeepStackSubscribe = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    var start = function () { initSubscribe(window, document); initContact(document); initFollow(document); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  }
})();
