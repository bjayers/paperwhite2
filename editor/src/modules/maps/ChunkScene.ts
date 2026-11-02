// The Map Editor's 3D view: a zone's map chunks (their GLBs, with the zone's texture set in its season, as the
// Overworld Editor's map view draws them), the matrix's cells outlined, and the faces of the chunks picked by the
// triangle. The left button picks (a chunk, or faces in the Faces tab), the middle orbits, the right pans and the wheel
// zooms toward the cursor. The editor keeps what is selected; this draws it.

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { chunkLoader } from "../overworld/MapView.tsx";
import { TILE, TILE_FLAG_COLLISION, TILE_FLAG_ENCOUNT, TILE_FLAG_WATER, tileFlags, type ZoneMap } from "../overworld/terrain.ts";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/** A painted map as the scene draws it in place of its chunk (map_project.schema.json): each tile's terrain (a letter
 * a tile, a row a string) and height in half tiles, the library's objects on it, and each terrain's color. */
export interface Painting {
  terrain: string[];
  height: number[][];
  objects: [string, number, number][];
  colors: Record<string, string>;
  /** Whether its tiles' colors and walls are drawn (strokes paint either way). */
  show?: boolean;
  /** Whether the chunk's model is drawn at half its opacity, to see the painting through it. */
  fade?: boolean;
}

/** A model drawn at half its opacity, or as it was. */
function fade(model: THREE.Object3D, on: boolean) {
  model.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const material of [mesh.material].flat()) {
      material.userData.unfaded ??= { opacity: material.opacity, transparent: material.transparent };
      const was = material.userData.unfaded as { opacity: number; transparent: boolean };
      material.opacity = on ? was.opacity * 0.5 : was.opacity;
      material.transparent = on || was.transparent;
      material.needsUpdate = true;
    }
  });
}

const objectLoader = new GLTFLoader();
const objectScenes = new Map<string, Promise<THREE.Object3D | null>>();
/** A library object's model, read once (res/paperwhite2/map_objects/<object>/model.glb). */
export function objectModel(name: string): Promise<THREE.Object3D | null> {
  if (!objectScenes.has(name)) {
    objectScenes.set(name, objectLoader.loadAsync(`/res/paperwhite2/map_objects/${name}/model.glb?t=${Date.now()}`).then((gltf) => {
      gltf.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          (m as THREE.MeshStandardMaterial).alphaTest = 0.5;
          m.side = THREE.DoubleSide;
        }
      });
      return gltf.scene;
    }, () => null));
  }
  return objectScenes.get(name)!;
}
export const forgetObject = (name: string) => objectScenes.delete(name);

/** A face of a chunk: its chunk (by its index in the map's list), the primitive (a draw call) and the triangle. */
export interface Face { chunk: number; primitive: number; triangle: number }
export const faceKey = (f: Face) => `${f.chunk}:${f.primitive}:${f.triangle}`;

/** What a loaded chunk's model draws, for the inspector. */
export interface ChunkModel {
  /** Each primitive's mesh, in the GLB's order, and its material's name and texture image. */
  primitives: { mesh: THREE.Mesh; material: string; image: string | null; triangles: number }[];
  vertices: number;
  triangles: number;
}

export interface PickResult { chunk: number | null; face: Face | null; point: THREE.Vector3 | null; tile: { x: number; z: number } | null;
  /** The Reading layer's tile clicked, in its chunk. */
  readingTile?: { x: number; z: number } }

/** A tile's color by its type: blocked red, water blue, encounters green, the rest grey; the chosen class yellow. */
function tileColor(type: number, highlight: number | null): THREE.Color {
  const flags = tileFlags(type);
  // The ordinary class is most of a map: only another is worth picking out
  if (highlight && (type & 0xffff) === highlight) return new THREE.Color(0xffd040);
  if (flags & TILE_FLAG_COLLISION) return new THREE.Color(0xe04040);
  if (flags & TILE_FLAG_WATER) return new THREE.Color(0x3a7ae0);
  if (flags & TILE_FLAG_ENCOUNT) return new THREE.Color(0x9ad040);
  return new THREE.Color(0xd8d8d8);
}

export class ChunkScene {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  chunks = new THREE.Group();
  marks = new THREE.Group();
  highlight = new THREE.Group();
  paintGroup = new THREE.Group();
  terrain = new THREE.Group();
  private terrainPicks: { mesh: THREE.InstancedMesh; drawn: THREE.InstancedMesh; tiles: { x: number; z: number }[] }[] = [];
  /** While set, a drag paints tiles: onPaint gets the stroke's tiles when it ends. */
  painting = false;
  onPaint: (tiles: { x: number; z: number }[]) => void = () => {};
  private stroke: Map<string, { x: number; z: number }> | null = null;
  /** The chunk drawn from its painting instead of its model, while that view is on, and the painting. */
  paintChunk: number | null = null;
  private painting_: Painting | null = null;
  private paintKey = 0;
  /** While set, the painting's objects drag to other tiles; onObject gets one's new tile, or its click. */
  dragObjects = false;
  onObject: (index: number, tile: { x: number; z: number } | null) => void = () => {};
  private drag: { index: number; object: THREE.Object3D; tile: { x: number; z: number } | null } | null = null;
  models = new Map<number, ChunkModel>();
  map: ZoneMap | null = null;
  /** Bumped when a chunk's GLB changes on disk, so it loads again. */
  versions = new Map<string, number>();
  private frame = 0;
  private loadKey = "";
  onPick: (result: PickResult, ev: PointerEvent) => void = () => {};
  onLoaded: () => void = () => {};
  private downAt: { x: number; y: number } | null = null;

