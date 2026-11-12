import { h, swap, icon, formatPercent, formatDuration, prefersReducedMotion } from '../dom.js';
import { drafts, outbox } from '../store.js';
import { buildSnapshot, insights, shootingPercent, gradeFor, sessionLevel, levelProgressPercent, describeFeelGap, LEVEL_SIZE } from '../rules.js';
import { saveSnapshot } from '../sync.js';
import { track } from '../analytics.js';
import { courtDiagram } from '../court.js';

function confetti(canvas) {
  const context = canvas.getContext('2d');
  const scale = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * scale;
  canvas.height = canvas.clientHeight * scale;
  const colors = ['#2ee6f6', '#d7ff3e', '#f4f7f8'];
  const pieces = Array.from({ length: 90 }, () => ({
    x: canvas.width / 2, y: canvas.height * 0.28,
    vx: (Math.random() - 0.5) * 14 * scale, vy: (-Math.random() * 13 - 3) * scale,
    size: (4 + Math.random() * 5) * scale, spin: Math.random() * Math.PI, color: colors[Math.floor(Math.random() * colors.length)],
  }));
  const started = performance.now();
  (function frame(now) {
    const age = now - started;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (age > 2200) return;
    context.globalAlpha = Math.max(0, 1 - age / 2200);
    for (const piece of pieces) {
      piece.vy += 0.35 * scale;
      piece.x += piece.vx;
      piece.y += piece.vy;
      piece.spin += 0.2;
      context.save();
      context.translate(piece.x, piece.y);
      context.rotate(piece.spin);
      context.fillStyle = piece.color;
      context.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size / 2);
      context.restore();
    }
    requestAnimationFrame(frame);
  })(started);
}

function countUp(element, target) {
  if (prefersReducedMotion() || target === 0) { element.textContent = formatPercent(target); return; }
  const started = performance.now();
  (function frame(now) {
    const progress = Math.min((now - started) / 900, 1);
    const eased = 1 - (1 - progress) ** 3;
    element.textContent = progress === 1 ? formatPercent(target) : `${Math.round(target * eased)}%`;
    if (progress < 1) requestAnimationFrame(frame);
  })(started);
}

