import { h, swap, svg, icon, formatPercent } from '../dom.js';
import { DRILLS, drillById } from '../catalog.js';
import { shootingPercent, gradeFor } from '../rules.js';

function sparkline(percents) {
  const width = 220;
  const height = 48;
  const step = percents.length > 1 ? width / (percents.length - 1) : 0;
  const point = (value, index) => `${(index * step).toFixed(1)},${(height - 4 - (value / 100) * (height - 8)).toFixed(1)}`;
  return svg('svg', { class: 'spark', viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': `Shooting percentage over the last ${percents.length} sessions, oldest first: ${percents.map(formatPercent).join(', ')}` },
    svg('polyline', { points: percents.map(point).join(' ') }),
    percents.map((value, index) => svg('circle', { cx: (index * step).toFixed(1), cy: point(value, index).split(',')[1], r: 2.5 })));
}

export function logbookView(app) {
  const body = h('div', { class: 'logbook__body' }, h('p', { class: 'section-note' }, 'Loading your sessions…'));

  async function load() {
    let logs;
    try {
      logs = await app.backend.listLogs();
    } catch (failure) {
      body.replaceChildren(h('div', { class: 'banner' }, h('p', {}, `Could not load your sessions. ${failure.message}`),
        h('button', { class: 'btn btn--small', type: 'button', on: { click: load } }, 'Retry')));
      return;
    }
    if (!logs.length) {
      body.replaceChildren(h('p', { class: 'section-note' }, 'No saved workouts yet. Finish a drill and it shows up here.'));
      return;
    }
    const careerMakes = logs.reduce((sum, log) => sum + log.makes, 0);
    const feelLogs = logs.filter((log) => log.feelGuess !== null && log.feelGuess !== undefined);
    const feelMiss = feelLogs.length
      ? Math.round(feelLogs.reduce((sum, log) => sum + Math.abs(shootingPercent(log.makes, log.makes + log.misses) - log.feelGuess), 0) / feelLogs.length)
      : null;
    const stat = (label, value) => h('div', { class: 'stat' }, h('dt', {}, label), h('dd', {}, value));

    const drillSections = DRILLS.map((drill) => {
      const drillLogs = logs.filter((log) => log.drillId === drill.id);
      if (!drillLogs.length) return null;
      const percents = drillLogs.slice(0, 12).reverse().map((log) => shootingPercent(log.makes, log.makes + log.misses));
      return h('section', { class: 'card' },
        h('h3', { class: 'card__title' }, drill.title),
        percents.length > 1 ? sparkline(percents) : h('p', { class: 'card__note' }, 'One session so far. The trend line starts with the next one.'),
        h('ul', { class: 'log-list' }, drillLogs.slice(0, 8).map((log) => {
          const attempts = log.makes + log.misses;
          const percent = shootingPercent(log.makes, attempts);
          return h('li', {},
            h('span', { class: 'log-list__date' }, new Date(log.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })),
            h('span', {}, `${log.makes} of ${attempts}`),
            h('span', { class: 'log-list__pct' }, formatPercent(percent)),
            h('span', { class: 'log-list__grade' }, gradeFor(percent, attempts).label));
        })));
    });

    swap(body,
      h('dl', { class: 'stats' },
        stat('Workouts', String(logs.length)),
        stat('Career makes', String(careerMakes)),
        stat('Feel check', feelMiss === null ? '—' : `±${feelMiss}`)),
      feelMiss === null ? null : h('p', { class: 'section-note' }, `On average your call lands within ${feelMiss} points of what you actually shot.`),
      drillSections);
  }

  const nameInput = h('input', { class: 'field__input', type: 'text', maxlength: '40', value: app.profile?.displayName || '', autocomplete: 'nickname' });
  const nameStatus = h('p', { class: 'field__hint', role: 'status' });
  const nameForm = h('form', { class: 'card', on: { submit: async (event) => {
    event.preventDefault();
    nameStatus.textContent = 'Saving…';
    try {
      app.profile = await app.backend.updateProfile({ displayName: nameInput.value });
      nameStatus.textContent = 'Saved.';
    } catch (failure) {
      nameStatus.textContent = `Not saved. ${failure.message}`;
    }
  } } },
    h('h3', { class: 'card__title' }, 'Profile'),
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Display name'), nameInput),
    h('button', { class: 'btn btn--small', type: 'submit' }, 'Save name'),
    nameStatus,
    h('p', { class: 'field__hint' }, `Signed in as ${app.session.user.email}`));

  load();
  return { el: h('main', { class: 'logbook' },
    h('header', { class: 'topbar' },
      h('a', { class: 'icon-btn', href: '#/', 'aria-label': 'Back to drills' }, icon('back')),
      h('div', { class: 'topbar__title' }, h('h1', {}, 'Logbook'))),
    body,
    nameForm) };
}