  constructor(private host: HTMLDivElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(45, 1, 1, 20000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.screenSpacePanning = true;
    this.controls.zoomToCursor = true;
    this.controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };
    this.scene.background = new THREE.Color(0x1e2129);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(300, 800, 400);
    this.scene.add(sun, this.chunks, this.marks, this.highlight, this.paintGroup, this.terrain);
    const dom = this.renderer.domElement;
    dom.addEventListener("pointerdown", this.down);
    dom.addEventListener("pointermove", this.move);
    window.addEventListener("pointerup", this.up);
    dom.addEventListener("contextmenu", (e) => e.preventDefault());
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    const loop = () => {
      this.frame = requestAnimationFrame(loop);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    window.removeEventListener("pointerup", this.up);
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.host;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Loads the map's chunks, framing the camera on a new zone. */
  setMap(map: ZoneMap) {
    const zoneChanged = map.zone !== this.map?.zone;
    this.map = map;
    this.reload();
    if (zoneChanged) this.frameAll();
    this.drawCells(null);
  }

  /** Loads every chunk again (after an edit of one, its version bumped). */
  reload() {
    const map = this.map;
    if (!map) return;
    const key = (this.loadKey = `${map.zone}:${map.season}:${[...this.versions.values()].join(",")}`);
    this.chunks.clear();
    this.models.clear();
    const loader = chunkLoader(map);
    let pending = map.chunks.length;
    map.chunks.forEach((chunk, index) => {
      const v = this.versions.get(chunk.folder) ?? 0;
      loader.load(`/${chunk.folder}/model.glb${v ? `?v=${v}` : ""}`, (gltf) => {
        if (this.loadKey !== key) return;
        gltf.scene.position.set(chunk.column * map.chunkSize + map.chunkSize / 2, 0, chunk.row * map.chunkSize + map.chunkSize / 2);
        gltf.scene.userData.chunk = index;
        if (index === this.paintChunk && this.painting_?.fade) fade(gltf.scene, true);
        this.models.set(index, modelOf(gltf));
        this.applyHidden(index);
        if (this.wireframe) addWireframe(gltf.scene);
        this.chunks.add(gltf.scene);
        if (--pending === 0) this.onLoaded();
      }, undefined, () => { if (--pending === 0) this.onLoaded(); });
    });
  }

  frameAll() {
    const map = this.map;
    if (!map?.chunks.length) return;
    const xs = map.chunks.map((c) => c.column), zs = map.chunks.map((c) => c.row);
    const size = map.chunkSize;
    const cx = ((Math.min(...xs) + Math.max(...xs) + 1) / 2) * size, cz = ((Math.min(...zs) + Math.max(...zs) + 1) / 2) * size;
    const span = Math.max(Math.max(...xs) - Math.min(...xs) + 1, Math.max(...zs) - Math.min(...zs) + 1) * size;
    this.controls.target.set(cx, 0, cz);
    this.camera.position.set(cx, span * 0.9, cz + span * 0.6);
    this.controls.update();
  }

  /** Looks at a chunk from above and a little south. */
  frameChunk(index: number) {
    const map = this.map;
    const chunk = map?.chunks[index];
    if (!map || !chunk) return;
    const cx = chunk.column * map.chunkSize + map.chunkSize / 2, cz = chunk.row * map.chunkSize + map.chunkSize / 2;
    this.controls.target.set(cx, 0, cz);
    this.camera.position.set(cx, map.chunkSize * 0.9, cz + map.chunkSize * 0.7);
    this.controls.update();
  }

  /** Outlines every cell, the chosen one brighter, and with grid, its tiles, each outlined at its height (the
   * painting's while one is shown, else its first collision layer's). */
  private cells: { selected: number | null; grid: boolean } = { selected: null, grid: false };
  drawCells(selected: number | null, grid = false) {
    this.cells = { selected, grid };
    const map = this.map;
    this.marks.clear();
    if (!map) return;
    const size = map.chunkSize;
    map.chunks.forEach((chunk, index) => {
      const x0 = chunk.column * size, z0 = chunk.row * size;
      const chosen = index === selected;
      const points = [x0, z0, x0 + size, z0, x0 + size, z0 + size, x0, z0 + size, x0, z0];
      const geometry = new THREE.BufferGeometry().setFromPoints(
        Array.from({ length: 5 }, (_, i) => new THREE.Vector3(points[i * 2], chosen ? 1.5 : 0.5, points[i * 2 + 1])));
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: chosen ? 0xffd040 : 0x6a7390, depthTest: !chosen }));
      line.renderOrder = chosen ? 3 : 2;
      this.marks.add(line);
      if (chosen && grid) {
        const n = map.chunkTiles;
        const heights: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
        if (this.painting_ && this.paintChunk === index) {
          this.painting_.height.forEach((row, z) => row.forEach((h, x) => { if (z < n && x < n) heights[z][x] = h * TILE / 2; }));
        } else {
          const l = chunk.layers[0];
          l?.tiles.forEach((t, i) => { if (t.z < n && t.x < n) heights[t.z][t.x] = l.heights[i]; });
        }
        const lines: THREE.Vector3[] = [];
        const lift = 0.4;
        for (let z = 0; z < n; z++) {
          for (let x = 0; x < n; x++) {
            const y = heights[z][x] + lift;
            const ax = x0 + x * TILE, az = z0 + z * TILE;
            // Its north and west edges, and the south and east ones where the chunk ends or the neighbour's height differs
            lines.push(new THREE.Vector3(ax, y, az), new THREE.Vector3(ax + TILE, y, az));
            lines.push(new THREE.Vector3(ax, y, az), new THREE.Vector3(ax, y, az + TILE));
            if (z === n - 1 || heights[z + 1][x] !== heights[z][x]) lines.push(new THREE.Vector3(ax, y, az + TILE), new THREE.Vector3(ax + TILE, y, az + TILE));
            if (x === n - 1 || heights[z][x + 1] !== heights[z][x]) lines.push(new THREE.Vector3(ax + TILE, y, az), new THREE.Vector3(ax + TILE, y, az + TILE));
          }
        }
        const segments = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lines),
          new THREE.LineBasicMaterial({ color: 0xffd040, transparent: true, opacity: 0.35 }));
        this.marks.add(segments);
      }
    });
  }

  /** Draws a chunk from its painting, in place of its model: each tile a square of its terrain's color at its height,
   * walls where heights differ, and the objects, the selected one boxed; null puts the model back. Strokes paint its
   * tiles. */
  async showPainting(index: number | null, painting: Painting | null, selected: number | null = null) {
    const key = ++this.paintKey;
    const map = this.map;
    this.paintChunk = painting ? index : null;
    this.painting_ = painting;
    this.fadeChunk(painting?.fade ? index : null);
    if (!painting || index === null || !map) {
      this.paintGroup.clear();
      if (this.terrainPicks.some((p) => p.mesh.userData.painting)) this.showTerrain(null);
      this.drawCells(this.cells.selected, this.cells.grid);
      return;
    }
    const chunk = map.chunks[index];
    const size = painting.terrain.length;
    const x0 = chunk.column * map.chunkSize, z0 = chunk.row * map.chunkSize;
    const y = (x: number, z: number) => (painting.height[z]?.[x] ?? 0) * (TILE / 2);
    // The tiles, as squares that strokes pick
    this.terrain.clear();
    this.terrainPicks = [];
    const plane = new THREE.PlaneGeometry(TILE, TILE).rotateX(-Math.PI / 2);
    // Over the model, which shows through them; kept tiles aren't drawn, but still take strokes
    const drawn = new THREE.InstancedMesh(plane, new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.5, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -24 }), size * size);
    drawn.visible = painting.show !== false;
    const pick = new THREE.InstancedMesh(plane, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true, opacity: 0 }), size * size);
    const tiles: { x: number; z: number }[] = [];
    const m = new THREE.Matrix4();
    for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
      const i = z * size + x;
      const kept = painting.terrain[z][x] === ".";
      m.makeTranslation(x0 + x * TILE + TILE / 2, y(x, z) + 0.8, z0 + z * TILE + TILE / 2);
      pick.setMatrixAt(i, m);
      // A kept tile isn't drawn: shrunk to nothing where it stands
      drawn.setMatrixAt(i, kept ? new THREE.Matrix4().makeScale(0, 0, 0) : m);
      drawn.setColorAt(i, new THREE.Color(painting.colors[painting.terrain[z][x]] ?? "#888888"));
      tiles.push({ x: chunk.column * map.chunkTiles + x, z: chunk.row * map.chunkTiles + z });
    }
    drawn.userData.painting = true;
    pick.userData.painting = true;
    drawn.renderOrder = 2;
    this.terrain.add(drawn, pick);
    this.terrainPicks.push({ mesh: pick, drawn, tiles });
    // The walls between heights, grey
    const walls: number[] = [];
    for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
      for (const [dx, dz] of [[1, 0], [0, 1]]) {
        if (x + dx >= size || z + dz >= size) continue;
        if (painting.terrain[z][x] === "." && painting.terrain[z + dz][x + dx] === ".") continue;
        const a = y(x, z), b = y(x + dx, z + dz);
        if (a === b) continue;
        const [ax, az, bx, bz] = dx ? [x + 1, z, x + 1, z + 1] : [x, z + 1, x + 1, z + 1];
        const p = (gx: number, gz: number, h: number) => [x0 + gx * TILE, h, z0 + gz * TILE];
        walls.push(...p(ax, az, a), ...p(bx, bz, a), ...p(bx, bz, b), ...p(ax, az, a), ...p(bx, bz, b), ...p(ax, az, b));
      }
    }
    const group = new THREE.Group();
    if (walls.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(walls, 3));
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x8a8070, side: THREE.DoubleSide, transparent: true, opacity: 0.7 }));
      mesh.visible = painting.show !== false;
      group.add(mesh);
    }
    // The objects, on the ground of their north-west tile
    const placed = await Promise.all(painting.objects.map(([name]) => objectModel(name)));
    if (key !== this.paintKey) return;
    painting.objects.forEach(([, x, z], i) => {
      const model = placed[i];
      if (!model) return;
      const copy = model.clone();
      copy.position.set(x0 + x * TILE, y(x, z), z0 + z * TILE);
      copy.userData.objectIndex = i;
      group.add(copy);
      if (i === selected) group.add(new THREE.BoxHelper(copy, 0xffd040));
    });
    this.paintGroup.clear();
    this.paintGroup.add(group);
    this.drawCells(this.cells.selected, this.cells.grid);
  }

  /** Draws a chunk's model at half its opacity (null: every chunk as it is). */
  private fadeChunk(index: number | null) {
    for (const o of this.chunks.children) fade(o, index !== null && o.userData.chunk === index);
  }

  /** Draws the chunks' collision tiles of a layer over the map, at their heights, colored by type; null hides them. */
  showTerrain(layer: number | null, highlight: number | null = null) {
    this.terrain.clear();
    this.terrainPicks = [];
    const map = this.map;
    if (layer === null || !map) return;
    const plane = new THREE.PlaneGeometry(TILE - 1.5, TILE - 1.5).rotateX(-Math.PI / 2);
    const pickPlane = new THREE.PlaneGeometry(TILE, TILE).rotateX(-Math.PI / 2);
    const pickMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true, opacity: 0 });
    for (const chunk of map.chunks) {
      const l = chunk.layers[Math.min(layer, chunk.layers.length - 1)];
      if (!l) continue;
      const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false,
                                                     polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -24 });
      const drawn = new THREE.InstancedMesh(plane, material, l.tiles.length);
      const pick = new THREE.InstancedMesh(pickPlane, pickMaterial, l.tiles.length);
      const tiles: { x: number; z: number }[] = [];
      const m = new THREE.Matrix4();
      l.tiles.forEach((t, i) => {
        const gx = chunk.column * map.chunkTiles + t.x, gz = chunk.row * map.chunkTiles + t.z;
        m.makeTranslation(gx * TILE + TILE / 2, l.heights[i] + 0.8, gz * TILE + TILE / 2);
        drawn.setMatrixAt(i, m);
        pick.setMatrixAt(i, m);
        drawn.setColorAt(i, tileColor(t.tileType, highlight));
        tiles.push({ x: gx, z: gz });
      });
      drawn.renderOrder = 2;
      this.terrain.add(drawn, pick);
      this.terrainPicks.push({ mesh: pick, drawn, tiles });
    }
  }

  /** The collision tile under the pointer. */
  tileAt(ev: PointerEvent): { tile: { x: number; z: number }; drawn: THREE.InstancedMesh; index: number } | null {
    if (!this.terrainPicks.length) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1), this.camera);
    const hit = ray.intersectObjects(this.terrainPicks.map((p) => p.mesh), false)[0];
    if (!hit || hit.instanceId === undefined) return null;
    const pick = this.terrainPicks.find((p) => p.mesh === hit.object)!;
    return { tile: pick.tiles[hit.instanceId], drawn: pick.drawn, index: hit.instanceId };
  }

  /** Draws the selected faces over the model, in yellow. */
  /** The map reader's layer over a chunk: each tile a square of its colour at its ground's height, an arrow toward an
   * edge's outside, a dashed outline where the reading is unsure, a box where a structure stands; null hides it. */
  private readingGroup = new THREE.Group();
  private readingChunk: number | null = null;
  private readingTiles: { x: number; z: number }[] = [];
  showReading(index: number | null, tiles: { x: number; z: number; y: number; color: string; outside: string | null; unsure: boolean;
    structure: boolean; selected: boolean }[] | null) {
    this.readingGroup.clear();
    if (!this.readingGroup.parent) this.scene.add(this.readingGroup);
    const map = this.map;
    this.readingChunk = tiles ? index : null;
    this.readingTiles = tiles ? tiles.map((t) => ({ x: t.x, z: t.z })) : [];
    if (index === null || !tiles || !map) return;
    const chunk = map.chunks[index];
    const x0 = chunk.column * map.chunkSize, z0 = chunk.row * map.chunkSize;
    const plane = new THREE.PlaneGeometry(TILE - 2, TILE - 2).rotateX(-Math.PI / 2);
    const squares = new THREE.InstancedMesh(plane, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -24 }), tiles.length);
    const m = new THREE.Matrix4();
    const arrows: THREE.Vector3[] = [], unsure: THREE.Vector3[] = [], boxes: THREE.Vector3[] = [], picked: THREE.Vector3[] = [];
    const dirs: Record<string, [number, number]> = { N: [0, -1], NE: [0.7, -0.7], E: [1, 0], SE: [0.7, 0.7], S: [0, 1], SW: [-0.7, 0.7], W: [-1, 0], NW: [-0.7, -0.7] };
    tiles.forEach((t, i) => {
      const cx = x0 + t.x * TILE + TILE / 2, cz = z0 + t.z * TILE + TILE / 2, y = t.y + 1.2;
      m.makeTranslation(cx, y, cz);
      squares.setMatrixAt(i, m);
      squares.setColorAt(i, new THREE.Color(t.color));
      const square = (out: THREE.Vector3[], r: number) => {
        const c = [[-r, -r], [r, -r], [r, r], [-r, r]].map(([dx, dz]) => new THREE.Vector3(cx + dx, y + 0.2, cz + dz));
        for (let k = 0; k < 4; k++) out.push(c[k], c[(k + 1) % 4]);
      };
      if (t.outside && dirs[t.outside]) {
        const [dx, dz] = dirs[t.outside];
        const tip = new THREE.Vector3(cx + dx * 6, y + 0.3, cz + dz * 6), tail = new THREE.Vector3(cx - dx * 4, y + 0.3, cz - dz * 4);
        const side = new THREE.Vector3(-dz * 2.5, 0, dx * 2.5);
        const back = tip.clone().add(new THREE.Vector3(-dx * 3, 0, -dz * 3));
        arrows.push(tail, tip, tip, back.clone().add(side), tip, back.clone().sub(side));
      }
      if (t.unsure) square(unsure, 5);
      if (t.structure) square(boxes, 7);
      if (t.selected) square(picked, 7.8);
    });
    squares.renderOrder = 3;
    this.readingGroup.add(squares);
    const lines = (points: THREE.Vector3[], color: number) => {
      if (!points.length) return;
      const l = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color, depthTest: false }));
      l.renderOrder = 4;
      this.readingGroup.add(l);
    };
    lines(arrows, 0x202020);
    lines(unsure, 0xff3030);
    lines(boxes, 0x8040ff);
    lines(picked, 0xffff40);
  }

  /** Faces hidden from view and from clicks (Blender's H), by chunk folder: each triangle by its corners' positions,
   * so it stays hidden when an edit of the chunk renumbers its triangles. The files never change. */
  private hidden = new Map<string, Set<string>>();
  hiddenCount() {
    let n = 0;
    for (const set of this.hidden.values()) n += set.size;
    return n;
  }
  hideFaces(faces: Face[]) {
    const map = this.map;
    if (!map) return;
    const touched = new Set<number>();
    for (const f of faces) {
      const mesh = this.models.get(f.chunk)?.primitives[f.primitive]?.mesh;
      const folder = map.chunks[f.chunk]?.folder;
      if (!mesh || !folder) continue;
      if (!this.hidden.has(folder)) this.hidden.set(folder, new Set());
      this.hidden.get(folder)!.add(triangleKey(mesh.geometry, f.triangle));
      touched.add(f.chunk);
    }
    for (const index of touched) this.applyHidden(index);
  }
  /** Shows every hidden face again (the chunks load again, whole). */
  showHidden() {
    this.hidden.clear();
    this.reload();
  }
  private applyHidden(index: number) {
    const folder = this.map?.chunks[index]?.folder;
    const keys = folder ? this.hidden.get(folder) : undefined;
    const model = this.models.get(index);
    if (!keys?.size || !model) return;
    for (const { mesh } of model.primitives) {
      const geometry = mesh.geometry;
      const count = (geometry.index?.count ?? geometry.attributes.position.count) / 3;
      let changed = false;
      for (let t = 0; t < count; t++) {
        if (!keys.has(triangleKey(geometry, t))) continue;
        // Drawn as a point: no area to see or to click
        if (geometry.index) {
          geometry.index.setX(t * 3 + 1, geometry.index.getX(t * 3));
          geometry.index.setX(t * 3 + 2, geometry.index.getX(t * 3));
        } else {
          const position = geometry.attributes.position as THREE.BufferAttribute;
          for (const k of [1, 2]) position.setXYZ(t * 3 + k, position.getX(t * 3), position.getY(t * 3), position.getZ(t * 3));
        }
        changed = true;
      }
      if (!changed) continue;
      if (geometry.index) geometry.index.needsUpdate = true;
      else geometry.attributes.position.needsUpdate = true;
      // Its wireframe drawn again without them
      for (const child of [...mesh.children]) if (child.userData.wireframe) mesh.remove(child);
      if (this.wireframe) addWireframe(mesh);
    }
  }

  /** Draws the chunks' triangles' edges over their models, to see what a click will pick. */
  wireframe = false;
  setWireframe(on: boolean) {
    this.wireframe = on;
    for (const chunk of this.chunks.children) {
      if (on) addWireframe(chunk);
      else chunk.traverse((o) => { if (o.userData.wireframe) o.parent?.remove(o); });
    }
  }

  showFaces(faces: Face[]) {
    this.highlight.clear();
    const byMesh = new Map<THREE.Mesh, number[]>();
    for (const f of faces) {
      const mesh = this.models.get(f.chunk)?.primitives[f.primitive]?.mesh;
      if (!mesh) continue;
      if (!byMesh.has(mesh)) byMesh.set(mesh, []);
      byMesh.get(mesh)!.push(f.triangle);
    }
    for (const [mesh, triangles] of byMesh) {
      const positions: number[] = [];
      const p = new THREE.Vector3();
      const index = mesh.geometry.index;
      mesh.updateWorldMatrix(true, false);
      for (const t of triangles) {
        for (let k = 0; k < 3; k++) {
          const vertex = index ? index.getX(t * 3 + k) : t * 3 + k;
          (mesh as THREE.SkinnedMesh).isSkinnedMesh
            ? (mesh as THREE.SkinnedMesh).getVertexPosition(vertex, p)
            : p.fromBufferAttribute(mesh.geometry.attributes.position as THREE.BufferAttribute, vertex);
          p.applyMatrix4(mesh.matrixWorld);
          positions.push(p.x, p.y, p.z);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      const fill = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0xffd040, transparent: true, opacity: 0.45,
        side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 }));
      fill.renderOrder = 4;
      const edges = new THREE.LineSegments(new THREE.WireframeGeometry(geometry), new THREE.LineBasicMaterial({ color: 0xffe080 }));
      edges.renderOrder = 5;
      this.highlight.add(fill, edges);
    }
  }

  private down = (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    this.downAt = { x: ev.clientX, y: ev.clientY };
    if (this.dragObjects && this.paintChunk !== null) {
      const hit = this.raycaster(ev).intersectObjects(this.paintGroup.children, true)[0];
      let o: THREE.Object3D | null = hit?.object ?? null;
      while (o && o.userData.objectIndex === undefined) o = o.parent;
      if (o) {
        this.drag = { index: o.userData.objectIndex as number, object: o, tile: null };
        this.controls.enabled = false;
        return;
      }
    }
    if (this.painting && !ev.altKey) {
      this.stroke = new Map();
      this.strokeAt(ev);
    }
  };

  private move = (ev: PointerEvent) => {
    if (this.drag) {
      // The object follows the pointer from tile to tile, standing on each tile's ground
      const hit = this.tileAt(ev);
      const map = this.map, painting = this.painting_, chunk = map && this.paintChunk !== null ? map.chunks[this.paintChunk] : null;
      if (!hit || !map || !painting || !chunk) return;
      const x = hit.tile.x - chunk.column * map.chunkTiles, z = hit.tile.z - chunk.row * map.chunkTiles;
      this.drag.tile = { x, z };
      this.drag.object.position.set(chunk.column * map.chunkSize + x * TILE, (painting.height[z]?.[x] ?? 0) * (TILE / 2),
                                    chunk.row * map.chunkSize + z * TILE);
      return;
    }
    if (this.stroke) this.strokeAt(ev);
  };

  private raycaster(ev: PointerEvent): THREE.Raycaster {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1), this.camera);
    return ray;
  }

  /** Adds the tile under the pointer to the stroke, marked yellow until the stroke is painted. */
  private strokeAt(ev: PointerEvent) {
    const hit = this.tileAt(ev);
    if (!hit || !this.stroke) return;
    const key = `${hit.tile.x},${hit.tile.z}`;
    if (this.stroke.has(key)) return;
    this.stroke.set(key, hit.tile);
    hit.drawn.setColorAt(hit.index, new THREE.Color(0xffe060));
    if (hit.drawn.instanceColor) hit.drawn.instanceColor.needsUpdate = true;
    // A tile drawn as nothing (a kept tile of a painting) shows while the stroke passes
    const pick = this.terrainPicks.find((p) => p.drawn === hit.drawn);
    if (pick && pick.mesh !== hit.drawn) {
      const m = new THREE.Matrix4();
      pick.mesh.getMatrixAt(hit.index, m);
      hit.drawn.setMatrixAt(hit.index, m);
      hit.drawn.instanceMatrix.needsUpdate = true;
    }
  }

  private up = (ev: PointerEvent) => {
    if (this.drag) {
      const { index, tile } = this.drag;
      this.drag = null;
      this.downAt = null;
      this.controls.enabled = true;
      this.onObject(index, tile);
      return;
    }
    if (this.stroke) {
      const tiles = [...this.stroke.values()];
      this.stroke = null;
      this.downAt = null;
      if (tiles.length) this.onPaint(tiles);
      return;
    }
    const at = this.downAt;
    this.downAt = null;
    if (!at || ev.button !== 0 || Math.hypot(ev.clientX - at.x, ev.clientY - at.y) > 4) return;
    this.onPick(this.pick(ev), ev);
  };

  /** The chunk cell and the face under the pointer. */
  pick(ev: PointerEvent): PickResult {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    if (this.readingChunk !== null && this.readingGroup.children.length) {
      // On the Reading layer, its square clicked first (one under a walkway, or floating where nothing else is)
      const hit = ray.intersectObject(this.readingGroup.children[0], false)[0];
      if (hit && hit.instanceId !== undefined) {
        const t = this.readingTiles[hit.instanceId];
        return { chunk: this.readingChunk, face: null, point: hit.point, tile: null, readingTile: t };
      }
    }
    if (this.paintChunk !== null) {
      // On a painting, the tile clicked
      const hit = this.tileAt(ev);
      if (hit) return { chunk: this.paintChunk, face: null, point: null, tile: hit.tile };
    }
    const hits = ray.intersectObjects(this.chunks.children.filter((c) => c.visible), true);
    for (const hit of hits) {
      let o: THREE.Object3D | null = hit.object;
      while (o && o.userData.chunk === undefined) o = o.parent;
      const chunk = o?.userData.chunk as number | undefined;
      if (chunk === undefined || hit.faceIndex == null) continue;
      const primitive = this.models.get(chunk)?.primitives.findIndex((p) => p.mesh === hit.object) ?? -1;
      if (primitive < 0) continue;
      return { chunk, face: { chunk, primitive, triangle: hit.faceIndex }, point: hit.point, tile: this.tileAt(ev)?.tile ?? null };
    }
    // No model under it: the cell the ray meets the ground in
    const ground = new THREE.Vector3();
    if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), ground) || !this.map) return { chunk: null, face: null, point: null, tile: null };
    const size = this.map.chunkSize;
    const index = this.map.chunks.findIndex((c) => Math.floor(ground.x / size) === c.column && Math.floor(ground.z / size) === c.row);
    return { chunk: index < 0 ? null : index, face: null, point: ground, tile: this.tileAt(ev)?.tile ?? null };
  }
}

