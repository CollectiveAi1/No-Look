// Small JSON wrapper over localStorage. Falls back to memory when storage is
// blocked (private mode), so the workout still runs; it just will not survive a reload.
const memory = new Map();

export function read(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? (memory.has(key) ? memory.get(key) : fallback) : JSON.parse(raw);
  } catch {
    return memory.has(key) ? memory.get(key) : fallback;
  }
}

export function write(key, value) {
  memory.set(key, value);
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* quota or blocked storage: memory copy still holds this session */ }
}

export function remove(key) {
  memory.delete(key);
  try { localStorage.removeItem(key); } catch { /* nothing to clean up */ }
}

const draftKey = (userId, drillId) => `itz.draft.${userId}.${drillId}`;
const outboxKey = (userId) => `itz.outbox.${userId}`;

export const drafts = {
  load: (userId, drillId) => read(draftKey(userId, drillId)),
  save: (userId, session) => write(draftKey(userId, session.drillId), session),
  clear: (userId, drillId) => remove(draftKey(userId, drillId)),
};

// Finished workouts wait here until the backend confirms them.
export const outbox = {
  list: (userId) => read(outboxKey(userId), []),
  put(userId, snapshot) {
    const pending = outbox.list(userId).filter((entry) => entry.id !== snapshot.id);
    write(outboxKey(userId), [...pending, snapshot]);
  },
  remove(userId, snapshotId) {
    write(outboxKey(userId), outbox.list(userId).filter((entry) => entry.id !== snapshotId));
  },
};
