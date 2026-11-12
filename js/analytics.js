import { CONFIG } from './config.js';

// Events carry drill id, session id, timestamp and app version only.
// Never pass emails, names, passwords or tokens through here.
const recent = [];

export function track(name, fields = {}) {
  const event = { name, at: Date.now(), appVersion: CONFIG.appVersion, ...fields };
  recent.push(event);
  if (recent.length > 200) recent.shift();
  try { CONFIG.analyticsSink?.(name, event); } catch { /* analytics must never break a workout */ }
}

export const recentEvents = () => [...recent];