const WIREFRAME = new THREE.LineBasicMaterial({ color: 0x101820, transparent: true, opacity: 0.45 });

/** Adds each mesh's triangles' edges to it, once. */
/** A triangle by its corners' positions (sorted, to a hundredth), which a renumbering of the triangles keeps. A
 * hidden one's corners are all its first, which no visible triangle has. */
function triangleKey(geometry: THREE.BufferGeometry, t: number): string {
  const position = geometry.attributes.position as THREE.BufferAttribute;
  const corners: string[] = [];
  for (let k = 0; k < 3; k++) {
    const v = geometry.index ? geometry.index.getX(t * 3 + k) : t * 3 + k;
    corners.push([position.getX(v), position.getY(v), position.getZ(v)].map((c) => c.toFixed(2)).join(","));
  }
  return corners.sort().join(";");
}

function addWireframe(root: THREE.Object3D) {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh && !o.userData.wireframe) meshes.push(o as THREE.Mesh); });
  for (const mesh of meshes) {
    if (mesh.children.some((c) => c.userData.wireframe)) continue;
    const lines = new THREE.LineSegments(new THREE.WireframeGeometry(mesh.geometry), WIREFRAME);
    lines.userData.wireframe = true;
    lines.renderOrder = 3;
    lines.raycast = () => {};
    mesh.add(lines);
  }
}

