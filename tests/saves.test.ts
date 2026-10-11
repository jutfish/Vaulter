import { describe, expect, it } from 'vitest';
import { progressSchema, settingsSchema } from '../src/saves/schemas';
import { SaveSlot, type KeyValueStore } from '../src/saves/storage';
import { decode, encode, isRecord, num, type Schema } from '../src/saves/versioned';

class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  failWrites = false;
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.failWrites) throw new Error('QuotaExceededError');
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

// A synthetic schema at version 3 to exercise the migration chain.
interface V3 {
  bestHeight: number;
  unit: 'm';
}
const v3Schema: Schema<V3> = {
  key: 'test',
  version: 3,
  defaults: () => ({ bestHeight: 0, unit: 'm' }),
  validate: (d) => (isRecord(d) && d.unit === 'm' ? { bestHeight: num(d.bestHeight, 0, 0), unit: 'm' } : null),
  migrations: {
    1: (d) => ({ best: (d as { best_px: number }).best_px / 16 }), // v1 stored pixels
    2: (d) => ({ bestHeight: (d as { best: number }).best, unit: 'm' }),
  },
};

describe('versioned saves', () => {
  it('returns defaults for missing or corrupt data', () => {
    expect(decode(settingsSchema, null).status).toBe('default');
    expect(decode(settingsSchema, '{not json').status).toBe('default');
    expect(decode(settingsSchema, '"just a string"').status).toBe('default');
  });

  it('migrates old versions forward, preserving progress', () => {
    const raw = JSON.stringify({ version: 1, data: { best_px: 80 } });
    const r = decode(v3Schema, raw);
    expect(r.status).toBe('migrated');
    expect(r.value).toEqual({ bestHeight: 5, unit: 'm' });
  });

  it('round-trips current data', () => {
    const value = { musicVolume: 0.2, sfxVolume: 0.9, muted: true, pauseOnBlur: false };
    expect(decode(settingsSchema, encode(settingsSchema, value))).toEqual({ value, status: 'ok', foundVersion: 1 });
  });

  it('validates and clamps bad fields instead of rejecting everything', () => {
    const raw = JSON.stringify({ version: 1, data: { musicVolume: 7, sfxVolume: 'loud', muted: true } });
    const v = decode(settingsSchema, raw).value;
    expect(v.musicVolume).toBe(1);
    expect(v.sfxVolume).toBe(0.8);
    expect(v.muted).toBe(true);
  });

  it('drops malformed level records but keeps good ones', () => {
    const raw = JSON.stringify({
      version: 1,
      data: { bestHeight: 4.2, levels: { a: { cleared: true, bestTime: 12.5 }, b: 'junk', c: { cleared: 1, bestTime: -3 } } },
    });
    const v = decode(progressSchema, raw).value;
    expect(v.bestHeight).toBe(4.2);
    expect(v.levels.a).toEqual({ cleared: true, bestTime: 12.5 });
    expect(v.levels.b).toBeUndefined();
    expect(v.levels.c).toEqual({ cleared: false, bestTime: null });
  });
});

describe('SaveSlot', () => {
  it('writes migrated data back immediately', () => {
    const store = new MemoryStore();
    store.setItem('test', JSON.stringify({ version: 1, data: { best_px: 32 } }));
    const slot = new SaveSlot(v3Schema, store);
    expect(slot.loadStatus).toBe('migrated');
    expect(JSON.parse(store.getItem('test')!).version).toBe(3);
  });

  it('reports failure when storage is unavailable', () => {
    const slot = new SaveSlot(settingsSchema, null);
    expect(slot.available).toBe(false);
    expect(slot.save().ok).toBe(false);
  });

  it('reports failure when a write throws (quota, privacy mode)', () => {
    const store = new MemoryStore();
    const slot = new SaveSlot(progressSchema, store);
    store.failWrites = true;
    const r = slot.save();
    expect(r.ok).toBe(false);
  });

  it('never overwrites data written by a newer version of the game', () => {
    const store = new MemoryStore();
    const future = JSON.stringify({ version: 99, data: { anything: true } });
    store.setItem('vaulter.progress', future);
    const slot = new SaveSlot(progressSchema, store);
    expect(slot.readOnly).toBe(true);
    expect(slot.save().ok).toBe(false);
    expect(store.getItem('vaulter.progress')).toBe(future);
  });

  it('keeps settings and progress under separate keys', () => {
    expect(settingsSchema.key).not.toBe(progressSchema.key);
  });
});
