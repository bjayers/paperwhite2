// Closing the Map Editor's tab disposes of its 3D view. three 0.169's TransformControls.dispose() throws there, and an
// error thrown from a React unmount takes the whole page down; the scene disposes of its gizmo with disposeGizmo()
// instead (src/modules/maps/gizmo.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { disposeGizmo } from "../src/modules/maps/gizmo.ts";

// A canvas as far as TransformControls uses one: its events and style
function fakeCanvas() {
  const listeners = new Map<string, Set<unknown>>();
  return {
    listeners,
    style: {} as Record<string, string>,
    addEventListener(type: string, f: unknown) { listeners.set(type, (listeners.get(type) ?? new Set()).add(f)); },
    removeEventListener(type: string, f: unknown) { listeners.get(type)?.delete(f); },
    ownerDocument: { addEventListener() {}, removeEventListener() {} },
  };
}

const make = () => {
  const canvas = fakeCanvas();
  const gizmo = new TransformControls(new THREE.PerspectiveCamera(), canvas as unknown as HTMLElement);
  return { canvas, gizmo };
};

test("three's own TransformControls.dispose() still throws (drop disposeGizmo when it doesn't)", () => {
  assert.throws(() => make().gizmo.dispose(), /traverse is not a function/);
});

test("disposeGizmo lets go of the canvas's events and frees the helper", () => {
  const { canvas, gizmo } = make();
  const scene = new THREE.Scene();
  scene.add(gizmo.getHelper());
  let freed = 0;
  gizmo.getHelper().traverse((c) => { (c as THREE.Mesh).geometry?.addEventListener("dispose", () => freed++); });
  assert.doesNotThrow(() => disposeGizmo(gizmo));
  assert.equal([...canvas.listeners.values()].reduce((n, s) => n + s.size, 0), 0);
  assert.equal(gizmo.getHelper().parent, null);
  assert.ok(freed > 0);
});
