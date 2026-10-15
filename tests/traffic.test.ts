import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildFlatLevel, buildTraffic } from '../src/data/levels';
import { pole, SIM_DT, TILE, traffic as cfg } from '../src/data/tuning';
import { VEHICLES, vehicleSize, type VehicleType } from '../src/data/vehicles';
import { resetPoleToHands } from '../src/gameplay/carry';
import type { Action } from '../src/gameplay/input';
import { Tile } from '../src/gameplay/level';
import { poleTopUnder } from '../src/gameplay/player';
import { placePole } from '../src/gameplay/poleBody';
import { moversAt, roadOffset, roadSpeedAt } from '../src/gameplay/traffic';
import { World } from '../src/gameplay/world';
import { Driver, feetH, marks as m, nextCanopy, ROAD_Y } from './helpers/traffic';

const data = buildTraffic();

/** A world with the fare paid but the bus still at the stop (nothing moves), the vaulter at (col, h). */
function standing(col: number, h: number, shift = 0): World {
  const w = new World(data);
  w.skipObstacle();
  w.traffic!.paidAt = null;
  w.traffic!.shift = shift;
  w.traffic!.update(0);
  w.player.x = col * TILE + 8;
  w.player.y = ROAD_Y - h * TILE;
  resetPoleToHands(w.player.carry, w.player.x, w.player.y);
  return w;
}

/** The whole level, the way a player does it. Returns the driver (world + event log). */
function playTraffic(lead = 550): Driver {
  const d = new Driver(new World(data));
  const hopAt = (w: World, edgeCol: number, before = 20) => w.player.grounded && w.player.x > edgeCol * TILE - before && w.player.x < edgeCol * TILE;
  // 1. Walk up the step onto the bus's platform: the medal goes in the fare box.
  expect(d.run(4, () => ['right'], (w) => w.traffic!.paidAt !== null), 'paid the fare').toBe(true);
  // Up the stairs, along the top deck at a sprint and hop across to the bus in front.
  d.run(5, (w) => (hopAt(w, m.busFront) ? ['right', 'aimRight', 'hop'] : ['right', 'aimRight']), (w) => w.player.x > (m.bus2 + 4) * TILE && w.player.grounded);
  // 2. Vault up onto the lorry.
  d.vault(m.lorry * TILE - 150, 0.5);
  expect(feetH(d.w), `on the lorry: ${d.log.slice(-6).join(' ')}`).toBeCloseTo(4, 1);
  // 3. Straight off its front onto the low car before the bridge sweeps the lorry; hop onto the dolly.
  d.run(3, (w) => {
    const k: Action[] = w.player.x < m.car * TILE ? ['right'] : ['right', 'aimRight'];
    if (hopAt(w, m.carFront, 10)) k.push('hop');
    return k;
  }, (w) => w.player.x > m.caravanFrom * TILE || w.traffic!.swept);
  // 4. Under the caravan, pole level. Stop at the gap, let the pole down across it, walk it, pick it up.
  d.stopAt(m.gapFrom * TILE - 12, ['aimRight']);
  d.hold(['aimRight'], 1.2);
  d.hold(['grab'], 0.05);
  d.hold([], 1);
  d.run(3, () => ['right'], (w) => w.player.x > m.gapTo * TILE + 24 || w.traffic!.swept);
  d.hold(['grab'], 0.05);
  expect(d.w.player.carry.held, `picked the pole up again: ${d.log.slice(-6).join(' ')}`).toBe(true);
  expect(feetH(d.w), 'across the gap').toBeCloseTo(1, 1);
  // 5. Wait for a building's entrance to come into view, then up the transporter and onto its canopy.
  d.run(30, () => ['aimRight'], (w) => {
    const c = nextCanopy(w, m.deckFront * TILE - 160) - m.deckFront * TILE;
    return c <= lead + 10 && c > lead - 10;
  });
  let plantT = -1;
  d.run(5, (w, t) => {
    const k: Action[] = ['right', 'aimRight'];
    if (hopAt(w, m.transporter - 2, 14)) k.push('hop');
    if (w.player.x > m.deckFront * TILE - 120 && (plantT < 0 || t - plantT < 0.5)) k.push('aimDown');
    if (w.events.some((e) => e.type === 'plant')) plantT = t;
    return k;
  }, (w) => w.cleared || w.traffic!.swept);
  return d;
}

