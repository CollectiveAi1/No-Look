// Open /tests/ in a browser. Covers the rule-level examples from the PRD (section 14).
import * as rules from '../js/rules.js';
import { DRILLS, drillById } from '../js/catalog.js';
import { createLocalBackend } from '../js/backend/local.js';
import { saveSnapshot } from '../js/sync.js';
import { outbox, write } from '../js/store.js';

const results = [];
const equal = (actual, expected, label) => {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  results.push({ pass, label: pass ? label : `${label} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})` });
};
const play = (pattern, drillId = 'form-shooting') =>
  [...pattern].reduce((session, char) => rules.recordShot(session, char === '1'), rules.newSession(drillId));

// Tracking
let session = rules.newSession('form-shooting');
equal(rules.totals(session.events), { makes: 0, misses: 0, attempts: 0 }, 'new session starts at zero');
equal(rules.totals(play('1').events), { makes: 1, misses: 0, attempts: 1 }, 'make adds one make and one attempt');
equal(rules.totals(play('0').events), { makes: 0, misses: 1, attempts: 1 }, 'miss adds one miss, leaves makes');

// Chronological undo
session = play('101');
equal(rules.totals(session.events), { makes: 2, misses: 1, attempts: 3 }, 'make, miss, make = 2 makes / 3 attempts');
session = rules.undoShot(session);
equal(rules.totals(session.events), { makes: 1, misses: 1, attempts: 2 }, 'undo removes the last event (a make)');
session = rules.undoShot(rules.undoShot(rules.undoShot(session)));
equal(rules.totals(session.events), { makes: 0, misses: 0, attempts: 0 }, 'undo on empty history is a no-op, never negative');

// Formulas
equal(rules.shootingPercent(1, 4), 25, '1 make and 3 misses = 25%');
equal(rules.shootingPercent(7, 10), 70, '7 of 10 = 70%');
equal(rules.shootingPercent(1, 3), 33.3, '1 of 3 = 33.3%');
equal(rules.shootingPercent(0, 0), 0, 'empty session = 0%');
equal(rules.gradeFor(70, 10).label, 'ELITE', '70% is ELITE');
equal(rules.gradeFor(69.9, 10).label, 'DIALED', '69.9% is DIALED');
equal(rules.gradeFor(50, 10).label, 'DIALED', '50% is DIALED');
equal(rules.gradeFor(49.9, 10).label, 'GRINDING', '49.9% is GRINDING');
equal(rules.gradeFor(33.3, 3).label, 'GRINDING', '33.3% is GRINDING');
equal(rules.gradeFor(30, 10).label, 'GRINDING', '30% is GRINDING');
equal(rules.gradeFor(29.9, 10).label, 'WORK MODE', '29.9% is WORK MODE');
equal(rules.gradeFor(0, 0), null, 'empty session has no grade');
equal([rules.sessionLevel(24), rules.levelProgressPercent(24)], [1, 96], '24 makes = level 1, 96%');
equal([rules.sessionLevel(25), rules.levelProgressPercent(25)], [2, 0], '25 makes = level 2, 0%');

// Catalog
equal(DRILLS.map((drill) => drill.targetAttempts), [25, 50, 75], 'targets are 25, 50, 75');
equal(DRILLS.every((drill) => drill.spots.length * drill.perSpot === drill.targetAttempts), true, 'spots x shots per spot = target');
const longCues = DRILLS.flatMap((drill) => Object.values(drill.coaching).flat()).filter((cue) => cue.split(/\s+/).filter((word) => /\w/.test(word)).length > 8);
equal(longCues, [], 'every coaching cue is eight words or fewer');

// Spots and insights
const midRange = drillById('spot-up-5');
equal([0, 9, 10, 49, 50].map((index) => rules.spotIndexForAttempt(midRange, index)), [0, 0, 1, 4, null], 'spot rotates every ten attempts, then free shooting');
const snapshot = rules.buildSnapshot(play('1110111100' + '0000000000', 'spot-up-5'), 60);
const detail = rules.insights(snapshot, midRange);
equal(detail.bestRun, 4, 'best run counts the longest streak of makes');
equal([detail.spots[0].makes, detail.spots[0].attempts, detail.spots[1].makes], [7, 10, 0], 'per-spot totals follow attempt order');
equal(detail.feelGap, -25, 'feel gap = actual minus called');
equal(rules.currentRun(play('0111').events), 3, 'current run counts trailing makes');

// Validation
const ids = DRILLS.map((drill) => drill.id);
equal(rules.validateLog({ ...snapshot, makes: -1 }, ids) !== null, true, 'negative counts rejected');
equal(rules.validateLog({ ...snapshot, drillId: 'nope' }, ids) !== null, true, 'unknown drill rejected');
equal(rules.validateLog(snapshot, ids), null, 'valid log accepted');

// Persistence: failure keeps the workout, retry stores exactly one log, free players cannot save Pro logs.
const backend = createLocalBackend();
const email = `test-${Date.now()}@example.test`;
await backend.signUp({ email, password: 'not-a-real-password', displayName: 'Test' });
const app = { backend, session: await backend.init() };
const userId = app.session.user.id;
const finished = rules.buildSnapshot(play('1111111000'));
outbox.put(userId, finished);
write('itz.dev.failSaves', 1);
let firstFailed = false;
try { await saveSnapshot(app, finished); } catch { firstFailed = true; }
equal([firstFailed, outbox.list(userId).length, (await backend.listLogs()).length], [true, 1, 0], 'failed save keeps the workout queued and writes nothing');
await Promise.all([saveSnapshot(app, finished), saveSnapshot(app, finished)]);
await saveSnapshot(app, finished);
equal([(await backend.listLogs()).length, outbox.list(userId).length], [1, 0], 'double tap plus retry stores exactly one log');
equal((await backend.listLogs())[0].makes, 7, 'saved log reads back with matching totals');
let proBlocked = false;
try { await backend.saveLog(rules.buildSnapshot(play('11', 'elite-3pt-flow'))); } catch { proBlocked = true; }
equal([proBlocked, await backend.getEntitlement()], [true, 'free'], 'free player cannot save a Pro drill log');
let emptyBlocked = false;
try { await backend.saveLog(rules.buildSnapshot(rules.newSession('form-shooting'))); } catch { emptyBlocked = true; }
equal(emptyBlocked, true, 'zero-attempt session is never stored');
await backend.signOut();

const failed = results.filter((result) => !result.pass).length;
document.getElementById('summary').textContent = failed ? `${failed} of ${results.length} failed` : `All ${results.length} passed`;
document.title = failed ? `FAIL ${failed}/${results.length}` : `PASS ${results.length}/${results.length}`;
document.getElementById('results').append(...results.map((result) => {
  const item = document.createElement('li');
  item.className = result.pass ? 'pass' : 'fail';
  item.textContent = result.label;
  return item;
}));
