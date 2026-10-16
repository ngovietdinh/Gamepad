import { store } from '../core/store';

/**
 * All sounds are synthesised with Web Audio, so the app ships no audio files
 * and works offline. The completion melody is a plucked-string (Karplus–Strong)
 * phrase on a Vietnamese pentatonic scale, a nod to the đàn tranh.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const pluckCache = new Map<number, AudioBuffer>();

// Điệu Bắc pentatonic: C D F G A, two octaves.
const SCALE = [261.63, 293.66, 349.23, 392.0, 440.0, 523.25, 587.33, 698.46, 783.99, 880.0];

function ac(): AudioContext | null {
  if (!store.settings.sound) return null;
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.7;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Call from a user gesture so iOS lets audio play. */
export function unlockAudio() {
  const c = ac();
  if (!c) return;
  const b = c.createBuffer(1, 1, c.sampleRate);
  const s = c.createBufferSource();
  s.buffer = b;
  s.connect(master!);
  s.start();
}

function noiseBuffer(c: AudioContext, ms: number) {
  const n = Math.floor((c.sampleRate * ms) / 1000);
  const b = c.createBuffer(1, n, c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
  return b;
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, delay = 0, glideTo?: number) {
  const c = ac();
  if (!c || !master) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(ms: number, freq: number, q: number, vol: number, delay = 0) {
  const c = ac();
  if (!c || !master) return;
  const t = c.currentTime + delay;
  const s = c.createBufferSource();
  s.buffer = noiseBuffer(c, ms);
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.value = vol;
  s.connect(f).connect(g).connect(master);
  s.start(t);
}

function pluckBuffer(c: AudioContext, freq: number): AudioBuffer {
  const key = Math.round(freq * 100);
  const hit = pluckCache.get(key);
  if (hit) return hit;
  const sr = c.sampleRate;
  const len = Math.floor(sr * 1.6);
  const buf = c.createBuffer(1, len, sr);
  const out = buf.getChannelData(0);
  const period = Math.max(2, Math.round(sr / freq));
  const ring = new Float32Array(period);
  for (let i = 0; i < period; i++) ring[i] = Math.random() * 2 - 1;
  let idx = 0;
  let prev = 0;
  for (let i = 0; i < len; i++) {
    const cur = ring[idx];
    const next = ring[(idx + 1) % period];
    const v = 0.4985 * (cur + next);
    ring[idx] = v;
    // Light low-pass for a softer, wooden body.
    prev = prev + 0.6 * (cur - prev);
    out[i] = prev * (1 - i / len);
    idx = (idx + 1) % period;
  }
  pluckCache.set(key, buf);
  return buf;
}

function pluck(freq: number, vol: number, delay = 0) {
  const c = ac();
  if (!c || !master) return;
  const s = c.createBufferSource();
  s.buffer = pluckBuffer(c, freq);
  const g = c.createGain();
  g.gain.value = vol;
  s.connect(g).connect(master);
  s.start(c.currentTime + delay);
}

export const sfx = {
  pick() {
    tone(1200, 0.05, 'sine', 0.06);
    noise(25, 3500, 1.2, 0.08);
  },
  drop() {
    tone(190, 0.09, 'sine', 0.12, 0, 120);
    noise(30, 900, 1, 0.08);
  },
  rotate() {
    noise(110, 1800, 0.6, 0.06);
    tone(520, 0.08, 'triangle', 0.03, 0, 760);
  },
  /** A piece clicked into place. `step` walks up the scale as the picture fills in. */
  snap(step = 0) {
    noise(35, 2600, 2.5, 0.35);
    tone(160, 0.06, 'sine', 0.18, 0, 90);
    pluck(SCALE[Math.min(SCALE.length - 1, step % SCALE.length)] * 2, 0.22, 0.015);
  },
  join() {
    noise(28, 2200, 2.2, 0.22);
    tone(240, 0.05, 'sine', 0.1, 0, 140);
  },
  hint() {
    tone(880, 0.25, 'sine', 0.05);
    tone(1318.5, 0.35, 'sine', 0.04, 0.08);
  },
  ui() {
    noise(18, 4200, 1.5, 0.08);
  },
  complete() {
    const phrase = [0, 2, 3, 4, 5, 4, 7, 9];
    phrase.forEach((n, i) => pluck(SCALE[n], 0.5, i * 0.13));
    pluck(SCALE[5] / 2, 0.45, phrase.length * 0.13);
    pluck(SCALE[9], 0.3, phrase.length * 0.13 + 0.02);
  },
};