/** The primitives of a chunk's GLB, in order: GLTFLoader makes a mesh of each, as children of the mesh's group, or the
 * mesh itself when it has one. */
function modelOf(gltf: GLTF): ChunkModel {
  const primitives: ChunkModel["primitives"] = [];
  let vertices = 0;
  let triangles = 0;
  gltf.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      (m as THREE.MeshStandardMaterial).alphaTest = 0.5;
      m.side = THREE.DoubleSide;
    }
    const material = mesh.material as THREE.MeshStandardMaterial;
    const count = (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
    const image = (material.map?.image as { src?: string } | undefined)?.src ?? material.map?.name ?? null;
    primitives.push({ mesh, material: material.name, image: image ? decodeURIComponent(image.slice(image.lastIndexOf("/") + 1)) : null,
                      triangles: count });
    // The draw calls share the GLB's vertices; each draws those its indices name
    const index = mesh.geometry.index;
    if (index) {
      const used = new Set<number>();
      for (let i = 0; i < index.count; i++) used.add(index.getX(i));
      vertices += used.size;
    } else vertices += mesh.geometry.attributes.position.count;
    triangles += count;
  });
  return { primitives, vertices, triangles };
}

/** The faces connected to a face across the chunk's draw calls: those sharing a vertex's position with it, and so on
 * (a tree's trunk and leaves, a ledge's top and side). */
