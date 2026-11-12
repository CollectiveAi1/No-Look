import { h, icon, formatPercent } from '../dom.js';
import { BRAND } from '../brand.js';
import { DRILLS } from '../catalog.js';
import { drafts, outbox } from '../store.js';
import { shootingPercent } from '../rules.js';
import { flushOutbox } from '../sync.js';
import { courtDiagram } from '../court.js';

function daysAgo(timestamp) {
  const days = Math.floor((Date.now() - timestamp) / 86_400_000);
  if (days <= 0) return 'today';
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

export function muteButton(app) {
  const button = h('button', { class: 'icon-btn', type: 'button' });
  const paint = () => {
    button.replaceChildren(icon(app.muted ? 'muted' : 'sound'));
    button.setAttribute('aria-label', app.muted ? 'Unmute sound' : 'Mute sound');
    button.setAttribute('aria-pressed', String(app.muted));
    button.title = app.muted ? 'Sound is off' : 'Sound is on';
  };
  button.addEventListener('click', () => { app.setMuted(!app.muted); paint(); });
  paint();
  return button;
}

export function libraryView(app) {
  const userId = app.session.user.id;
  const isPro = app.entitlement === 'pro';
  const lastResults = new Map();

  const syncBanner = h('div', { class: 'banner', role: 'status' });
  function paintSync(pending, busy = false) {
    if (!pending) return syncBanner.replaceChildren();
    const retry = h('button', { class: 'btn btn--small', type: 'button', disabled: busy, on: { click: runSync } }, busy ? 'Saving…' : 'Save now');
    syncBanner.replaceChildren(h('p', {},
      `${pending} finished workout${pending === 1 ? ' is' : 's are'} stored on this phone and not saved to your account yet.`), retry);
  }
  async function runSync() {
    paintSync(outbox.list(userId).length, true);
    paintSync(await flushOutbox(app));
    loadResults();
  }

  function drillCard(drill) {
    const locked = drill.pro && !isPro;
    const draft = drafts.load(userId, drill.id);
    const logged = draft?.events?.length || 0;
    const last = lastResults.get(drill.id);
    const action = locked ? 'Locked' : logged ? 'Resume' : 'Start';
    return h('li', {},
      h('a', { class: `drill${locked ? ' drill--locked' : ''}`, href: `#/train/${drill.id}` },
        h('div', { class: 'drill__body' },
          h('p', { class: 'eyebrow' }, drill.category),
          h('h3', { class: 'drill__title' }, drill.title),
          h('p', { class: 'drill__desc' }, drill.description),
          h('p', { class: 'drill__meta' },
            `Target: ${drill.targetAttempts} attempts`,
            last ? ` · Last: ${formatPercent(shootingPercent(last.makes, last.makes + last.misses))}, ${daysAgo(last.createdAt)}` : ''),
          h('span', { class: `drill__action${locked ? ' is-locked' : ''}` },
            locked ? icon('lock') : null,
            logged && !locked ? `${action} · ${logged} logged` : action)),
        courtDiagram(drill, { label: `Court spots for ${drill.title}` })));
  }

  const freeList = h('ul', { class: 'drill-list' });
  const proList = h('ul', { class: 'drill-list' });
  function paintDrills() {
    freeList.replaceChildren(...DRILLS.filter((drill) => !drill.pro).map(drillCard));
    proList.replaceChildren(...DRILLS.filter((drill) => drill.pro).map(drillCard));
  }
  async function loadResults() {
    try {
      const logs = await app.backend.listLogs();
      lastResults.clear();
      for (const log of logs) if (!lastResults.has(log.drillId)) lastResults.set(log.drillId, log);
      paintDrills();
    } catch { /* last results are a nicety; the library works without them */ }
  }

  const name = app.profile?.displayName;
  const root = h('main', { class: 'library' },
    h('header', { class: 'topbar' },
      h('p', { class: 'wordmark' }, BRAND.name),
      h('div', { class: 'topbar__actions' },
        muteButton(app),
        h('a', { class: 'icon-btn', href: '#/logbook', 'aria-label': 'Logbook' }, icon('book')),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Sign out', on: { click: () => app.signOut() } }, icon('out')))),
    h('section', { class: 'hello' },
      h('h1', {}, name ? `Ready, ${name}?` : 'Ready to shoot?'),
      h('p', {}, 'Log every shot. Your percentage stays hidden until you finish.')),
    navigator.onLine ? null : h('p', { class: 'banner banner--quiet' }, 'You are offline. Videos need a connection; shot tracking does not.'),
    syncBanner,
    h('section', { 'aria-labelledby': 'free-heading' },
      h('h2', { class: 'section-title', id: 'free-heading' }, 'Drills'),
      freeList),
    h('section', { 'aria-labelledby': 'pro-heading' },
      h('h2', { class: 'section-title', id: 'pro-heading' }, 'Pro Series'),
      isPro ? null : h('p', { class: 'section-note' }, 'Locked. Pro access is granted to your account by your coach.'),
      proList),
    app.backend.mode === 'preview' ? h('p', { class: 'preview-note' }, 'Preview build: data stays on this device.') : null);

  paintDrills();
  paintSync(outbox.list(userId).length);
  if (outbox.list(userId).length) runSync(); else loadResults();
  window.addEventListener('online', runSync);
  return { el: root, destroy: () => window.removeEventListener('online', runSync) };
}
