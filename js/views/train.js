import { h, icon } from '../dom.js';
import { BRAND } from '../brand.js';
import { drillById } from '../catalog.js';
import { drafts } from '../store.js';
import { newSession, recordShot, undoShot, totals, currentRun, spotIndexForAttempt } from '../rules.js';
import { playMake, playMiss, playMove, buzz } from '../audio.js';
import { track } from '../analytics.js';
import { courtDiagram } from '../court.js';
import { muteButton } from './library.js';
import { openReport } from './report.js';

function backLink() {
  return h('a', { class: 'icon-btn', href: '#/', 'aria-label': 'Back to drills' }, icon('back'));
}

function messageView(title, text, extra = null) {
  return { el: h('main', { class: 'message' },
    h('h1', {}, title), h('p', {}, text), extra,
    h('a', { class: 'btn btn--primary', href: '#/' }, 'Back to drills')) };
}

function demoVideo(drill) {
  const frame = h('div', { class: 'video' });
  const load = () => {
    if (!navigator.onLine) {
      frame.replaceChildren(h('p', { class: 'video__offline' }, 'The demo video needs a connection. The coaching cues below work offline.'));
      return;
    }
    frame.replaceChildren(h('iframe', {
      src: `https://www.youtube-nocookie.com/embed/${drill.youtubeId}?playsinline=1&rel=0&autoplay=1`,
      title: `${drill.title} demonstration video`,
      allow: 'accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen',
      allowfullscreen: true,
      loading: 'lazy',
    }));
  };
  // The player loads on request: the page stays fast and nothing autoplays with sound.
  frame.append(h('button', { class: 'video__play', type: 'button', on: { click: load } },
    h('span', { class: 'video__icon' }, icon('play')),
    h('span', {}, 'Watch the demo')));
  return frame;
}

