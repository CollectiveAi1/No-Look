// Supabase adapter over plain fetch (no SDK, no build step).
// Written against the schema in supabase/migrations/0001_init.sql.
// Not yet exercised against a live project: run the README release checks first.
import { BackendError } from './errors.js';
import { read, write, remove } from '../store.js';

const SESSION = 'itz.sb.session';

export function createSupabaseBackend({ supabaseUrl, supabaseAnonKey }) {
  const base = supabaseUrl.replace(/\/$/, '');
  let session = read(SESSION);

  const storeSession = (payload) => {
    session = {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      expiresAt: Date.now() + (payload.expires_in || 3600) * 1000,
      user: { id: payload.user.id, email: payload.user.email },
    };
    write(SESSION, session);
    return session;
  };
  const dropSession = () => { session = null; remove(SESSION); };

  async function call(path, { method = 'GET', body, token, headers = {} } = {}) {
    let response;
    try {
      response = await fetch(`${base}${path}`, {
        method,
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${token || supabaseAnonKey}`,
          'Content-Type': 'application/json',
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new BackendError('network', 'No connection. Check your signal and try again.');
    }
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (response.ok) return payload;
    const message = payload?.msg || payload?.error_description || payload?.message || 'Something went wrong.';
    if (response.status === 401) throw new BackendError('auth', 'Your session expired. Sign in again.');
    if (response.status >= 500 || response.status === 429) throw new BackendError('network', 'The server is busy. Try again in a moment.');
    throw new BackendError('invalid', message);
  }

  async function freshToken() {
    if (!session) throw new BackendError('auth', 'Sign in again to continue.');
    if (session.expiresAt - Date.now() > 60_000) return session.accessToken;
    try {
      const payload = await call('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        body: { refresh_token: session.refreshToken },
      });
      return storeSession(payload).accessToken;
    } catch (error) {
      if (error.code !== 'network') dropSession();
      throw error.code === 'network' ? error : new BackendError('auth', 'Your session expired. Sign in again.');
    }
  }

  const authed = async (path, options = {}) => call(path, { ...options, token: await freshToken() });
  const mine = () => `user_id=eq.${session.user.id}`;

  return {
    mode: 'supabase',

    async init() {
      // Recovery emails return to the site with tokens in the URL fragment.
      const fragment = new URLSearchParams(location.hash.replace(/^#\/?/, ''));
      if (fragment.get('access_token') && fragment.get('type') === 'recovery') {
        const accessToken = fragment.get('access_token');
        const user = await call('/auth/v1/user', { token: accessToken });
        storeSession({
          access_token: accessToken,
          refresh_token: fragment.get('refresh_token'),
          expires_in: Number(fragment.get('expires_in')) || 3600,
          user,
        });
        history.replaceState(null, '', `${location.pathname}#/reset`);
      }
      return session;
    },

    async signUp({ email, password, displayName }) {
      const payload = await call('/auth/v1/signup', {
        method: 'POST',
        body: { email, password, data: { display_name: displayName?.trim() || '' } },
      });
      // With email confirmation on, Supabase returns a user but no access token.
      if (!payload.access_token) return { session: null, needsConfirmation: true };
      return { session: storeSession(payload), needsConfirmation: false };
    },

    async signIn({ email, password }) {
      const payload = await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
      return storeSession(payload);
    },

    async signOut() {
      const token = session?.accessToken;
      dropSession();
      if (token) await call('/auth/v1/logout', { method: 'POST', token }).catch(() => {});
    },

    async requestPasswordReset(email) {
      await call('/auth/v1/recover', { method: 'POST', body: { email } });
    },

    async updatePassword(password) {
      await authed('/auth/v1/user', { method: 'PUT', body: { password } });
    },

    async getProfile() {
      const rows = await authed(`/rest/v1/profiles?select=display_name,muted&${mine()}`);
      if (!rows.length) throw new BackendError('invalid', 'Profile not found.');
      return { displayName: rows[0].display_name || '', muted: rows[0].muted };
    },

    async updateProfile({ displayName, muted }) {
      const changes = {};
      if (typeof displayName === 'string') changes.display_name = displayName.trim().slice(0, 40);
      if (typeof muted === 'boolean') changes.muted = muted;
      await authed(`/rest/v1/profiles?${mine()}`, { method: 'PATCH', body: changes, headers: { Prefer: 'return=minimal' } });
      return this.getProfile();
    },

    async getEntitlement() {
      const rows = await authed(`/rest/v1/entitlements?select=tier&${mine()}`);
      return rows[0]?.tier === 'pro' ? 'pro' : 'free';
    },

    async saveLog(snapshot) {
      // The client-generated id is the primary key, so a retry cannot create a second row.
      await authed('/rest/v1/drill_logs?on_conflict=id', {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: {
          id: snapshot.id,
          user_id: session.user.id,
          drill_id: snapshot.drillId,
          makes: snapshot.makes,
          misses: snapshot.misses,
          shot_sequence: snapshot.sequence,
          feel_guess: snapshot.feelGuess,
          duration_seconds: snapshot.durationSeconds,
          started_at: new Date(snapshot.startedAt).toISOString(),
        },
      });
    },

    async listLogs() {
      const rows = await authed(`/rest/v1/drill_logs?select=*&${mine()}&order=created_at.desc&limit=200`);
      return rows.map((row) => ({
        id: row.id,
        drillId: row.drill_id,
        makes: row.makes,
        misses: row.misses,
        sequence: row.shot_sequence || '',
        feelGuess: row.feel_guess,
        durationSeconds: row.duration_seconds || 0,
        startedAt: Date.parse(row.started_at),
        createdAt: Date.parse(row.created_at),
      }));
    },
  };
}
