// The movement preview: each NPC moving as its move code moves it in game, at the field's 30 frames a second
// (GameData_Set30FPSMode in src/ov036/fieldmap.c), from its tile, which stays marked. Read from
// src/ov036/field_actor_movecode.c and src/ov012/field_actor_tool.c:
//
// - A step is ACMD_WALK_8F, 8 frames a tile; a blocked step of the loops and of back and forth is ACMD_STAY_WALK_8F,
//   8 frames walking on the spot.
// - A step is blocked (ActorRouteCollCheck) outside the leash (its area, tiles each way from its first tile; 0xFFFF on
//   an axis is no limit), on a tile that blocks (no tile, MapTile_BlocksCollision, or the tile classes that block
//   leaving or entering in that direction), past 20 units of height, or by another actor on the tile or leaving it.
//   The player isn't in the preview.
// - WALK_RANDOM (and _UP_DOWN, _LEFT_RIGHT): face, wait 16, 32, 48 or 64 frames, turn to a random direction of its set,
//   and walk a tile if nothing blocks it.
// - TURN_RANDOM_*: every 16 to 64 frames, face a random direction of its set. FACE_* faces one way; NONE stays.
// - WALK_BACK_AND_FORTH: along its facing to the leash's edge and back home, without waiting.
// - LOOP_* and ROUTE_*: the four directions of the name in turn, to the leash's edge, then home (MC's route step).
// - SPIN_*: a quarter turn every 24 frames.
//
// On the rails (src/ov036/field_actor_rail.c), an NPC steps along its line (front, toward the line's direction) or
// across it (side, to the right of that direction), and never onto another line:
// - RAIL_WALK_RANDOM (_UP_DOWN): as WALK_RANDOM, waiting 16 to 64 frames, within its area (width on the side, height on
//   the front) and the line's tiles, not onto a tile whose collision flag is set or another NPC.
// - RAIL_TURN_RANDOM_*: as TURN_RANDOM_*. RAIL_STAY stays.
// - RAIL_PATROL: walks its facing until the line's end, its area or collision, then back to its tile and on.

import type { Entity } from "./entities.ts";
import { railTile, sidesAt, type RailMap } from "./rails.ts";
import { standingOn, tileClass, tileFlags, tileIsValid, type ZoneMap } from "./terrain.ts";

export type Dir = "DIR_UP" | "DIR_DOWN" | "DIR_LEFT" | "DIR_RIGHT";
export const FRAME_SECONDS = 1 / 30;
const STEP_FRAMES = 8;
const WAITS = [16, 32, 48, 64];
const NO_LIMIT = 0xffff;
const STEPS: Record<Dir, [number, number]> = { DIR_UP: [0, -1], DIR_DOWN: [0, 1], DIR_LEFT: [-1, 0], DIR_RIGHT: [1, 0] };
const LETTERS: Record<string, Dir> = { UP: "DIR_UP", DOWN: "DIR_DOWN", LEFT: "DIR_LEFT", RIGHT: "DIR_RIGHT" };
const ALL: Dir[] = ["DIR_UP", "DIR_DOWN", "DIR_LEFT", "DIR_RIGHT"];
// The tile classes that block leaving a tile in a direction (TileExitBlockCheck_*, src/ov036/map_attr.c); entering is
// blocked by the class that blocks leaving the other way
const BLOCK_RIGHT = 0x51, BLOCK_LEFT = 0x52, BLOCK_UP = 0x53, BLOCK_DOWN = 0x54;
const BLOCK_UP_RIGHT = 0x55, BLOCK_UP_LEFT = 0x56, BLOCK_DOWN_RIGHT = 0x57, BLOCK_DOWN_LEFT = 0x58;
const EXIT_BLOCKS: Record<Dir, number[]> = {
  DIR_UP: [BLOCK_UP, BLOCK_UP_RIGHT, BLOCK_UP_LEFT],
  DIR_DOWN: [BLOCK_DOWN, BLOCK_DOWN_RIGHT, BLOCK_DOWN_LEFT],
  DIR_LEFT: [BLOCK_LEFT, BLOCK_UP_LEFT, BLOCK_DOWN_LEFT],
  DIR_RIGHT: [BLOCK_RIGHT, BLOCK_UP_RIGHT, BLOCK_DOWN_RIGHT],
};
const OPPOSITE: Record<Dir, Dir> = { DIR_UP: "DIR_DOWN", DIR_DOWN: "DIR_UP", DIR_LEFT: "DIR_RIGHT", DIR_RIGHT: "DIR_LEFT" };
const CLOCKWISE: Dir[] = ["DIR_UP", "DIR_RIGHT", "DIR_DOWN", "DIR_LEFT"];
const COUNTERCLOCKWISE: Dir[] = ["DIR_UP", "DIR_LEFT", "DIR_DOWN", "DIR_RIGHT"];
const MAX_HEIGHT_STEP = 20;