export function connectedFaces(model: ChunkModel, start: Face): Face[] {
  const keyOf = (p: THREE.BufferAttribute, v: number) => `${p.getX(v).toFixed(2)},${p.getY(v).toFixed(2)},${p.getZ(v).toFixed(2)}`;
  const corners = (primitive: number, t: number): string[] => {
    const geometry = model.primitives[primitive].mesh.geometry;
    const position = geometry.attributes.position as THREE.BufferAttribute;
    return [0, 1, 2].map((k) => keyOf(position, geometry.index ? geometry.index.getX(t * 3 + k) : t * 3 + k));
  };
  const byVertex = new Map<string, [number, number][]>();
  model.primitives.forEach((p, primitive) => {
    for (let t = 0; t < p.triangles; t++) for (const c of corners(primitive, t)) {
      if (!byVertex.has(c)) byVertex.set(c, []);
      byVertex.get(c)!.push([primitive, t]);
    }
  });
  const seen = new Set([`${start.primitive}:${start.triangle}`]);
  const queue: [number, number][] = [[start.primitive, start.triangle]];
  const out: Face[] = [];
  while (queue.length) {
    const [primitive, t] = queue.pop()!;
    out.push({ chunk: start.chunk, primitive, triangle: t });
    for (const c of corners(primitive, t)) for (const [p, u] of byVertex.get(c) ?? []) {
      const k = `${p}:${u}`;
      if (!seen.has(k)) { seen.add(k); queue.push([p, u]); }
    }
  }
  return out;
}