describe('traffic level: layout', () => {
  const w = new World(data);
  const level = w.level;

  it('every vehicle stands on the road, and the road runs the whole way', () => {
    for (let tx = 0; tx < level.width; tx++) expect(level.tileAt(tx, m.roadRow)).toBe(Tile.Road);
    for (const v of data.traffic!.vehicles) {
      const { cols } = vehicleSize(v.type);
      // Bottom row of each vehicle is right on the road.
      const bottom = VEHICLES[v.type].shape.at(-1)!;
      for (let k = 0; k < cols; k++) if (bottom[k] === '#') expect(level.tileAt(v.col + k, m.roadRow - 1), `${v.type} col ${k}`).toBe(Tile.Vehicle);
    }
  });

  it('the caravan roofs the whole gap with 32 px of headroom: no hop, no vault', () => {
    for (let c = m.gapFrom - 2; c < m.gapTo + 2; c++) {
      expect(level.isSolidTile(c, m.roadRow - 3), `col ${c}`).toBe(false);
      expect(level.isSolidTile(c, m.roadRow - 4), `col ${c}`).toBe(true);
    }
    expect((m.gapTo - m.gapFrom) * TILE).toBeLessThan(pole.totalLength - 16);
  });

  it('starts on the road at the bus stop, behind the bus, with the world standing still', () => {
    expect(level.startX).toBeLessThan(m.bus * TILE);
    expect(level.startY).toBe(ROAD_Y);
    expect(w.traffic!.speed).toBe(0);
    expect(w.traffic!.offset).toBe(0);
  });

  it('vehicle sprites are the size of their shapes', () => {
    // PNG header: width and height at bytes 16..24.
    for (const type of Object.keys(VEHICLES) as VehicleType[]) {
      const png = readFileSync(`public/assets/sprites/vehicle_${type}.png`);
      const size = vehicleSize(type);
      expect([png.readUInt32BE(16), png.readUInt32BE(20)], type).toEqual([size.w, size.h]);
    }
  });
});