/** A step's result, as ActorRouteCollCheck's bits. */
const LEASH = 0x01, BLOCKED = 0x02, ACTOR = 0x04, HEIGHT = 0x08;

const random = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];
const dirsOf = (words: string) => words.split("_").map((w) => LETTERS[w]).filter(Boolean);

type Plan =
  | { kind: "still" }
  | { kind: "face"; dir: Dir }
  | { kind: "turn"; dirs: Dir[] }
  | { kind: "walk"; dirs: Dir[] }
  | { kind: "back_and_forth" }
  | { kind: "route"; dirs: Dir[]; axis: "x" | "z" }
  | { kind: "spin"; dirs: Dir[] };

function planOf(movement: string | undefined): Plan {
  const code = (movement ?? "").replace(/^MOVE_CODE_/, "");
  if (code === "WALK_RANDOM") return { kind: "walk", dirs: ALL };
  if (code === "WALK_RANDOM_UP_DOWN" || code === "WALK_RANDOM_LEFT_RIGHT") return { kind: "walk", dirs: dirsOf(code.slice(12)) };
  if (code === "TURN_RANDOM") return { kind: "turn", dirs: ALL };
  if (code.startsWith("TURN_RANDOM_")) return { kind: "turn", dirs: dirsOf(code.slice(12)) };
  const face = /^FACE_(UP|DOWN|LEFT|RIGHT)$/.exec(code);
  if (face) return { kind: "face", dir: LETTERS[face[1]] };
  if (code === "WALK_BACK_AND_FORTH") return { kind: "back_and_forth" };
  const route = /^(LOOP|ROUTE)_((?:UP|DOWN|LEFT|RIGHT)(?:_(?:UP|DOWN|LEFT|RIGHT)){3})$/.exec(code);
  if (route) {
    const dirs = dirsOf(route[2]);
    return { kind: "route", dirs, axis: dirs[0] === "DIR_UP" || dirs[0] === "DIR_DOWN" ? "z" : "x" };
  }
  if (code === "SPIN_CLOCKWISE") return { kind: "spin", dirs: CLOCKWISE };
  if (code === "SPIN_COUNTERCLOCKWISE") return { kind: "spin", dirs: COUNTERCLOCKWISE };
  return { kind: "still" };
}

export class Mover {
  readonly entity: Entity;
  readonly homeX: number;
  readonly homeZ: number;
  gx: number;
  gz: number;
  /** Where it is between tiles, while it walks. */
  fromX: number;
  fromZ: number;
  y: number;
  dir: Dir;
  private plan: Plan;
  private timer = 0;
  /** Frames left of the step it is taking (walking, or on the spot). */
  stepLeft = 0;
  private onSpot = false;
  private steps = 0;
  private flipped = false;
  private index = 0;
  private leash: { x: number; z: number };

  constructor(entity: Entity, y: number) {
    this.entity = entity;
    this.homeX = this.gx = this.fromX = entity.x!;
    this.homeZ = this.gz = this.fromZ = entity.z!;
    this.y = y;
    this.dir = (entity.direction as Dir) in STEPS ? (entity.direction as Dir) : "DIR_DOWN";
    this.plan = planOf(entity.movement);
    this.leash = { x: entity.leash?.x ?? 0, z: entity.leash?.z ?? 0 };
    if (this.plan.kind === "face") this.dir = this.plan.dir;
    this.timer = random(WAITS);
  }

  /** Its place on the map in tiles (its tile's corner), between tiles while it walks, and which walk frame it shows:
   * 0 standing, 1 or 2 mid-step. */
  place(): { x: number; z: number; frame: number } {
    if (!this.stepLeft) return { x: this.gx, z: this.gz, frame: 0 };
    const t = 1 - this.stepLeft / STEP_FRAMES;
    const frame = t < 0.5 ? 1 + (this.steps % 2) : 0;
    if (this.onSpot) return { x: this.gx, z: this.gz, frame };
    return { x: this.fromX + (this.gx - this.fromX) * t, z: this.fromZ + (this.gz - this.fromZ) * t, frame };
  }

