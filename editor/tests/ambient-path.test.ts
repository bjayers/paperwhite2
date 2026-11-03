// The ambients' movement as the Overworld Editor previews it (src/modules/overworld/ambientPath.ts), against the game's
// formulas (Ambients_Move): the paths' extents and where they start, the facing from the way it goes, and a perch that
// turns only to the directions it names.
import { test } from "node:test";
import assert from "node:assert/strict";
import { AmbientMover, ambientOrigin, pathAt, pathOutline } from "../src/modules/overworld/ambientPath.ts";
import type { Ambient } from "../src/modules/overworld/spawns.ts";

const at = (path: Ambient["path"], extra: Partial<Ambient> = {}): Ambient => ({ x: 10, z: 20, y: 5, sprite: "OBJ_CODE_POKEMON_PIDOVE", path, ...extra });

test("its origin is its tile's middle plus its offset, at its height", () => {
  assert.deepEqual(ambientOrigin(at({ kind: "perch" }, { offset: { x: 2, z: -3 } })), [10 * 16 + 8 + 2, 5, 20 * 16 + 8 - 3]);
});

test("an ellipse spans its width and depth either way, and starts east of its place", () => {
  const xs = pathOutline(at({ kind: "ellipse", width: 32, depth: 16 })).map(([x]) => x);
  const zs = pathOutline(at({ kind: "ellipse", width: 32, depth: 16 })).map(([, z]) => z);
  assert.ok(Math.abs(Math.max(...xs) - 32) < 1e-6 && Math.abs(Math.min(...xs) + 32) < 1e-6);
  assert.ok(Math.abs(Math.max(...zs) - 16) < 0.1 && Math.abs(Math.min(...zs) + 16) < 0.1);
  assert.ok(Math.abs(pathAt(at({ kind: "ellipse", width: 32, depth: 16 }), 0).dx - 32) < 1e-9);
});

test("a line starts at its place, reaches its far end halfway, and comes back", () => {
  const a = at({ kind: "line", width: 48, depth: 0 });
  assert.ok(Math.abs(pathAt(a, 0).dx) < 1e-9);
  assert.ok(Math.abs(pathAt(a, Math.PI).dx - 48) < 1e-9);
  assert.ok(Math.abs(pathAt(a, 2 * Math.PI).dx) < 1e-9);
});

test("a perch and a hover have no outline", () => {
  assert.equal(pathOutline(at({ kind: "perch" })).length, 0);
  assert.equal(pathOutline(at({ kind: "hover" })).length, 0);
});

test("on a circle it faces the way it goes", () => {
  // At the start (east of its place, angle 0) an ellipse goes south
  const m = new AmbientMover(at({ kind: "ellipse", width: 32, depth: 32 }), 8);
  m.tick();
  assert.equal(m.place().dir, "DIR_DOWN");
});

test("a perch turns only to the directions it names", () => {
  const m = new AmbientMover(at({ kind: "perch", every: 1, hops: false, faces: ["DIR_DOWN", "DIR_RIGHT"] }), 8);
  const seen = new Set<string>();
  for (let i = 0; i < 30 * 60; i++) { m.tick(); seen.add(m.place().dir); }
  assert.deepEqual([...seen].sort(), ["DIR_DOWN", "DIR_RIGHT"]);
});

test("waypoints reach each point and come round to the place", () => {
  const a = at({ kind: "waypoints", points: [{ x: 32, z: 0 }, { x: 32, z: 32 }], pace: 4 });
  const m = new AmbientMover(a, 8);
  const [ox, , oz] = ambientOrigin(a);
  const reached = new Set<string>();
  for (let i = 0; i < 30 * 20; i++) {
    m.tick();
    const p = m.place();
    reached.add(`${Math.round(p.x - ox)},${Math.round(p.z - oz)}`);
  }
  for (const stop of ["32,0", "32,32", "0,0"]) assert.ok(reached.has(stop), stop);
});

test("a wander stays within its area", () => {
  const a = at({ kind: "wander", width: 32, depth: 16, every: 1 });
  const m = new AmbientMover(a, 8);
  const [ox, , oz] = ambientOrigin(a);
  for (let i = 0; i < 30 * 60; i++) {
    m.tick();
    const p = m.place();
    assert.ok(Math.abs(p.x - ox) <= 32 && Math.abs(p.z - oz) <= 16);
  }
});

test("a peek is out of sight while it's down, and shows while it's up", () => {
  const m = new AmbientMover(at({ kind: "peek", up: 1, wait: 1 }), 8);
  const seen = new Set<boolean>();
  for (let i = 0; i < 30 * 5; i++) { m.tick(); seen.add(m.place().hidden); }
  assert.deepEqual([...seen].sort(), [false, true]);
});
