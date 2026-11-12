import { outbox } from './store.js';
import { track } from './analytics.js';

// One in-flight save per session id: a double tap on Finish or Retry shares the same request.
const inFlight = new Map();

export function saveSnapshot(app, snapshot) {
  if (inFlight.has(snapshot.id)) return inFlight.get(snapshot.id);
  const userId = app.session.user.id;
  const attempt = app.backend.saveLog(snapshot)
    .then(() => {
      outbox.remove(userId, snapshot.id);
      track('save_succeeded', { drillId: snapshot.drillId, sessionId: snapshot.id });
    })
    .catch((error) => {
      track('save_failed', { drillId: snapshot.drillId, sessionId: snapshot.id, reason: error.code || 'unknown' });
      throw error;
    })
    .finally(() => inFlight.delete(snapshot.id));
  inFlight.set(snapshot.id, attempt);
  return attempt;
}

// Returns how many finished workouts are still waiting.
export async function flushOutbox(app) {
  if (!app.session) return 0;
  const userId = app.session.user.id;
  for (const snapshot of outbox.list(userId)) {
    try { await saveSnapshot(app, snapshot); } catch { /* stays queued; surfaced in the library */ }
  }
  return outbox.list(userId).length;
}