  /** What stops a step in a direction from where it stands: ActorRouteCollCheck's bits. */
  check(dir: Dir, world: World): number {
    const [dx, dz] = STEPS[dir];
    const tx = this.gx + dx, tz = this.gz + dz;
    let result = 0;
    if ((this.leash.x !== NO_LIMIT && Math.abs(tx - this.homeX) > this.leash.x) ||
        (this.leash.z !== NO_LIMIT && Math.abs(tz - this.homeZ) > this.leash.z)) result |= LEASH;
    const here = world.tile(this.gx, this.gz, this.y);
    const there = world.tile(tx, tz, this.y);
    if (!there || !tileIsValid(there.type) || tileFlags(there.type) & 0x1) result |= BLOCKED;
    if (here && EXIT_BLOCKS[dir].includes(tileClass(here.type))) result |= BLOCKED;
    if (there && EXIT_BLOCKS[OPPOSITE[dir]].includes(tileClass(there.type))) result |= BLOCKED;
    if (!there || Math.abs(there.height - this.y) >= MAX_HEIGHT_STEP) result |= HEIGHT;
    if (world.occupied(tx, tz, this)) result |= ACTOR;
    return result;
  }

  private walk(dir: Dir, world: World) {
    const [dx, dz] = STEPS[dir];
    this.fromX = this.gx;
    this.fromZ = this.gz;
    this.gx += dx;
    this.gz += dz;
    this.y = world.tile(this.gx, this.gz, this.y)?.height ?? this.y;
    this.stepLeft = STEP_FRAMES;
    this.onSpot = false;
    this.steps++;
  }

  private stayWalk() {
    this.fromX = this.gx;
    this.fromZ = this.gz;
    this.stepLeft = STEP_FRAMES;
    this.onSpot = true;
    this.steps++;
  }

  /** One frame. */
  tick(world: World) {
    if (this.stepLeft) {
      this.stepLeft--;
      if (!this.stepLeft) { this.fromX = this.gx; this.fromZ = this.gz; }
      return;
    }
    const plan = this.plan;
    switch (plan.kind) {
      case "still":
      case "face":
        return;
      case "turn":
        if (--this.timer > 0) return;
        this.timer = random(WAITS);
        this.dir = random(plan.dirs);
        return;
      case "spin":
        if (--this.timer > 0) return;
        this.timer = 24;
        this.dir = plan.dirs[(plan.dirs.indexOf(this.dir) + 1) % plan.dirs.length] ?? plan.dirs[0];
        return;
      case "walk": {
        if (--this.timer > 0) return;
        this.timer = random(WAITS);
        this.dir = random(plan.dirs);
        if (!this.check(this.dir, world)) this.walk(this.dir, world);
        return;
      }
      case "back_and_forth": {
        // Its facing's axis: out to the leash, then back home and out again
        const home = (this.entity.direction as Dir) in STEPS ? (this.entity.direction as Dir) : "DIR_DOWN";
        if (this.flipped && this.gx === this.homeX && this.gz === this.homeZ) this.flipped = false;
        let dir = this.flipped ? OPPOSITE[home] : home;
        let result = this.check(dir, world);
        if (result & LEASH) {
          this.flipped = !this.flipped;
          dir = OPPOSITE[dir];
          result = this.check(dir, world);
        }
        this.dir = dir;
        if (result) this.stayWalk(); else this.walk(dir, world);
        return;
      }
      case "route": {
        // The route step: the third direction runs back to the home line of the axis, the fourth home
        const onLine = plan.axis === "x" ? this.gx === this.homeX : this.gz === this.homeZ;
        if (this.index === 2 && onLine) this.index++;
        if (this.index === 3 && this.gx === this.homeX && this.gz === this.homeZ) this.index = 0;
        this.dir = plan.dirs[this.index];
        let result = this.check(this.dir, world);
        if (result & LEASH) {
          // The game's ROUTE codes don't wrap here (they read past their table); the preview starts over
          this.index = (this.index + 1) % 4;
          this.dir = plan.dirs[this.index];
          result = this.check(this.dir, world);
        }
        if (result) this.stayWalk(); else this.walk(this.dir, world);
        return;
      }
    }
  }
}

