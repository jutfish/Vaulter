import { decode, encode, type LoadResult, type Schema } from './versioned';

/** Minimal key-value backend so tests can swap in a fake. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type SaveOutcome = { ok: true } | { ok: false; reason: string };

/** Returns localStorage if it actually works (private mode / blocked storage throws). */
export function probeLocalStorage(): KeyValueStore | null {
  try {
    const s = window.localStorage;
    const k = '__vaulter_probe__';
    s.setItem(k, '1');
    s.removeItem(k);
    return s;
  } catch {
    return null;
  }
}

/**
 * One saved value (settings or progress). Never claims success it didn't get:
 * save() reports failures, and a store that is unavailable says so.
 */
export class SaveSlot<T> {
  value: T;
  readonly loadStatus: LoadResult<T>['status'];
  /** Set when storage holds data from a newer build; we won't overwrite it. */
  readonly readOnly: boolean;

  constructor(
    private readonly schema: Schema<T>,
    private readonly store: KeyValueStore | null,
  ) {
    let raw: string | null = null;
    try {
      raw = store?.getItem(schema.key) ?? null;
    } catch {
      raw = null;
    }
    const result = decode(schema, raw);
    this.value = result.value;
    this.loadStatus = result.status;
    this.readOnly = (result.foundVersion ?? 0) > schema.version;
    // Persist migrations immediately so old formats don't linger.
    if (result.status === 'migrated') this.save();
  }

  get available(): boolean {
    return this.store !== null;
  }

  save(): SaveOutcome {
    if (!this.store) return { ok: false, reason: 'Storage is unavailable in this browser (private mode or blocked).' };
    if (this.readOnly) return { ok: false, reason: 'Saved data is from a newer version of the game; not overwriting it.' };
    try {
      this.store.setItem(this.schema.key, encode(this.schema, this.value));
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : 'Unknown storage error.' };
    }
  }
}
