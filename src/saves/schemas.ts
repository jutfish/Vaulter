import { bool, isRecord, num, type Schema } from './versioned';

// Settings and progress are stored separately so resetting one never touches the other.

export interface Settings {
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
  pauseOnBlur: boolean;
}

export const settingsSchema: Schema<Settings> = {
  key: 'vaulter.settings',
  version: 1,
  defaults: () => ({ musicVolume: 0.5, sfxVolume: 0.8, muted: false, pauseOnBlur: true }),
  validate(data) {
    if (!isRecord(data)) return null;
    const d = settingsSchema.defaults();
    return {
      musicVolume: num(data.musicVolume, d.musicVolume, 0, 1),
      sfxVolume: num(data.sfxVolume, d.sfxVolume, 0, 1),
      muted: bool(data.muted, d.muted),
      pauseOnBlur: bool(data.pauseOnBlur, d.pauseOnBlur),
    };
  },
  migrations: {},
};

export interface LevelRecord {
  cleared: boolean;
  bestTime: number | null;
}

export interface Progress {
  /** Best vault height in metres (feet above take-off ground). */
  bestHeight: number;
  levels: Record<string, LevelRecord>;
  /** Has seen the podium cutscene all the way through (it can't be skipped until then). */
  seenPodium: boolean;
}

export const progressSchema: Schema<Progress> = {
  key: 'vaulter.progress',
  version: 2,
  defaults: () => ({ bestHeight: 0, levels: {}, seenPodium: false }),
  validate(data) {
    if (!isRecord(data)) return null;
    const levels: Record<string, LevelRecord> = {};
    if (isRecord(data.levels)) {
      for (const [id, rec] of Object.entries(data.levels)) {
        if (!isRecord(rec)) continue;
        const t = rec.bestTime;
        levels[id] = {
          cleared: bool(rec.cleared, false),
          bestTime: typeof t === 'number' && Number.isFinite(t) && t > 0 ? t : null,
        };
      }
    }
    return { bestHeight: num(data.bestHeight, 0, 0), levels, seenPodium: bool(data.seenPodium, false) };
  },
  migrations: {
    /** v2 (0.8.2): the podium cutscene is unskippable until seen once; nobody has seen it yet. */
    1: (d) => ({ ...(isRecord(d) ? d : {}), seenPodium: false }),
  },
};
