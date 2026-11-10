// Disposing of a three.js TransformControls (the Map Editor's move gizmo). three 0.169's own dispose() calls
// this.traverse(), which its Controls base class doesn't have (it is no longer an Object3D): it throws "this.traverse is
// not a function", and thrown from the Map Editor's unmount it took the whole page down when its tab was closed. This
// does what that dispose() means to: lets go of the canvas's events and frees the helper's geometries and materials.

import type * as THREE from "three";
import type { TransformControls } from "three/examples/jsm/controls/TransformControls.js";

export function disposeGizmo(gizmo: TransformControls) {
  gizmo.detach();
  gizmo.disconnect();
  const helper = gizmo.getHelper();
  helper.removeFromParent();
  helper.traverse((child) => {
    const { geometry, material } = child as THREE.Mesh;
    geometry?.dispose();
    for (const m of Array.isArray(material) ? material : material ? [material] : []) m.dispose();
  });
}