/** A rail direction step: 1 up, 2 right, 3 down, 4 left (RAIL_DIR_*), as the NPCs' directions convert to them. */
const RAIL_DIRS: Record<Dir, number> = { DIR_UP: 1, DIR_RIGHT: 2, DIR_DOWN: 3, DIR_LEFT: 4 };
const turnRight = (d: number) => (d % 4) + 1;
const turnLeft = (d: number) => ((d + 2) % 4) + 1;
const opposite = (d: number) => ((d + 1) % 4) + 1;

type RailPlan = { kind: "still" } | { kind: "turn"; dirs: Dir[] } | { kind: "walk"; dirs: Dir[] } | { kind: "patrol" };

function railPlanOf(movement: string | undefined): RailPlan {
  const code = (movement ?? "").replace(/^MOVE_CODE_RAIL_/, "");
  if (code === "WALK_RANDOM") return { kind: "walk", dirs: ALL };
  if (code === "WALK_RANDOM_UP_DOWN") return { kind: "walk", dirs: ["DIR_UP", "DIR_DOWN"] };
  if (code === "TURN_RANDOM") return { kind: "turn", dirs: ALL };
  if (code.startsWith("TURN_RANDOM_")) return { kind: "turn", dirs: dirsOf(code.slice(12)) };
  if (code === "PATROL") return { kind: "patrol" };
  return { kind: "still" };
}

/** An NPC on the rails, by line, front and side, as field_actor_rail.c moves it. */
export class RailMover {
  readonly entity: Entity;
  readonly line: number;
  readonly homeFront: number;
  readonly homeSide: number;
  front: number;
  side: number;
  fromFront: number;
  fromSide: number;
  dir: Dir;
  stepLeft = 0;
  private onSpot = false;
  private steps = 0;
  private timer: number;
  private reversed = false;
  private plan: RailPlan;
  private area: { width: number; height: number };

  constructor(entity: Entity, private rails: RailMap) {
    this.entity = entity;
    const r = entity.rail!;
    this.line = r.line;
    this.front = this.fromFront = this.homeFront = r.front;
    this.side = this.fromSide = this.homeSide = r.side;
    this.dir = (entity.direction as Dir) in STEPS ? (entity.direction as Dir) : "DIR_DOWN";
    this.plan = railPlanOf(entity.movement);
    this.area = { width: entity.leash?.x ?? 0, height: entity.leash?.z ?? 0 };
    this.timer = random(WAITS);
  }

  /** Where it is, front and side between tiles while it walks, and its walk frame. */
  place(): { front: number; side: number; frame: number } {
    if (!this.stepLeft) return { front: this.front, side: this.side, frame: 0 };
    const t = 1 - this.stepLeft / STEP_FRAMES;
    const frame = t < 0.5 ? 1 + (this.steps % 2) : 0;
    if (this.onSpot) return { front: this.front, side: this.side, frame };
    return { front: this.fromFront + (this.front - this.fromFront) * t, side: this.fromSide + (this.side - this.fromSide) * t, frame };
  }

  /** The place a step in a direction leads to on its line. */
  private next(dir: Dir): { front: number; side: number } {
    const lineDir = this.rails.lines[this.line]?.dir ?? 1;
    const d = RAIL_DIRS[dir];
    if (d === lineDir) return { front: this.front + 1, side: this.side };
    if (d === opposite(lineDir)) return { front: this.front - 1, side: this.side };
    if (d === turnRight(lineDir)) return { front: this.front, side: this.side + 1 };
    if (d === turnLeft(lineDir)) return { front: this.front, side: this.side - 1 };
    return { front: this.front, side: this.side };
  }

  /** What stops a step: 1 off the line (its ends or its width), 2 a tile's collision, 4 another NPC; and whether the
   * step leaves its area. */
  private check(dir: Dir, world: World): { bits: number; outside: boolean; to: { front: number; side: number } } {
    const to = this.next(dir);
    let bits = 0;
    const length = this.rails.lines[this.line]?.length ?? 0;
    if (to.front < 0 || to.front >= length || !sidesAt(this.rails, this.line, to.front).includes(to.side)) bits |= 1;
    const type = railTile(this.rails, { line: this.line, front: to.front, side: to.side });
    if (type !== null && (type >>> 16) & 0x1) bits |= 2;
    if (world.railOccupied(this.line, to.front, to.side, this)) bits |= 4;
    const outside = (this.area.width !== NO_LIMIT && Math.abs(to.side - this.homeSide) > this.area.width) ||
      (this.area.height !== NO_LIMIT && Math.abs(to.front - this.homeFront) > this.area.height);
    return { bits, outside, to };
  }

