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
// The traveling paths (Ambients_Travel), and a peek's or a surface's rise and sink: its frames and its depth
const TRAVELING = new Set(["wander", "waypoints", "peek", "flyover", "surface"]);
const PEEK_FRAMES = 8;
const PEEK_DEPTH = 24;
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
    case "line": return { dx: (sx * (1 - c)) / 2, dy: ((p.height ?? 0) * (1 - c)) / 2, dz: (sz * (1 - c)) / 2, vx: sx * s, vz: sz * s };
    case "eight": return { dx: sx * s, dy: 0, dz: sz * s * c, vx: sx * c, vz: sz * (c * c - s * s) };
    default: return { dx: 0, dy: 0, dz: 0, vx: 0, vz: 0 };
  }
}

/** Its path's outline round its origin, for a path that goes somewhere (none for a perch, a hover, a peek or a
 * fly-over): its area's box for a wander or a surface, its stops for waypoints (closed when it goes round). */
export function pathOutline(a: Ambient, points = 64): [number, number][] {
  const kind = a.path?.kind ?? "perch";
  const p = a.path;
  if (kind === "wander" || kind === "surface") {
    const w = p?.width ?? 0, d = p?.depth ?? 0;
    return [[-w, -d], [w, -d], [w, d], [-w, d], [-w, -d]];
  }
  if (kind === "waypoints") {
    const stops: [number, number][] = [[0, 0], ...(p?.points ?? []).map((q): [number, number] => [q.x ?? 0, q.z ?? 0])];
    return p?.back ? stops : [...stops, [0, 0]];
  }
  if (kind === "perch" || kind === "hover" || kind === "peek" || kind === "flyover") return [];
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
  /** A traveling path's: where it is from its origin, a step's or a leg's start and end, its stage, its frames left
   * and all of them, its stop and way, and whether it's out of sight. */
  private at = { x: 0, y: 0, z: 0 };
  private from = { x: 0, y: 0, z: 0 };
  private to = { x: 0, y: 0, z: 0 };
  private stage = 0;
  private timer = FRAMES_A_SECOND;
  private frames = 1;
  private stop = 0;
  private way = 1;
  hidden = false;
  private angle: number;
  private nextChange = FRAMES_A_SECOND;
  private hop = 0;
  private frame = 0;
  private moving = false;

  constructor(readonly ambient: Ambient, public sheetFrames: number) {
    this.facing = typeof ambient.facing === "string" ? ambient.facing : "DIR_DOWN";
    this.angle = (((ambient.path?.start ?? 0) % 360) * Math.PI) / 180;
    const kind = ambient.path?.kind;
    if (kind === "peek" || kind === "surface") { this.stage = 2; this.timer = (ambient.path?.up ?? 4) * FRAMES_A_SECOND; }
    if (kind === "flyover") this.hidden = true;
  }

  /** A leg from where it is to a place at its pace. */
  private leg(to: { x: number; y: number; z: number }) {
    const step = ((this.ambient.path?.pace ?? 2) * 16) / FRAMES_A_SECOND;
    this.from = { ...this.at };
    this.to = to;
    this.frames = this.timer = Math.max(1, Math.floor(Math.hypot(to.x - this.at.x, to.y - this.at.y, to.z - this.at.z) / step));
  }

  private along() {
    const t = (this.frames - this.timer) / this.frames;
    this.at = { x: this.from.x + (this.to.x - this.from.x) * t, y: this.from.y + (this.to.y - this.from.y) * t, z: this.from.z + (this.to.z - this.from.z) * t };
    this.facing = dirOf(this.to.x - this.from.x, this.to.z - this.from.z, this.facing);
  }

  /** A traveling path a frame on, as Ambients_Travel moves it (the fly-over passes over its own place here: the
   * editor has no player). */
  private travel() {
    const p = this.ambient.path!;
    this.moving = false;
    switch (p.kind) {
      case "wander":
        if (this.stage === 1) {
          this.timer--; this.along(); this.moving = true;
          if (this.timer === 0) { const s = p.every || 3; this.stage = 0; this.timer = Math.floor((s * FRAMES_A_SECOND) / 2) + Math.floor(Math.random() * s * FRAMES_A_SECOND); }
        } else if (--this.timer <= 0) {
          const dir = DIRS[Math.floor(Math.random() * 4)];
          const to = { ...this.at, x: this.at.x + (dir === "DIR_LEFT" ? -16 : dir === "DIR_RIGHT" ? 16 : 0), z: this.at.z + (dir === "DIR_UP" ? -16 : dir === "DIR_DOWN" ? 16 : 0) };
          if (Math.abs(to.x) <= (p.width ?? 0) && Math.abs(to.z) <= (p.depth ?? 0)) {
            this.from = { ...this.at }; this.to = to; this.frames = this.timer = 16; this.stage = 1; this.facing = dir;
          } else this.timer = FRAMES_A_SECOND;
        }
        break;
      case "waypoints": {
        const points = p.points ?? [];
        if (!points.length) break;
        if (this.stage === 0) {
          if (this.timer > 0 && --this.timer > 0) break;
          let next = this.stop + this.way;
          if (p.back) { if (next > points.length || next < 0) { this.way = -this.way; next = this.stop + this.way; } }
          else if (next > points.length) next = 0;
          this.stop = next;
          const q = next === 0 ? { x: 0, y: 0, z: 0 } : { x: points[next - 1].x ?? 0, y: points[next - 1].y ?? 0, z: points[next - 1].z ?? 0 };
          this.leg(q); this.stage = 1;
        }
        if (this.stage === 1) {
          this.timer--; this.along(); this.moving = true;
          if (this.timer === 0) { this.stage = 0; this.timer = (p.wait ?? 0) * FRAMES_A_SECOND; }
        }
        break;
      }
      case "peek":
      case "surface":
        if (this.timer > 0) this.timer--;
        if (this.timer === 0) {
          this.stage = (this.stage + 1) & 3;
          this.timer = this.stage === 0 ? (p.wait ?? 4) * FRAMES_A_SECOND : this.stage === 2 ? (p.up ?? 4) * FRAMES_A_SECOND : PEEK_FRAMES;
          if (this.stage === 1 && p.kind === "surface") {
            this.at = { x: Math.round((Math.random() * 2 - 1) * (p.width ?? 0)), y: 0, z: Math.round((Math.random() * 2 - 1) * (p.depth ?? 0)) };
          }
        }
        this.hidden = this.stage === 0;
        this.lift = this.stage === 1 ? -PEEK_DEPTH * this.timer / PEEK_FRAMES : this.stage === 3 ? -PEEK_DEPTH * (PEEK_FRAMES - this.timer) / PEEK_FRAMES : 0;
        this.moving = this.stage === 2;
        break;
      case "flyover":
        if (this.stage === 1) {
          this.timer--; this.along(); this.moving = true;
          if (this.timer === 0) { this.stage = 0; this.hidden = true; this.timer = Math.floor(((p.wait ?? 4) * FRAMES_A_SECOND) / 2 + Math.random() * (p.wait ?? 4) * FRAMES_A_SECOND); }
        } else if (this.timer > 0) this.timer--;
        else {
          const h = ((p.heading ?? Math.random() * 360) * Math.PI) / 180, reach = 16 * 14, up = p.height ?? 64;
          this.at = { x: -Math.sin(h) * reach, y: up, z: Math.cos(h) * reach };
          this.leg({ x: Math.sin(h) * reach, y: up, z: -Math.cos(h) * reach });
          this.stage = 1; this.hidden = false;
        }
        break;
    }
  }

  private lift = 0;

  tick() {
    const p = this.ambient.path ?? { kind: "perch" };
    this.frame++;
    if (TRAVELING.has(p.kind)) { this.travel(); return; }
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

  /** Where it is in the world now (units), its facing, the sheet's step to draw (0, 1 or 2), and whether it's out of
   * sight. */
  place(): { x: number; y: number; z: number; dir: string; step: number; hidden: boolean } {
    const [ox, oy, oz] = ambientOrigin(this.ambient);
    const step = this.sheetFrames === 8 ? Math.floor(this.frame / POKEMON_FRAME_LENGTH) % 2
      : this.moving ? [1, 0, 2, 0][Math.floor(this.frame / WALK_FRAME_LENGTH) % 4] : 0;
    if (TRAVELING.has(this.ambient.path?.kind ?? "perch")) {
      return { x: ox + this.at.x, y: oy + this.at.y + this.lift, z: oz + this.at.z, dir: this.facing, step, hidden: this.hidden };
    }
    const { dx, dy, dz } = pathAt(this.ambient, this.angle);
    let lift = 0;
    if (this.hop > 0) {
      const t = HOP_FRAMES - this.hop;
      lift = (HOP_HEIGHT * 4 * t * (HOP_FRAMES - t)) / (HOP_FRAMES * HOP_FRAMES);
    }
    return { x: ox + dx, y: oy + dy + lift, z: oz + dz, dir: this.facing, step, hidden: false };
  }

}