export function trainView(app, drillId) {
  const drill = drillById(drillId);
  if (!drill) return messageView('Drill not found', 'That link does not match any drill in the library.');

  if (drill.pro && app.entitlement !== 'pro') {
    track('pro_offer_viewed', { drillId: drill.id });
    const previewUnlock = app.backend.mode === 'preview'
      ? h('button', { class: 'link', type: 'button', on: { click: async () => {
        await app.backend.previewSetTier('pro');
        await app.refreshAccount();
        app.rerender();
      } } }, 'Preview build only: view this drill as a Pro player')
      : null;
    return messageView(`${drill.title} is locked`,
      'This drill is part of the Pro Series. Pro access is granted to your account by your coach. Nothing can be purchased inside the app yet.',
      previewUnlock);
  }

  const userId = app.session.user.id;
  const saved = drafts.load(userId, drill.id);
  let session = saved?.drillId === drill.id && Array.isArray(saved.events) ? saved : newSession(drill.id);
  const restoredCount = session.events.length;
  let frozen = false;
  let wakeLock = null;
  const multiSpot = drill.spots.length > 1;

  // --- coaching card -------------------------------------------------------
  const sections = Object.keys(drill.coaching);
  let openSection = sections[0];
  const cueList = h('ul', { class: 'cues' });
  const sectionButtons = sections.map((name) => h('button', {
    class: 'seg__btn', type: 'button', on: { click: () => { openSection = name; paintCoaching(); } },
  }, name));
  function paintCoaching() {
    sectionButtons.forEach((button, index) => button.setAttribute('aria-pressed', String(sections[index] === openSection)));
    cueList.replaceChildren(...drill.coaching[openSection].map((cue) => {
      const pinned = session.cue === cue;
      return h('li', {}, h('button', {
        class: 'cue', type: 'button', 'aria-pressed': String(pinned),
        on: { click: () => {
          session = { ...session, cue: pinned ? null : cue };
          drafts.save(userId, session);
          paintCoaching();
          paintConsole();
        } },
      }, h('span', { class: 'cue__text' }, cue), pinned ? h('span', { class: 'cue__pin' }, icon('check'), 'Lock-in cue') : null));
    }));
  }

  // --- tracking console ----------------------------------------------------
  const makesValue = h('span', { class: 'count__value' }, '0');
  const attemptsValue = h('span', { class: 'count__value' }, '0');
  const progressFill = h('span', { class: 'progress__fill' });
  const progress = h('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Attempts toward target', 'aria-valuemin': '0', 'aria-valuemax': String(drill.targetAttempts) }, progressFill);
  const progressLabel = h('p', { class: 'progress__label' });
  const tape = h('div', { class: 'tape', 'aria-hidden': 'true' });
  const spotLine = h('p', { class: 'spot-line' });
  const courtSlot = h('div', { class: 'console__court' });
  const cueLine = h('p', { class: 'cue-line' });
  const announcer = h('p', { class: 'sr-only', 'aria-live': 'polite' });
  const moveBanner = h('p', { class: 'move-banner', 'aria-live': 'assertive' });
  const makeButton = h('button', { class: 'shot shot--make', type: 'button', on: { click: () => record(true) } }, h('span', { class: 'shot__label' }, 'Make'));
  const missButton = h('button', { class: 'shot shot--miss', type: 'button', on: { click: () => record(false) } }, h('span', { class: 'shot__label' }, 'Miss'));
  const undoButton = h('button', { class: 'btn btn--ghost', type: 'button', on: { click: undo } });
  const finishButton = h('button', { class: 'btn btn--primary', type: 'button', on: { click: finish } }, 'Finish');
  const courtModeButton = h('button', { class: 'btn btn--ghost', type: 'button', 'aria-pressed': 'false', on: { click: toggleCourtMode } }, icon('expand'), h('span', {}, 'Court mode'));

  const consoleEl = h('section', { class: 'console', 'aria-label': 'Shot tracker' },
    h('span', { class: 'heat', 'aria-hidden': 'true' }),
    moveBanner,
    h('div', { class: 'console__status' },
      courtSlot,
      h('div', { class: 'console__counts' },
        h('div', { class: 'count' }, h('span', { class: 'count__label' }, 'Makes'), makesValue),
        h('div', { class: 'count' }, h('span', { class: 'count__label' }, 'Attempts'), attemptsValue, h('span', { class: 'count__of' }, `/ ${drill.targetAttempts}`)))),
    spotLine,
    cueLine,
    h('div', { class: 'console__progress' }, progress, progressLabel, tape),
    h('div', { class: 'shots' }, missButton, makeButton),
    h('div', { class: 'console__actions' }, undoButton, courtModeButton, finishButton),
    announcer);

  function paintConsole() {
    const { makes, attempts } = totals(session.events);
    makesValue.textContent = String(makes);
    attemptsValue.textContent = String(attempts);
    const reached = attempts >= drill.targetAttempts;
    progress.setAttribute('aria-valuenow', String(Math.min(attempts, drill.targetAttempts)));
    progressFill.style.transform = `scaleX(${Math.min(attempts / drill.targetAttempts, 1)})`;
    progress.classList.toggle('is-reached', reached);
    progressLabel.replaceChildren(...(reached
      ? [icon('check'), 'Target reached. Keep shooting or finish.']
      : [`${drill.targetAttempts - attempts} attempts to target`]));

    const last = session.events[session.events.length - 1];
    undoButton.disabled = !last || frozen;
    undoButton.replaceChildren(icon('undo'), h('span', {}, last ? `Undo ${last.made ? 'make' : 'miss'}` : 'Undo'));
    tape.replaceChildren(...session.events.slice(-14).map((event) => h('span', { class: `tape__dot ${event.made ? 'is-make' : 'is-miss'}` })));

    const spotIndex = spotIndexForAttempt(drill, attempts);
    if (multiSpot) {
      spotLine.textContent = spotIndex === null
        ? 'All five spots done. Free shooting.'
        : `Spot ${spotIndex + 1} of ${drill.spots.length}: ${drill.spots[spotIndex].name} · shot ${(attempts % drill.perSpot) + 1} of ${drill.perSpot}`;
    } else {
      spotLine.textContent = drill.spots[0].name;
    }
    courtSlot.replaceChildren(courtDiagram(drill, { activeIndex: spotIndex, label: 'Where to stand' }));
    cueLine.textContent = session.cue ? `Cue: ${session.cue}` : '';
    cueLine.hidden = !session.cue;
    // Heat is ambient only: a glow that builds with consecutive makes, never a number.
    consoleEl.style.setProperty('--heat', String(Math.min(currentRun(session.events), 6) / 6));
    for (const control of [makeButton, missButton, finishButton]) control.disabled = frozen;
  }

  function pulse(element, className) {
    element.classList.remove(className);
    void element.offsetWidth; // restart the animation so rapid taps each get feedback
    element.classList.add(className);
  }

  async function holdScreenAwake() {
    if (wakeLock || !navigator.wakeLock) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch { /* low battery or unsupported: tracking still works */ }
  }

  function record(made) {
    if (frozen) return;
    const before = spotIndexForAttempt(drill, session.events.length);
    if (!session.events.length) track('workout_started', { drillId: drill.id, sessionId: session.id });
    session = recordShot(session, made);
    drafts.save(userId, session);
    paintConsole();
    const { makes, attempts } = totals(session.events);
    announcer.textContent = `${made ? 'Make' : 'Miss'}. ${makes} makes, ${attempts} attempts.`;
    pulse(made ? makeButton : missButton, 'is-hit');
    if (made) pulse(makesValue, 'is-bump');
    buzz(made ? 18 : [10, 40, 10]);
    if (!app.muted) (made ? playMake(currentRun(session.events)) : playMiss());
    track('shot_recorded', { drillId: drill.id, sessionId: session.id, made });
    if (attempts === drill.targetAttempts) track('target_reached', { drillId: drill.id, sessionId: session.id });

    const after = spotIndexForAttempt(drill, attempts);
    if (multiSpot && after !== before) {
      moveBanner.textContent = after === null ? 'Target reached' : `Move to ${drill.spots[after].name}`;
      pulse(moveBanner, 'is-shown');
      buzz([40, 60, 40]);
      if (!app.muted) playMove();
    }
    holdScreenAwake();
  }

  function undo() {
    if (frozen || !session.events.length) return;
    session = undoShot(session);
    drafts.save(userId, session);
    paintConsole();
    const { makes, attempts } = totals(session.events);
    announcer.textContent = `Undone. ${makes} makes, ${attempts} attempts.`;
    track('shot_undone', { drillId: drill.id, sessionId: session.id });
  }

  function toggleCourtMode() {
    const active = !consoleEl.classList.contains('console--court');
    consoleEl.classList.toggle('console--court', active);
    document.body.classList.toggle('no-scroll', active);
    courtModeButton.setAttribute('aria-pressed', String(active));
    courtModeButton.lastChild.textContent = active ? 'Exit court mode' : 'Court mode';
    if (active) holdScreenAwake();
  }

  function startFresh() {
    drafts.clear(userId, drill.id);
    session = { ...newSession(drill.id), cue: session.cue };
    frozen = false;
    paintConsole();
    paintCoaching();
  }

  function finish() {
    if (frozen) return;
    frozen = true; // one finish operation per session, however many taps arrive
    paintConsole();
    track('finish_requested', { drillId: drill.id, sessionId: session.id });
    openReport(app, { drill, session, onRunBack: () => { track('workout_restarted', { drillId: drill.id }); startFresh(); makeButton.focus(); } });
  }

  // Keyboard and Bluetooth clicker support, so the phone can stay on the floor.
  function onKey(event) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || document.querySelector('dialog[open]')) return;
    if (event.target.closest?.('input, textarea, select')) return;
    const key = event.key.toLowerCase();
    if (key === 'm' || key === 'arrowright' || key === 'arrowup') record(true);
    else if (key === 'x' || key === 'arrowleft' || key === 'arrowdown') record(false);
    else if (key === 'z' || key === 'backspace') undo();
    else return;
    event.preventDefault();
  }
  const onVisible = () => { if (document.visibilityState === 'visible' && session.events.length && !frozen) holdScreenAwake(); };
  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVisible);

  // --- restored-draft notice ----------------------------------------------
  let restoredNotice = null;
  if (restoredCount) {
    let armed = false;
    const discard = h('button', { class: 'btn btn--small', type: 'button', on: { click: () => {
      if (!armed) { armed = true; discard.textContent = 'Tap again to discard'; return; }
      startFresh();
      restoredNotice.remove();
    } } }, 'Start over');
    restoredNotice = h('div', { class: 'banner', role: 'status' },
      h('p', {}, `Picked up where you left off: ${restoredCount} attempts restored.`), discard);
  }

  const root = h('main', { class: 'train' },
    h('header', { class: 'topbar' },
      backLink(),
      h('div', { class: 'topbar__title' }, h('p', { class: 'eyebrow' }, BRAND.experience), h('h1', {}, drill.title)),
      muteButton(app)),
    restoredNotice,
    demoVideo(drill),
    h('section', { class: 'coach', 'aria-label': 'Coaching cues' },
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Coaching sections' }, sectionButtons),
      cueList,
      h('p', { class: 'coach__hint' }, 'Tap one cue to carry it into the drill.'),
      drill.reviewed ? null : h('p', { class: 'coach__hint' }, 'Draft cues, pending coach review.')),
    consoleEl);

  paintCoaching();
  paintConsole();
  track('drill_opened', { drillId: drill.id });

  return {
    el: root,
    destroy() {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisible);
      document.body.classList.remove('no-scroll');
      wakeLock?.release().catch(() => {});
    },
  };
}