  private step(to: { front: number; side: number } | null) {
    this.fromFront = this.front;
    this.fromSide = this.side;
    this.onSpot = !to;
    if (to) { this.front = to.front; this.side = to.side; }
    this.stepLeft = STEP_FRAMES;
    this.steps++;
  }

  tick(world: World) {
    if (this.stepLeft) {
      this.stepLeft--;
      if (!this.stepLeft) { this.fromFront = this.front; this.fromSide = this.side; }
      return;
    }
    const plan = this.plan;
    switch (plan.kind) {
      case "still":
        return;
      case "turn":
        if (--this.timer > 0) return;
        this.timer = random(WAITS);
        this.dir = random(plan.dirs);
        return;
      case "walk": {
        if (--this.timer > 0) return;
        this.timer = random(WAITS);
        this.dir = random(plan.dirs);
        const c = this.check(this.dir, world);
        if (!c.bits && !c.outside) this.step(c.to);
        return;
      }
      case "patrol": {
        const home = (this.entity.direction as Dir) in STEPS ? (this.entity.direction as Dir) : "DIR_DOWN";
        if (this.reversed && this.front === this.homeFront && this.side === this.homeSide) this.reversed = false;
        let dir = this.reversed ? OPPOSITE[home] : home;
        let c = this.check(dir, world);
        if (c.bits & 1 || c.outside) {
          this.reversed = !this.reversed;
          dir = OPPOSITE[dir];
          c = this.check(dir, world);
        }
        this.dir = dir;
        this.step(c.bits ? null : c.to);
        return;
      }
    }
  }
}

export class World {
  movers: Mover[] = [];
  railMovers: RailMover[] = [];

  constructor(private map: ZoneMap) {}

  /** The tile at a place on the layer nearest a height, as the game finds an actor's tile. */
  tile(gx: number, gz: number, y: number): { type: number; height: number } | null {
    const stands = standingOn(this.map, gx, gz, y);
    if (!stands) return null;
    const n = this.map.chunkTiles;
    const column = Math.floor(gx / n), row = Math.floor(gz / n);
    const chunk = this.map.chunks.find((c) => c.column === column && c.row === row)!;
    const t = chunk.layers[stands.layer].tiles[(gz - row * n) * n + (gx - column * n)];
    return t ? { type: t.tileType, height: stands.height } : null;
  }

  /** Whether another actor stands on a tile or is leaving it, near the same height. */
  occupied(gx: number, gz: number, self: Mover): boolean {
    return this.movers.some((m) => m !== self && Math.abs(m.y - self.y) < MAX_HEIGHT_STEP &&
      ((m.gx === gx && m.gz === gz) || (m.stepLeft > 0 && m.fromX === gx && m.fromZ === gz)));
  }

  /** Whether another NPC on the rails stands on a place or is leaving it. */
  railOccupied(line: number, front: number, side: number, self: RailMover): boolean {
    return this.railMovers.some((m) => m !== self && m.line === line &&
      ((m.front === front && m.side === side) || (m.stepLeft > 0 && m.fromFront === front && m.fromSide === side)));
  }

  tick() {
    for (const m of this.movers) m.tick(this);
    for (const m of this.railMovers) m.tick(this);
  }
}

/** The movers of a zone's NPCs, each from its tile and height. */
export function movers(map: ZoneMap, entities: Entity[], rails: RailMap | null): World {
  const world = new World(map);
  for (const e of entities) {
    // An instance moves as the NPC it is
    if ((e.kind === "npc" || e.kind === "instance") && e.rail && rails) {
      world.railMovers.push(new RailMover(e, rails));
      continue;
    }
    if ((e.kind !== "npc" && e.kind !== "instance") || e.x === null || e.z === null) continue;
    world.movers.push(new Mover(e, standingOn(map, e.x, e.z, e.y)?.height ?? e.y));
  }
  return world;
}

