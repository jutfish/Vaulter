// The vehicles of the traffic level (v0.9): each one's solid shape in tiles
// and how its sprite sits over it. Sprite sizes mirror VEHICLES in
// tools/make_placeholder_art.py (tests/traffic.test.ts checks the PNGs).
//
// Shapes are rows of tiles, top row first, the bottom row standing on the
// road: '#' solid, '/' '\' 45-degree slopes (stairs, ramps), '.' empty.

export type VehicleType = 'bus' | 'lorry' | 'car' | 'houseRig' | 'transporter';

export interface VehicleSpec {
  shape: string[];
  /** Sprite pixels above the solid shape (railings, a roof that's only drawn). */
  above: number;
  /** Wheel centres (px from the vehicle's left edge) and their radius; drawn spinning over the sprite. */
  wheels: number[];
  wheelRadius: number;
}

export const VEHICLES: Record<VehicleType, VehicleSpec> = {
  /** Open-top double-decker: a step up at the back onto the rear platform (h1, where you board), stairs, the open top deck (h2). */
  bus: {
    shape: ['.../##############', '/#################'],
    above: 12,
    wheels: [44, 240],
    wheelRadius: 6,
  },
  /** Luton box lorry: the box runs over the cab, roof at h4. */
  lorry: {
    shape: ['#######', '#######', '#######', '#######'],
    above: 0,
    wheels: [22, 90],
    wheelRadius: 7,
  },
  /** A low sports car, roof at h1. */
  car: {
    shape: ['######'],
    above: 0,
    wheels: [16, 78],
    wheelRadius: 5,
  },
  /**
   * A house move: a static caravan carried over two low dollies with a gap
   * between them (h1), pulled by a little tug (h1 too). Under the caravan there's
   * only 32 px of headroom: no hopping, no vaulting.
   */
  houseRig: {
    shape: [
      '..........#################...',
      '..........#################...',
      '..............................',
      '..............................',
      '################...###########',
    ],
    above: 6,
    wheels: [24, 228, 332, 428, 464],
    wheelRadius: 5,
  },
  /** Car transporter: a low rear deck (h1), the ramp, and the long upper deck (h5) over the cab. */
  transporter: {
    shape: ['....../################', '...../#################', '..../##################', '.../###################', '#######################'],
    above: 0,
    wheels: [20, 40, 60, 284, 344],
    wheelRadius: 6,
  },
};

export function vehicleSize(type: VehicleType): { cols: number; rows: number; w: number; h: number } {
  const v = VEHICLES[type];
  const cols = v.shape[0]!.length;
  const rows = v.shape.length;
  return { cols, rows, w: cols * 16, h: rows * 16 + v.above };
}