export function openReport(app, { drill, session, onRunBack }) {
  const userId = app.session.user.id;
  const dialog = h('dialog', { class: 'report', 'aria-labelledby': 'report-title' });
  let runItBack = false;
  let step = 'feel';

  dialog.addEventListener('close', () => {
    dialog.remove();
    if (runItBack) onRunBack(); else app.go('#/');
  });
  const actions = () => h('div', { class: 'report__actions' },
    h('button', { class: 'btn btn--ghost', type: 'button', on: { click: () => { runItBack = true; dialog.close(); } } }, 'Run It Back'),
    h('button', { class: 'btn btn--primary', type: 'button', on: { click: () => dialog.close() } }, 'Done'));

  document.body.append(dialog);

  // Empty finish: nothing to grade, nothing to save, and the screen says so.
  if (!session.events.length) {
    step = 'done';
    drafts.clear(userId, drill.id);
    dialog.append(
      h('p', { class: 'eyebrow' }, drill.title),
      h('h2', { id: 'report-title', class: 'report__empty-title' }, 'No shots recorded'),
      h('p', { class: 'report__line' }, 'This session had zero attempts, so nothing was saved and there is no grade.'),
      actions());
    dialog.showModal();
    return;
  }

  // Freeze the workout. It goes into the outbox first so it survives a closed tab
  // or a failed request; it only leaves the outbox when the backend confirms it.
  const snapshot = buildSnapshot(session);
  outbox.put(userId, snapshot);
  drafts.clear(userId, drill.id);

  dialog.addEventListener('cancel', (event) => {
    if (step === 'feel') { event.preventDefault(); reveal(null); }
  });

  // --- step 1: feel check --------------------------------------------------
  const guess = h('input', { class: 'feel__range', type: 'range', min: '0', max: '100', step: '5', value: '50', id: 'feel-range', 'aria-describedby': 'feel-output' });
  const guessOutput = h('output', { class: 'feel__output', id: 'feel-output', for: 'feel-range' }, '50%');
  guess.addEventListener('input', () => { guessOutput.textContent = `${guess.value}%`; });
  dialog.append(
    h('p', { class: 'eyebrow' }, 'Before you look'),
    h('h2', { id: 'report-title', class: 'feel__title' }, 'Call your shot'),
    h('label', { class: 'report__line', for: 'feel-range' }, `You took ${snapshot.makes + snapshot.misses} shots. What percentage do you think went in?`),
    guessOutput,
    guess,
    h('div', { class: 'report__actions' },
      h('button', { class: 'btn btn--ghost', type: 'button', on: { click: () => reveal(null) } }, 'Skip'),
      h('button', { class: 'btn btn--primary', type: 'button', on: { click: () => reveal(Number(guess.value)) } }, 'Lock it in')));
  dialog.showModal();
  guess.focus();

  // --- step 2: the reveal --------------------------------------------------
  function reveal(feelGuess) {
    if (step !== 'feel') return;
    step = 'done';
    snapshot.feelGuess = feelGuess;
    outbox.put(userId, snapshot);

    const attempts = snapshot.makes + snapshot.misses;
    const percent = shootingPercent(snapshot.makes, attempts);
    const grade = gradeFor(percent, attempts);
    const detail = insights(snapshot, drill);

    const saveStatus = h('div', { class: 'save', role: 'status' });
    function paintSave(state, message) {
      const retry = h('button', { class: 'btn btn--small', type: 'button', on: { click: save } }, icon('retry'), 'Retry');
      const content = {
        saving: [h('span', { class: 'save__spinner', 'aria-hidden': 'true' }), 'Saving your workout…'],
        saved: [icon('check'), 'Saved to your logbook'],
        failed: [h('span', {}, `Not saved yet. ${message} Your workout is stored on this phone.`), retry],
        auth: [h('span', {}, 'Not saved: your session expired. Sign in again and it will save from the drills screen.')],
      }[state];
      saveStatus.className = `save save--${state}`;
      saveStatus.replaceChildren(...content);
    }
    async function save() {
      paintSave('saving');
      try {
        await saveSnapshot(app, snapshot);
        paintSave('saved'); // only after the backend confirms
      } catch (failure) {
        paintSave(failure.code === 'auth' ? 'auth' : 'failed', failure.code === 'network' ? 'No connection reached the server.' : failure.message);
      }
    }

    const percentEl = h('p', { class: 'report__percent', 'aria-hidden': 'true' }, '0%');
    const level = sessionLevel(snapshot.makes);
    const intoLevel = snapshot.makes % LEVEL_SIZE;
    const stat = (label, value) => h('div', { class: 'stat' }, h('dt', {}, label), h('dd', {}, String(value)));
    const card = (title, ...body) => h('section', { class: 'card' }, h('h3', { class: 'card__title' }, title), body);
    const canvas = h('canvas', { class: 'report__confetti', 'aria-hidden': 'true' });

    swap(dialog,
      canvas,
      h('p', { class: 'eyebrow' }, `${drill.title} · Session report`),
      h('h2', { id: 'report-title', class: `report__grade report__grade--${grade.key}` }, grade.label),
      percentEl,
      h('p', { class: 'sr-only' }, `Shooting percentage ${formatPercent(percent)}`),
      h('p', { class: 'report__line' }, grade.line),
      h('dl', { class: 'stats' }, stat('Makes', snapshot.makes), stat('Misses', snapshot.misses), stat('Attempts', attempts)),
      saveStatus,
      feelGuess === null ? null : card('Feel check',
        h('p', { class: 'feel__compare' }, h('span', {}, `You called ${feelGuess}%`), h('span', {}, `You shot ${formatPercent(percent)}`)),
        h('p', { class: 'card__note' }, describeFeelGap(detail.feelGap))),
      card('Shot tape',
        h('div', { class: 'tape tape--full', role: 'img', 'aria-label': `Shot order: ${detail.shots.map((made) => (made ? 'make' : 'miss')).join(', ')}` },
          detail.shots.map((made) => h('span', { class: `tape__dot ${made ? 'is-make' : 'is-miss'}` }))),
        h('p', { class: 'card__note' },
          `Filled is a make, ring is a miss. Best run: ${detail.bestRun} straight.`,
          detail.halves ? ` First half ${detail.halves.first.makes} of ${detail.halves.first.attempts}, second half ${detail.halves.second.makes} of ${detail.halves.second.attempts}.` : '',
          snapshot.durationSeconds ? ` ${attempts} shots in ${formatDuration(snapshot.durationSeconds)}.` : '')),
      drill.spots.length > 1 ? card('Shot map',
        courtDiagram(drill, { results: detail.spots, label: 'Makes and attempts by spot' }),
        h('ul', { class: 'spot-list' },
          detail.spots.filter((spot) => spot.attempts).map((spot) => h('li', {}, h('span', {}, spot.name), h('span', {}, `${spot.makes} of ${spot.attempts}`))),
          detail.bonus.attempts ? h('li', {}, h('span', {}, 'After the target'), h('span', {}, `${detail.bonus.makes} of ${detail.bonus.attempts}`)) : null)) : null,
      card(`Session level ${level}`,
        h('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Progress to next session level', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(levelProgressPercent(snapshot.makes)) },
          h('span', { class: 'progress__fill', style: `transform:scaleX(${levelProgressPercent(snapshot.makes) / 100})` })),
        h('p', { class: 'card__note' }, `${intoLevel} of ${LEVEL_SIZE} makes toward session level ${level + 1}. Session levels cover this workout only and reset each time.`)),
      actions());

    dialog.scrollTop = 0;
    dialog.querySelector('.btn--primary').focus({ preventScroll: true });
    countUp(percentEl, percent);
    if (!prefersReducedMotion()) confetti(canvas);
    track('report_viewed', { drillId: drill.id, sessionId: snapshot.id });
    save();
  }
}
