export interface LevelRecord {
  stars: number;
  bestMs: number;
}

export interface Settings {
  sound: boolean;
  ghost: boolean;
  reduceMotion: boolean;
}

interface SaveData {
  version: 1;
  records: Record<string, LevelRecord>;
  settings: Settings;
}

const KEY = 'manh-ghep:v1';

const defaultSettings = (): Settings => ({
  sound: true,
  ghost: true,
  reduceMotion:
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
});

function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw) as SaveData;
      if (data.version === 1) {
        return { ...data, settings: { ...defaultSettings(), ...data.settings } };
      }
    }
  } catch {
    // Storage unavailable (private mode) — play without persistence.
  }
  return { version: 1, records: {}, settings: defaultSettings() };
}

const data = load();
const listeners = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
  listeners.forEach((fn) => fn());
}

export const store = {
  record(id: string): LevelRecord | undefined {
    return data.records[id];
  },
  /** Saves a finished level, keeping the best stars and time. Returns true for a new best time. */
  complete(id: string, stars: number, ms: number): boolean {
    const prev = data.records[id];
    const newBest = !prev || ms < prev.bestMs;
    data.records[id] = {
      stars: Math.max(stars, prev?.stars ?? 0),
      bestMs: Math.min(ms, prev?.bestMs ?? Infinity),
    };
    persist();
    return newBest;
  },
  get settings(): Readonly<Settings> {
    return data.settings;
  },
  set<K extends keyof Settings>(key: K, value: Settings[K]) {
    data.settings[key] = value;
    persist();
  },
  reset() {
    data.records = {};
    persist();
  },
  onChange(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
