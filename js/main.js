import { h } from './dom.js';
import { createBackend } from './backend/index.js';
import { read, write } from './store.js';
import { track } from './analytics.js';
import { authView, resetView } from './views/auth.js';
import { libraryView } from './views/library.js';
import { trainView } from './views/train.js';
import { logbookView } from './views/logbook.js';

const MUTED = 'itz.muted';
const RETURN_TO = 'itz.returnTo';
const mount = document.getElementById('app');
let current = null;

// Test hook for the release checklist: /?failSaves=2 makes the next two preview saves fail.
const failSaves = new URLSearchParams(location.search).get('failSaves');
if (failSaves !== null) write('itz.dev.failSaves', Number(failSaves) || 0);

const app = {
  backend: createBackend(),
  session: null,
  profile: null,
  entitlement: null,
  muted: read(MUTED, false),

  go(hash) {
    if (location.hash === hash) render(); else location.hash = hash;
  },
  rerender: () => render(),

  setMuted(muted) {
    app.muted = muted;
    write(MUTED, muted);
    track('mute_changed', { muted });
    if (app.session) app.backend.updateProfile({ muted }).catch(() => { /* local preference already applied */ });
  },

  async refreshAccount() {
    [app.profile, app.entitlement] = await Promise.all([app.backend.getProfile(), app.backend.getEntitlement()]);
  },

  async onSignedIn() {
    app.session = await app.backend.init();
    await loadAccount();
    const target = sessionStorage.getItem(RETURN_TO) || '#/';
    sessionStorage.removeItem(RETURN_TO);
    app.go(target);
  },

  async signOut() {
    await app.backend.signOut();
    app.session = null;
    app.profile = null;
    app.entitlement = null;
    app.go('#/auth');
  },
};

function show(view) {
  current?.destroy?.();
  current = view;
  mount.replaceChildren(view.el);
  window.scrollTo(0, 0);
}

function statusScreen(title, text, actions = []) {
  return { el: h('main', { class: 'message' }, h('h1', {}, title), h('p', {}, text), actions) };
}

async function loadAccount() {
  await app.refreshAccount();
  // The account's saved preference wins on a fresh sign-in.
  app.muted = app.profile.muted;
  write(MUTED, app.muted);
}

function render() {
  const route = location.hash.replace(/^#/, '') || '/';
  if (!app.session) {
    if (route !== '/auth') {
      if (route !== '/') sessionStorage.setItem(RETURN_TO, `#${route}`);
      location.replace('#/auth');
      return;
    }
    return show(authView(app));
  }
  if (route === '/auth') { location.replace('#/'); return; }
  if (route === '/reset') return show(resetView(app));
  if (route === '/logbook') return show(logbookView(app));
  const train = route.match(/^\/train\/([\w-]+)$/);
  if (train) return show(trainView(app, train[1]));
  if (route === '/') return show(libraryView(app));
  show(statusScreen('Page not found', 'That address does not match a screen in the app.',
    [h('a', { class: 'btn btn--primary', href: '#/' }, 'Back to drills')]));
}

async function boot() {
  show(statusScreen('Loading…', 'Getting your account ready.'));
  try {
    app.session = await app.backend.init();
    if (app.session) await loadAccount();
  } catch (failure) {
    if (failure.code === 'auth') {
      app.session = null;
    } else {
      // Bounded failure state: never an endless spinner.
      return show(statusScreen('Could not load your account', failure.message || 'Check your connection and try again.', [
        h('button', { class: 'btn btn--primary', type: 'button', on: { click: boot } }, 'Try again'),
        h('button', { class: 'btn btn--ghost', type: 'button', on: { click: () => app.signOut() } }, 'Sign out'),
      ]));
    }
  }
  render();
}

window.addEventListener('hashchange', render);
boot();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => { /* app works without offline shell */ }));
}
