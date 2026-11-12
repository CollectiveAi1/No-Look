// All feedback sound is synthesized, so there are no audio files to load or fail.
// Every entry point swallows playback errors: a blocked AudioContext must never
// stop a shot from being counted.
let context = null;
let noiseBuffer = null;

function ensureContext() {
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return null;
  if (!context) {
    context = new AudioCtor();
    noiseBuffer = context.createBuffer(1, context.sampleRate * 0.4, context.sampleRate);
    const samples = noiseBuffer.getChannelData(0);
    for (let i = 0; i < samples.length; i += 1) samples[i] = Math.random() * 2 - 1;
  }
  if (context.state === 'suspended') context.resume().catch(() => {});
  return context;
}

function tone(ctx, frequency, start, duration, peak, type = 'sine') {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

// Pentatonic steps: each consecutive make climbs, so a hot run is audible without a number on screen.
const RUN_SCALE = [392, 440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5];

export function playMake(run) {
  try {
    const ctx = ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    // Net: band-passed noise sweeping upward.
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.9;
    filter.frequency.setValueAtTime(1400, now);
    filter.frequency.exponentialRampToValueAtTime(6200, now + 0.2);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.32, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start(now);
    source.stop(now + 0.32);
    tone(ctx, RUN_SCALE[Math.min(Math.max(run, 1), RUN_SCALE.length) - 1], now + 0.02, 0.22, 0.09, 'triangle');
  } catch { /* silent by design */ }
}

export function playMiss() {
  try {
    const ctx = ensureContext();
    if (ctx) tone(ctx, 150, ctx.currentTime, 0.09, 0.07);
  } catch { /* silent by design */ }
}

export function playMove() {
  try {
    const ctx = ensureContext();
    if (!ctx) return;
    tone(ctx, 660, ctx.currentTime, 0.1, 0.08);
    tone(ctx, 990, ctx.currentTime + 0.11, 0.14, 0.08);
  } catch { /* silent by design */ }
}

export function buzz(pattern) {
  try { navigator.vibrate?.(pattern); } catch { /* unsupported */ }
}