/** The faces stacked with the selection, seen from above: a tree's trunk and its layers of leaves, which don't share
 * corners and widen downward. Faces no wider than 8 tiles (a block of forest) that overlap the selection's footprint join it, and the
 * footprint grows with them for a few rounds, except the ground under the stack's foot. */
export function stackedFaces(model: ChunkModel, faces: Face[]): Face[] {
  if (!faces.length) return faces;
  type Info = { primitive: number; triangle: number; box: number[]; low: number; high: number; flat: boolean };
  const infos: Info[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  model.primitives.forEach((p, primitive) => {
    const geometry = p.mesh.geometry;
    const position = geometry.attributes.position as THREE.BufferAttribute;
    for (let t = 0; t < p.triangles; t++) {
      const v = [0, 1, 2].map((k) => (geometry.index ? geometry.index.getX(t * 3 + k) : t * 3 + k));
      a.fromBufferAttribute(position, v[0]); b.fromBufferAttribute(position, v[1]); c.fromBufferAttribute(position, v[2]);
      const normal = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();
      infos.push({ primitive, triangle: t, low: Math.min(a.y, b.y, c.y), high: Math.max(a.y, b.y, c.y), flat: Math.abs(normal.y) > 0.9,
                   box: [Math.min(a.x, b.x, c.x), Math.max(a.x, b.x, c.x), Math.min(a.z, b.z, c.z), Math.max(a.z, b.z, c.z)] });
    }
  });
  const byKey = new Map(infos.map((i) => [`${i.primitive}:${i.triangle}`, i]));
  const LIMIT = 8 * TILE;
  let stack = faces.map((f) => byKey.get(`${f.primitive}:${f.triangle}`)!).filter(Boolean);
  // A few rounds, the footprint growing with what joins: a crossed card of leaves is thin, the layers around it wide
  for (let round = 0; round < 3; round++) {
    const foot = [Math.min(...stack.map((i) => i.box[0])), Math.max(...stack.map((i) => i.box[1])),
                  Math.min(...stack.map((i) => i.box[2])), Math.max(...stack.map((i) => i.box[3]))];
    const inside = infos.filter((i) => i.box[1] - i.box[0] <= LIMIT && i.box[3] - i.box[2] <= LIMIT
      && i.box[1] > foot[0] && i.box[0] < foot[1] && i.box[3] > foot[2] && i.box[2] < foot[3]);
    // The stack's foot: where its tall upright faces (a trunk, the crossed cards of leaves) start, or else the
    // selection's lowest point
    const tall = inside.filter((i) => !i.flat && i.high - i.low >= TILE);
    const base = tall.length ? Math.min(...tall.map((i) => i.low)) : Math.min(...stack.map((i) => i.low));
    // Below the foot is ground; at it, a flat face is the stack's lowest layer of leaves only where a layer above has
    // its outline (the ground there reaches past it)
    const next = inside.filter((i) => i.high >= base - 0.5 && !(i.flat && i.high <= base + 1
      && !inside.some((j) => j.flat && j.low > base + 1 && j.box.every((v, k) => Math.abs(v - i.box[k]) < 1))));
    const known = new Set(stack);
    const grown = next.filter((i) => !known.has(i));
    if (!grown.length) break;
    stack = [...stack, ...grown];
  }
  const out = stack.map((i) => ({ chunk: faces[0].chunk, primitive: i.primitive, triangle: i.triangle }));
  return out;
}