describe('traffic level: the road and what is fixed to it', () => {
  it('road travel pulls off smoothly and is then the traffic speed', () => {
    expect(roadOffset(-1)).toBe(0);
    expect(roadSpeedAt(cfg.pullOffTime / 2)).toBeCloseTo(cfg.speed / 2);
    const t = cfg.pullOffTime + 3;
    expect((roadOffset(t + 0.01) - roadOffset(t)) / 0.01).toBeCloseTo(cfg.speed, 3);
    // Continuous where the pull-off ends.
    expect(roadOffset(cfg.pullOffTime - 1e-6)).toBeCloseTo(roadOffset(cfg.pullOffTime + 1e-6), 3);
  });

  it('roadside things are a pure function of road travel and repeat every block', () => {
    const tr = data.traffic!;
    const a = moversAt(tr, ROAD_Y, 300, -2000, 6000);
    const b = moversAt(tr, ROAD_Y, 300 + tr.block, -2000, 6000);
    const shifted = a.map((q) => ({ ...q, x: q.x - tr.block }));
    for (const q of b.filter((q) => q.x > -1000 && q.x < 3000)) expect(shifted.some((s) => s.kind === q.kind && Math.abs(s.x - q.x) < 1e-6), JSON.stringify(q)).toBe(true);
    // Every bridge clears every vehicle; a vaulter standing on the lorry or the transporter doesn't.
    const vehicleTop = Math.max(...tr.vehicles.map((v) => VEHICLES[v.type].shape.length)) * TILE;
    expect(tr.bridge.bottom).toBeGreaterThan(vehicleTop);
    expect(tr.bridge.bottom).toBeLessThan(4 * TILE + 26);
  });

  it('the fare is paid by standing on the platform, and the bus pulls off a moment later', () => {
    const d = new Driver(new World(data));
    d.run(4, () => ['right'], (w) => w.traffic!.paidAt !== null);
    expect(d.log.some((e) => e.startsWith('fare')), d.log.join(' ')).toBe(true);
    expect(d.w.traffic!.speed).toBe(0);
    d.hold([], cfg.departDelay + cfg.pullOffTime + 0.2);
    expect(d.w.traffic!.speed).toBeCloseTo(cfg.speed);
    // Paid once: back on the platform later costs nothing.
    const paid = d.w.traffic!.paidAt;
    d.hold(['left'], 0.3);
    d.hold(['right'], 0.3);
    expect(d.w.traffic!.paidAt).toBe(paid);
  });

  it('before the bus pulls off the road is plain ground', () => {
    const w = new World(data);
    const d = new Driver(w);
    d.hold(['left'], 0.5);
    d.hold([], 0.5);
    expect(w.traffic!.swept).toBe(false);
    expect(w.player.grounded).toBe(true);
  });

  it('fall onto the moving road and it carries you back, out of control, to the bus platform', () => {
    const w = new World(data);
    w.skipObstacle();
    const d = new Driver(w);
    d.hold([], cfg.departDelay + 1);
    // Off the front of the lorry into the gap before the car.
    w.player.x = (m.lorryFront + 3) * TILE;
    w.player.y = ROAD_Y - 3 * TILE;
    resetPoleToHands(w.player.carry, w.player.x, w.player.y);
    d.run(1, () => ['right'], (w) => w.traffic!.swept);
    expect(w.traffic!.swept).toBe(true);
    const x0 = w.player.x;
    d.hold(['right', 'hop'], 0.3);
    expect(w.player.x).toBeLessThan(x0 - 50);
    expect(d.run(6, () => ['right'], (w) => !w.traffic!.swept)).toBe(true);
    expect(d.log.some((e) => e.startsWith('delivered')), d.log.join(' ')).toBe(true);
    const col = Math.floor(w.player.x / TILE);
    expect(col).toBeGreaterThanOrEqual(data.traffic!.platform.from);
    expect(col).toBeLessThan(data.traffic!.platform.to);
    expect(feetH(w)).toBeCloseTo(1, 3);
    expect(w.player.carry.held).toBe(true);
    // Playable again at once.
    d.hold(['right'], 0.5);
    expect(w.player.x).toBeGreaterThan((data.traffic!.platform.to - 0.5) * TILE);
  });

  it('a pole planted on the moving road is torn away', () => {
    const w = new World(data);
    w.skipObstacle();
    const d = new Driver(w);
    d.hold([], cfg.departDelay + cfg.pullOffTime);
    // On the low car, facing back: the tip comes down on the road behind it.
    w.player.x = m.car * TILE + 20;
    w.player.y = ROAD_Y - TILE;
    w.player.facing = -1;
    w.player.carry.leadCmd = Math.PI;
    resetPoleToHands(w.player.carry, w.player.x, w.player.y);
    d.hold(['aimLeft'], 1.2);
    d.hold(['aimLeft', 'aimDown'], 0.4);
    expect(d.log.some((e) => e.startsWith('drop:dragged')), d.log.join(' ')).toBe(true);
    expect(w.player.poleMode).toBe('carry');
    expect(w.player.carry.held).toBe(false);
  });

  it('a loose pole on the moving road is carried back and put down on the bus', () => {
    const w = new World(data);
    w.skipObstacle();
    const d = new Driver(w);
    d.hold([], cfg.departDelay + cfg.pullOffTime);
    w.player.carry.held = false;
    placePole(w.player.carry.pole, pole.totalLength / 2, (m.lorryFront + 3.5) * TILE, ROAD_Y - 2, 0);
    d.hold([], 0.2);
    expect(w.player.carry.swept).toBe(true);
    d.hold([], 4);
    expect(w.player.carry.swept).toBe(false);
    const b = w.player.carry.pole;
    expect(b.cx).toBeGreaterThan(m.busDeck * TILE);
    expect(b.cx).toBeLessThan(m.busFront * TILE);
    expect((ROAD_Y - b.cy) / TILE).toBeCloseTo(2, 0);
  });

  it('a low bridge sweeps a vaulter standing on the lorry off its back, and passes over one on the car', () => {
    // Put the next bridge just ahead of the lorry, then let the traffic run.
    const onLorry = new World(data);
    onLorry.skipObstacle();
    const d = new Driver(onLorry);
    d.hold([], cfg.departDelay + cfg.pullOffTime);
    for (const [w, col, h] of [[onLorry, m.lorry + 3, 4]] as const) {
      w.player.x = col * TILE;
      w.player.y = ROAD_Y - h * TILE;
      resetPoleToHands(w.player.carry, w.player.x, w.player.y);
    }
    d.run(12, () => ['aimRight'], (w) => w.player.x < m.lorry * TILE - 8);
    expect(d.log.some((e) => e.startsWith('shoved:bridge')), d.log.join(' ')).toBe(true);
    expect(feetH(onLorry)).toBeLessThan(4);

    const onCar = new World(data);
    onCar.skipObstacle();
    const d2 = new Driver(onCar);
    d2.hold([], cfg.departDelay + cfg.pullOffTime);
    onCar.player.x = (m.car + 3) * TILE;
    onCar.player.y = ROAD_Y - TILE;
    resetPoleToHands(onCar.player.carry, onCar.player.x, onCar.player.y);
    d2.hold(['aimRight'], 10);
    expect(d2.log.some((e) => e.startsWith('shoved')), d2.log.join(' ')).toBe(false);
    expect(feetH(onCar)).toBeCloseTo(1, 3);
  });
});

