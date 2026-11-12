// On-device preview backend. It mirrors the Supabase adapter's contract so every
// screen and failure state can be exercised without a server. It is NOT a security
// boundary: anyone with the phone can read this storage. Production uses supabase.js.
import { BackendError } from './errors.js';
import { read, write, remove } from '../store.js';
import { validateLog } from '../rules.js';
import { DRILLS } from '../catalog.js';

const ACCOUNTS = 'itz.local.accounts';
const SESSION = 'itz.local.session';
const logsKey = (userId) => `itz.local.logs.${userId}`;
const tierKey = (userId) => `itz.local.tier.${userId}`;
const FAIL_SAVES = 'itz.dev.failSaves';

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function digest(text) {
  const bytes = new TextEncoder().encode(text);
  if (!crypto.subtle) return btoa(String.fromCharCode(...bytes)); // insecure context; preview only
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function createLocalBackend() {
  let session = null;

  const requireUser = () => {
    if (!session) throw new BackendError('auth', 'Sign in again to continue.');
    return session.user;
  };
  const accounts = () => read(ACCOUNTS, {});
  const ownAccount = () => accounts()[requireUser().email];
  const patchAccount = (changes) => {
    const all = accounts();
    all[requireUser().email] = { ...all[session.user.email], ...changes };
    write(ACCOUNTS, all);
  };

  return {
    mode: 'preview',

    async init() {
      session = read(SESSION);
      if (session && !accounts()[session.user.email]) session = null;
      return session;
    },

    async signUp({ email, password, displayName }) {
      await pause(250);
      const key = email.trim().toLowerCase();
      const all = accounts();
      if (all[key]) throw new BackendError('invalid', 'An account with that email already exists. Sign in instead.');
      const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
      all[key] = { id, displayName: displayName?.trim() || '', muted: false, secret: await digest(`${id}:${password}`) };
      write(ACCOUNTS, all);
      session = { user: { id, email: key } };
      write(SESSION, session);
      return { session, needsConfirmation: false };
    },

    async signIn({ email, password }) {
      await pause(250);
      const key = email.trim().toLowerCase();
      const account = accounts()[key];
      if (!account || account.secret !== await digest(`${account.id}:${password}`)) {
        throw new BackendError('invalid', 'That email and password do not match.');
      }
      session = { user: { id: account.id, email: key } };
      write(SESSION, session);
      return session;
    },

    async signOut() {
      session = null;
      remove(SESSION);
    },

    async requestPasswordReset() {
      await pause(250);
      throw new BackendError('invalid', 'Preview build: there is no email service here. Create a new account to keep testing.');
    },

    async updatePassword() {
      throw new BackendError('invalid', 'Password changes need the live backend.');
    },

    async getProfile() {
      const account = ownAccount();
      return { displayName: account.displayName, muted: account.muted };
    },

    async updateProfile({ displayName, muted }) {
      const changes = {};
      if (typeof displayName === 'string') changes.displayName = displayName.trim().slice(0, 40);
      if (typeof muted === 'boolean') changes.muted = muted;
      patchAccount(changes);
      return this.getProfile();
    },

    async getEntitlement() {
      return read(tierKey(requireUser().id), 'free');
    },

    // Preview-only. The Supabase adapter has no equivalent: tiers there are
    // written by the service role, never by the player.
    async previewSetTier(tier) {
      write(tierKey(requireUser().id), tier === 'pro' ? 'pro' : 'free');
    },

    async saveLog(snapshot) {
      const user = requireUser();
      await pause(350);
      const failuresLeft = read(FAIL_SAVES, 0);
      if (failuresLeft > 0) {
        write(FAIL_SAVES, failuresLeft - 1);
        throw new BackendError('network', 'Simulated network failure.');
      }
      const problem = validateLog(snapshot, DRILLS.map((drill) => drill.id));
      if (problem) throw new BackendError('invalid', problem);
      const drill = DRILLS.find((entry) => entry.id === snapshot.drillId);
      if (drill.pro && await this.getEntitlement() !== 'pro') throw new BackendError('invalid', 'This drill needs Pro access.');
      const logs = read(logsKey(user.id), {});
      if (!logs[snapshot.id]) logs[snapshot.id] = { ...snapshot, createdAt: Date.now() }; // retry-safe
      write(logsKey(user.id), logs);
    },

    async listLogs() {
      const logs = Object.values(read(logsKey(requireUser().id), {}));
      return logs.sort((a, b) => b.createdAt - a.createdAt);
    },
  };
}
