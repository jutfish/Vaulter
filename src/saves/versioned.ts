/**
 * Versioned save envelopes. Every stored blob is { version, data }.
 * Loading migrates old versions forward one step at a time, then validates;
 * anything unreadable falls back to defaults without throwing.
 */

export interface Schema<T> {
  key: string;
  version: number;
  defaults: () => T;
  /** Returns a clean T (filling gaps from defaults) or null if unusable. */
  validate: (data: unknown) => T | null;
  /** migrations[n] upgrades data from version n to n + 1. */
  migrations: Record<number, (data: unknown) => unknown>;
}

export interface Envelope {
  version: number;
  data: unknown;
}

export type LoadResult<T> = {
  value: T;
  /** 'ok' loaded as-is, 'migrated' upgraded from an older version, 'default' nothing usable stored. */
  status: 'ok' | 'migrated' | 'default';
  /** Version found in storage (for diagnostics). */
  foundVersion?: number;
};

export function decode<T>(schema: Schema<T>, raw: string | null): LoadResult<T> {
  if (raw === null) return { value: schema.defaults(), status: 'default' };
  let env: Envelope;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof (parsed as Envelope).version !== 'number') {
      return { value: schema.defaults(), status: 'default' };
    }
    env = parsed as Envelope;
  } catch {
    return { value: schema.defaults(), status: 'default' };
  }

  const found = env.version;
  // Data from a newer build than this one: don't guess, keep it untouched by using defaults in memory.
  if (found > schema.version) return { value: schema.defaults(), status: 'default', foundVersion: found };

  let data = env.data;
  for (let v = found; v < schema.version; v++) {
    const migrate = schema.migrations[v];
    if (!migrate) return { value: schema.defaults(), status: 'default', foundVersion: found };
    data = migrate(data);
  }
  const value = schema.validate(data);
  if (!value) return { value: schema.defaults(), status: 'default', foundVersion: found };
  return { value, status: found === schema.version ? 'ok' : 'migrated', foundVersion: found };
}

export function encode<T>(schema: Schema<T>, value: T): string {
  return JSON.stringify({ version: schema.version, data: value } satisfies Envelope);
}

// --- small validation helpers ---
export const isRecord = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
export const num = (x: unknown, fallback: number, min = -Infinity, max = Infinity): number =>
  typeof x === 'number' && Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : fallback;
export const bool = (x: unknown, fallback: boolean): boolean => (typeof x === 'boolean' ? x : fallback);