describe('traffic level: start to finish', () => {
  it('can be played from the bus stop onto a canopy', () => {
    const d = playTraffic();
    expect(d.w.cleared, d.log.join(' ')).toBe(true);
    expect(d.w.traffic!.frozenAt).not.toBeNull();
    expect(d.log.filter((e) => e.startsWith('swept')), 'never fell into the traffic').toEqual([]);
  });

  it('reaches every checkpoint in order', () => {
    const d = playTraffic();
    expect(d.w.checkpoint).toBe(data.checkpoints!.length - 1);
  });

  it('the canopy takes a well-timed run: too early and its edge hits you, too late and it has gone', () => {
    // Window: start running when its front edge is ~500-620 px past the transporter's (docs/level-design.md).
    for (const lead of [420, 720]) {
      const d = playTraffic(lead);
      expect(d.w.cleared, `lead ${lead}: ${d.log.slice(-5).join(' ')}`).toBe(false);
    }
  });

  it('the skip cheat: boards the bus, then lands just past each obstacle, then onto a canopy', () => {
    const w = new World(data);
    const cps = data.checkpoints!;
    for (let i = 0; i < cps.length; i++) {
      expect(w.skipObstacle(), `skip ${i}`).toBe(true);
      if (i === 0) expect(w.traffic!.paidAt).not.toBeNull();
      if (cps[i]!.goal) break;
      for (let t = 0; t < 0.5; t += SIM_DT) w.step(emptyStep(), SIM_DT);
      expect(w.player.grounded, `checkpoint ${i}`).toBe(true);
      expect(Math.round(feetH(w)), `checkpoint ${i} height`).toBe(cps[i]!.h);
      expect(w.player.carry.held, `checkpoint ${i} pole`).toBe(true);
      expect(w.checkpoint).toBe(i);
    }
    expect(w.cleared).toBe(true);
    expect(w.skipObstacle()).toBe(false);
  });

  it('a restart puts you back at the bus stop with the fare unpaid and the world still', () => {
    const w = new World(data);
    w.skipObstacle();
    const d = new Driver(w);
    d.hold(['right'], 4);
    w.reset();
    expect(w.traffic!.paidAt).toBeNull();
    expect(w.traffic!.offset).toBe(0);
    expect(w.player.x).toBe(w.level.startX);
  });
});

describe('walking on the pole (both levels)', () => {
  const flat = buildFlatLevel({ name: 'pit', length: 40, rows: 12, groundRow: 9, startCol: 4, finishCol: 39, walls: [] });
  // A 3-tile pit, 2 deep, at columns 14..16.
  flat.rows = flat.rows.map((r, y) => (y >= 9 && y < 11 ? r.slice(0, 14) + '...' + r.slice(17) : r));
  const groundY = 9 * TILE;

  it('lay the pole over a pit and walk across it', () => {
    const w = new World(flat);
    const d = new Driver(w);
    w.player.x = 14 * TILE - 12;
    resetPoleToHands(w.player.carry, w.player.x, w.player.y);
    d.hold(['aimRight'], 1.5);
    d.hold(['grab'], 0.05);
    d.hold([], 1);
    expect(w.player.carry.held).toBe(false);
    d.run(2, () => ['right'], (w) => w.player.x > 18 * TILE);
    expect(w.player.x).toBeGreaterThan(18 * TILE);
    expect(w.player.y).toBeLessThan(groundY + 1);
    // Pick it up again from the far side.
    d.hold(['left'], 0.05);
    d.hold(['grab'], 0.05);
    expect(w.player.carry.held).toBe(true);
  });

  it('without the pole you fall in', () => {
    const w = new World(flat);
    const d = new Driver(w);
    w.player.x = 14 * TILE - 12;
    resetPoleToHands(w.player.carry, w.player.x, w.player.y);
    d.run(2, () => ['right'], (w) => w.player.x > 18 * TILE);
    expect(w.player.y).toBeGreaterThan(groundY + 8);
  });

  it('a steep pole is no platform, a held one neither', () => {
    const w = new World(flat);
    const p = w.player;
    p.carry.held = false;
    placePole(p.carry.pole, pole.totalLength / 2, 10 * TILE, groundY - 2, 0);
    expect(poleTopUnder(p, 10 * TILE)).toBeCloseTo(groundY - 3, 3);
    placePole(p.carry.pole, pole.totalLength / 2, 10 * TILE, groundY - 20, -0.5);
    expect(poleTopUnder(p, 10 * TILE)).toBeNull();
    resetPoleToHands(p.carry, p.x, p.y);
    expect(poleTopUnder(p, p.x)).toBeNull();
  });

  it('you can only hop with room above your head', () => {
    const w = standing(m.gapFrom - 4, 1, 900);
    const d = new Driver(w);
    d.hold(['hop'], 0.3);
    expect(d.log.some((e) => e.startsWith('hop'))).toBe(false);
    const open = standing(m.rig + 2, 1, 900);
    const d2 = new Driver(open);
    d2.hold(['hop'], 0.3);
    expect(d2.log.some((e) => e.startsWith('hop'))).toBe(true);
  });
});

function emptyStep() {
  return { down: none(), pressed: none(), released: none() };
}
function none(): Record<Action, boolean> {
  return { left: false, right: false, hop: false, aimUp: false, aimDown: false, aimLeft: false, aimRight: false, grab: false };
}
