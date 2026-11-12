// Pure session rules. No DOM, no storage: everything here is covered by tests/.
export const LEVEL_SIZE = 25;

export const GRADES = [
  { min: 70, key: 'elite', label: 'ELITE', line: 'That was a clinic.' },
  { min: 50, key: 'dialed', label: 'DIALED', line: 'Locked in. Keep stacking days like this.' },
  { min: 30, key: 'grinding', label: 'GRINDING', line: 'Honest work. The reps are adding up.' },
  { min: -Infinity, key: 'work', label: 'WORK MODE', line: 'Every shooter has these days. One session is not the story.' },
];

export function newSessionId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  // Fallback for non-secure contexts; still RFC 4122 v4 shaped.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function newSession(drillId, now = Date.now()) {
  return { id: newSessionId(), drillId, startedAt: now, events: [], cue: null };
}

export function recordShot(session, made, now = Date.now()) {
  return { ...session, events: [...session.events, { made: Boolean(made), at: now }] };
}

// Undo is chronological: it always removes the most recent event.
export function undoShot(session) {
  if (!session.events.length) return session;
  return { ...session, events: session.events.slice(0, -1) };
}

export function totals(events) {
  let makes = 0;
  for (const event of events) if (event.made) makes += 1;
  return { makes, misses: events.length - makes, attempts: events.length };
}

export function shootingPercent(makes, attempts) {
  if (!attempts) return 0;
  return Math.round((makes / attempts) * 1000) / 10;
}

// Grades key off the displayed one-decimal percentage. Empty sessions get no grade.
export function gradeFor(percent, attempts) {
  if (!attempts) return null;
  return GRADES.find((grade) => percent >= grade.min);
}

export const sessionLevel = (makes) => Math.floor(makes / LEVEL_SIZE) + 1;
export const levelProgressPercent = (makes) => ((makes % LEVEL_SIZE) / LEVEL_SIZE) * 100;

// Trailing run of makes. Drives the ambient heat line and chime pitch; never shown as a number.
export function currentRun(events) {
  let run = 0;
  for (let i = events.length - 1; i >= 0 && events[i].made; i -= 1) run += 1;
  return run;
}

// Spot is a function of attempt order, so it never needs to be stored per shot.
export function spotIndexForAttempt(drill, attemptIndex) {
  if (!drill.spots || drill.spots.length < 2) return drill.spots?.length ? 0 : null;
  const index = Math.floor(attemptIndex / drill.perSpot);
  return index < drill.spots.length ? index : null; // null = past the target, free shooting
}

export function buildSnapshot(session, feelGuess = null, now = Date.now()) {
  const { makes, misses } = totals(session.events);
  return {
    id: session.id,
    drillId: session.drillId,
    makes,
    misses,
    sequence: session.events.map((event) => (event.made ? '1' : '0')).join(''),
    startedAt: session.startedAt,
    endedAt: now,
    durationSeconds: session.events.length > 1
      ? Math.round((session.events[session.events.length - 1].at - session.events[0].at) / 1000)
      : 0,
    feelGuess,
    cue: session.cue,
  };
}

export function insights(snapshot, drill) {
  const shots = [...snapshot.sequence].map((char) => char === '1');
  const attempts = shots.length;
  let bestRun = 0;
  let run = 0;
  for (const made of shots) {
    run = made ? run + 1 : 0;
    if (run > bestRun) bestRun = run;
  }

  const spots = (drill?.spots || []).map((spot) => ({ ...spot, makes: 0, attempts: 0 }));
  const bonus = { makes: 0, attempts: 0 };
  shots.forEach((made, index) => {
    const spotIndex = drill ? spotIndexForAttempt(drill, index) : null;
    const bucket = spotIndex === null ? bonus : spots[spotIndex];
    bucket.attempts += 1;
    if (made) bucket.makes += 1;
  });

  let halves = null;
  if (attempts >= 8) {
    const cut = Math.ceil(attempts / 2);
    const count = (list) => ({ makes: list.filter(Boolean).length, attempts: list.length });
    halves = { first: count(shots.slice(0, cut)), second: count(shots.slice(cut)) };
  }

  const percent = shootingPercent(snapshot.makes, attempts);
  const feelGap = snapshot.feelGuess === null || snapshot.feelGuess === undefined || !attempts
    ? null
    : Math.round((percent - snapshot.feelGuess) * 10) / 10;

  return {
    shots,
    bestRun,
    spots,
    bonus,
    halves,
    feelGap,
    secondsPerShot: attempts > 1 && snapshot.durationSeconds ? snapshot.durationSeconds / (attempts - 1) : null,
  };
}

export function describeFeelGap(gap) {
  if (gap === null) return null;
  const size = Math.abs(gap);
  if (size <= 5) return 'Your feel matched the numbers. That is a calibrated shooter.';
  return gap > 0
    ? 'You shot better than it felt. Trust the work.'
    : 'It felt better than it went. Check the adjustment cues next time.';
}

export function validateLog(log, allowedDrillIds) {
  const isCount = (value) => Number.isInteger(value) && value >= 0;
  if (!log || typeof log.id !== 'string' || log.id.length < 8) return 'Missing session id';
  if (!allowedDrillIds.includes(log.drillId)) return 'Unknown drill';
  if (!isCount(log.makes) || !isCount(log.misses)) return 'Counts must be non-negative whole numbers';
  if (log.makes + log.misses === 0) return 'Empty sessions are not saved';
  if (log.sequence && log.sequence.length !== log.makes + log.misses) return 'Shot history does not match totals';
  if (log.feelGuess !== null && log.feelGuess !== undefined && !(log.feelGuess >= 0 && log.feelGuess <= 100)) return 'Feel guess out of range';
  return null;
}
