// The tape as a ticker (10 October 2026, the owner's decision D-UX14): the band of key numbers under
// the register rolls from right to left like an exchange tape. No dependency; loaded on the home only.
//
// What the script does, and nothing else:
// - clones the list once for a seamless loop; the copy is aria-hidden and its links are out of the
//   tab order, so a screen reader and the keyboard meet each number once;
// - moves the track with the Web Animations API at a constant speed (pixels per second), whatever
//   the width of the list; the duration is measured, not guessed;
// - pauses on hover (a mouse), on the pause button (any pointer, the keyboard), when a link inside the
//   tape takes focus (the track is held where that link is visible) and while the band is off screen
//   or the tab is hidden; resumes from the same spot;
// - does nothing when the reader asked for reduced motion: the band stays the scrollable list the
//   page is built with, and the button stays hidden. Without this script the band is that list too.
(() => {
  const tape = document.querySelector('[data-tape]');
  if (!tape) return;
  const roll = tape.querySelector('.tape-roll');
  const track = tape.querySelector('.tape-track');
  const list = track && track.querySelector('.tape-list');
  const button = tape.querySelector('.tape-pause');
  if (!roll || !track || !list || !button || !('animate' in track)) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const SPEED = 36; // pixels per second: a line of twelve words passes in about ten seconds
  const copy = list.cloneNode(true);
  copy.setAttribute('aria-hidden', 'true');
  copy.querySelectorAll('a, button').forEach((el) => { el.tabIndex = -1; });
  copy.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
  track.appendChild(copy);
  tape.setAttribute('data-tape', 'ticker');
  button.hidden = false;

  let width = 0;
  let animation = null;
  const build = (fromFraction = 0) => {
    if (animation) animation.cancel();
    width = Math.max(1, Math.round(list.getBoundingClientRect().width));
    const duration = (width / SPEED) * 1000;
    animation = track.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${-width}px)` }], { duration, iterations: Infinity, easing: 'linear' });
    animation.currentTime = fromFraction * duration;
    apply();
  };
  const fraction = () => (animation && width ? ((animation.currentTime || 0) % ((width / SPEED) * 1000)) / ((width / SPEED) * 1000) : 0);

  const state = { paused: false, hovered: false, held: false, visible: true, shown: !document.hidden };
  const apply = () => {
    if (!animation) return;
    const run = !state.paused && !state.hovered && !state.held && state.visible && state.shown;
    if (run && animation.playState !== 'running') animation.play();
    if (!run && animation.playState === 'running') animation.pause();
    tape.setAttribute('data-tape-state', run ? 'rolling' : 'still');
  };
  const setPaused = (on) => {
    state.paused = on;
    button.setAttribute('aria-pressed', String(on));
    button.setAttribute('aria-label', on ? 'Play the tape' : 'Pause the tape');
    button.classList.toggle('is-paused', on);
    apply();
  };
  button.addEventListener('click', () => setPaused(!state.paused));

  // A mouse over the band holds it; a finger does not (there is the button for that).
  roll.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { state.hovered = true; apply(); } });
  roll.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { state.hovered = false; apply(); } });

  // Focus inside the first copy: hold the track where the focused link is visible, with a little room
  // on its left; when focus leaves the band, roll on from there.
  track.addEventListener('focusin', (e) => {
    const link = e.target && e.target.closest ? e.target.closest('a') : null;
    if (!link || !list.contains(link) || !animation) return;
    // The link's place in the list does not depend on how far the track has rolled: both move together.
    const x = Math.max(0, Math.min(width, link.getBoundingClientRect().left - list.getBoundingClientRect().left - 24));
    state.held = true;
    // Focus scrolls a hidden-overflow box to the link's old place; the scroll is undone and the hold places the link.
    roll.scrollLeft = 0;
    // Pause first, then seek: a seek on a paused animation is the hold time itself, whatever frame comes next.
    apply();
    animation.currentTime = (x / width) * (width / SPEED) * 1000;
  });
  track.addEventListener('focusout', (e) => {
    if (e.relatedTarget && track.contains(e.relatedTarget)) return;
    state.held = false;
    apply();
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => { state.visible = entries.some((en) => en.isIntersecting); apply(); }, { threshold: 0 }).observe(tape);
  }
  document.addEventListener('visibilitychange', () => { state.shown = !document.hidden; apply(); });

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { const f = fraction(); build(f); }, 160);
  });

  // Fonts change the width of the list; measure after they are in.
  const start = () => build(0);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(start, start); else start();
  window.DeepStackTape = { get state() { return { ...state, width, playState: animation ? animation.playState : null, currentTime: animation ? Math.round(animation.currentTime || 0) : null }; } };
})();
