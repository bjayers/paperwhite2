// An ambient's movement as the game makes it (Ambients_Move, src/paperwhite2/ov036/paperwhite2_ambients.c), for the
// Overworld Editor's map: its path's outline, and a mover the preview steps at the field's 30 frames a second. In world
// units (16 a tile); the perch's turns and hops are random, as the game's are.

import type { Ambient } from "./spawns.ts";

const FRAMES_A_SECOND = 30;
const DIRS = ["DIR_UP", "DIR_DOWN", "DIR_LEFT", "DIR_RIGHT"] as const;
// The game's: a hop's frames and height, a perch's seconds between changes, a hover's bob, the default speed
const HOP_FRAMES = 8;
const HOP_HEIGHT = 3;
const PERCH_SECONDS = 4;
const HOVER_BOB = 2;
const DEFAULT_SPEED = 45;
// A walking Pokémon's animation: its two frames, each this many frames (field_actor_drawdata.c's animation set 13)
const POKEMON_FRAME_LENGTH = 10;
// A person's walking frames while it moves, each this many frames
const WALK_FRAME_LENGTH = 4;

/** Its place in the world, in units: its tile's middle plus its offset, at its height. */
export function ambientOrigin(a: Ambient): [number, number, number] {
  return [a.x * 16 + 8 + (a.offset?.x ?? 0), a.y, a.z * 16 + 8 + (a.offset?.z ?? 0)];
}

/** Where on its path it is at an angle (radians) from its origin, and which way it goes there. */
export function pathAt(a: Ambient, angle: number): { dx: number; dy: number; dz: number; vx: number; vz: number } {
  const p = a.path ?? { kind: "perch" };
  const sx = p.width ?? 0, sz = p.depth ?? 0;
  const s = Math.sin(angle), c = Math.cos(angle);
  switch (p.kind) {
    case "hover": return { dx: 0, dy: HOVER_BOB * s, dz: 0, vx: 0, vz: 0 };
    case "ellipse": return { dx: sx * c, dy: 0, dz: sz * s, vx: -sx * s, vz: sz * c };
    case "line": return { dx: (sx * (1 - c)) / 2, dy: 0, dz: (sz * (1 - c)) / 2, vx: sx * s, vz: sz * s };
    case "eight": return { dx: sx * s, dy: 0, dz: sz * s * c, vx: sx * c, vz: sz * (c * c - s * s) };
    default: return { dx: 0, dy: 0, dz: 0, vx: 0, vz: 0 };
  }
}

/** Its path's outline round its origin, for a path that goes somewhere (none for a perch or a hover). */
export function pathOutline(a: Ambient, points = 64): [number, number][] {
  const kind = a.path?.kind ?? "perch";
  if (kind === "perch" || kind === "hover") return [];
  return Array.from({ length: points + 1 }, (_, i) => {
    const { dx, dz } = pathAt(a, (i / points) * 2 * Math.PI);
    return [dx, dz];
  });
}

/** The direction a velocity on the ground goes (Ambients_DirOf). */
function dirOf(vx: number, vz: number, otherwise: string): string {
  if (Math.abs(vx) < 1e-9 && Math.abs(vz) < 1e-9) return otherwise;
  if (Math.abs(vx) > Math.abs(vz)) return vx > 0 ? "DIR_RIGHT" : "DIR_LEFT";
  return vz > 0 ? "DIR_DOWN" : "DIR_UP";
}

/** An ambient moving as the game moves it, a frame at a time. frames is its sheet's (8 for a walking Pokémon, whose
 * two frames a direction always play). */
export class AmbientMover {
  facing: string;
  private angle: number;
  private nextChange = FRAMES_A_SECOND;
  private hop = 0;
  private frame = 0;
  private moving = false;

  constructor(readonly ambient: Ambient, public frames: number) {
    this.facing = typeof ambient.facing === "string" ? ambient.facing : "DIR_DOWN";
    this.angle = (((ambient.path?.start ?? 0) % 360) * Math.PI) / 180;
  }

  tick() {
    const p = this.ambient.path ?? { kind: "perch" };
    this.frame++;
    if (p.kind === "perch") {
      if (this.nextChange === 0) {
        const seconds = p.every || PERCH_SECONDS;
        this.nextChange = Math.floor((seconds * FRAMES_A_SECOND) / 2) + Math.floor(Math.random() * seconds * FRAMES_A_SECOND);
        if ((p.hops ?? true) && Math.random() < 0.5) this.hop = HOP_FRAMES;
        else if (p.turns ?? true) {
          const faces = p.faces?.length ? p.faces.map(String) : [...DIRS];
          this.facing = faces[Math.floor(Math.random() * faces.length)];
        }
      } else this.nextChange--;
      this.moving = this.hop > 0;
      if (this.hop > 0) this.hop--;
      return;
    }
    // (the game's step is a whole number of 16-bit angle units a frame)
    const step = Math.floor(((p.speed ?? DEFAULT_SPEED) * 0x10000) / (360 * FRAMES_A_SECOND));
    this.angle = (this.angle + (step / 0x10000) * 2 * Math.PI) % (2 * Math.PI);
    const { vx, vz } = pathAt(this.ambient, this.angle);
    this.facing = dirOf(vx, vz, this.facing);
    this.moving = true;
  }

  /** Where it is in the world now (units), its facing, and the sheet's step to draw (0, 1 or 2). */
  place(): { x: number; y: number; z: number; dir: string; step: number } {
    const [ox, oy, oz] = ambientOrigin(this.ambient);
    const { dx, dy, dz } = pathAt(this.ambient, this.angle);
    let lift = 0;
    if (this.hop > 0) {
      const t = HOP_FRAMES - this.hop;
      lift = (HOP_HEIGHT * 4 * t * (HOP_FRAMES - t)) / (HOP_FRAMES * HOP_FRAMES);
    }
    const step = this.frames === 8 ? Math.floor(this.frame / POKEMON_FRAME_LENGTH) % 2
      : this.moving ? [1, 0, 2, 0][Math.floor(this.frame / WALK_FRAME_LENGTH) % 4] : 0;
    return { x: ox + dx, y: oy + dy + lift, z: oz + dz, dir: this.facing, step };
  }
}
