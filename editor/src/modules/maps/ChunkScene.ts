// The Map Editor's 3D view: a zone's map chunks (their GLBs, with the zone's texture set in its season, as the
// Overworld Editor's map view draws them), the matrix's cells outlined, and the faces of the chunks picked by the
// triangle. The left button picks (a chunk, or faces in the Faces tab), the middle orbits, the right pans and the wheel
// zooms toward the cursor. The editor keeps what is selected; this draws it.

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { chunkLoader } from "../overworld/MapView.tsx";
import { TILE, TILE_FLAG_COLLISION, TILE_FLAG_ENCOUNT, TILE_FLAG_WATER, tileFlags, type ZoneMap } from "../overworld/terrain.ts";
import { tileModels } from "./tiles.ts";

/** A layout's tiles, as the scene draws them in place of their chunk: ground [x, z, key, height], objects [key, x, z,
 * height]. */
export interface LayoutTiles { library: string; ground: [number, number, string, number][]; objects: [string, number, number, number][] }

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

export interface PickResult { chunk: number | null; face: Face | null; point: THREE.Vector3 | null; tile: { x: number; z: number } | null }

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
  layoutGroup = new THREE.Group();
  terrain = new THREE.Group();
  private terrainPicks: { mesh: THREE.InstancedMesh; drawn: THREE.InstancedMesh; tiles: { x: number; z: number }[] }[] = [];
  /** While set, a drag paints tiles: onPaint gets the stroke's tiles when it ends. */
  painting = false;
  onPaint: (tiles: { x: number; z: number }[]) => void = () => {};
  private stroke: Map<string, { x: number; z: number }> | null = null;
  /** The chunk drawn from its layout's tiles instead of its model, while that preview is on. */
  layoutChunk: number | null = null;
  private layoutKey = 0;
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
    this.scene.add(sun, this.chunks, this.marks, this.highlight, this.layoutGroup, this.terrain);
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
        gltf.scene.visible = index !== this.layoutChunk;
        this.models.set(index, modelOf(gltf));
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

  /** Outlines every cell, the chosen one brighter, and with grid, its tiles. */
  drawCells(selected: number | null, grid = false) {
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
        const lines: THREE.Vector3[] = [];
        for (let i = 1; i < size / TILE; i++) {
          lines.push(new THREE.Vector3(x0 + i * TILE, 0.3, z0), new THREE.Vector3(x0 + i * TILE, 0.3, z0 + size));
          lines.push(new THREE.Vector3(x0, 0.3, z0 + i * TILE), new THREE.Vector3(x0 + size, 0.3, z0 + i * TILE));
        }
        const segments = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lines),
          new THREE.LineBasicMaterial({ color: 0xffd040, transparent: true, opacity: 0.25 }));
        this.marks.add(segments);
      }
    });
  }

  /** Draws a chunk from its layout's tiles, in place of its model; null puts the model back. */
  async showLayout(index: number | null, layout: LayoutTiles | null) {
    const key = ++this.layoutKey;
    const map = this.map;
    this.layoutChunk = layout ? index : null;
    for (const o of this.chunks.children) o.visible = o.userData.chunk !== this.layoutChunk;
    if (!layout || index === null || !map) { this.layoutGroup.clear(); return; }
    const chunk = map.chunks[index];
    const models = await tileModels(layout.library);
    if (key !== this.layoutKey) return;
    const group = new THREE.Group();
    group.position.set(chunk.column * map.chunkSize, 0, chunk.row * map.chunkSize);
    const place = (tile: string, x: number, z: number, y: number) => {
      const node = models.getObjectByName(tile);
      if (!node) return;
      const copy = node.clone();
      copy.position.set(x * TILE, y, z * TILE);
      group.add(copy);
    };
    for (const [x, z, tile, y] of layout.ground) place(tile, x, z, y);
    for (const [tile, x, z, y] of layout.objects) place(tile, x, z, y);
    this.layoutGroup.clear();
    this.layoutGroup.add(group);
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
    if (this.painting && !ev.altKey) {
      this.stroke = new Map();
      this.strokeAt(ev);
    }
  };

  private move = (ev: PointerEvent) => { if (this.stroke) this.strokeAt(ev); };

  /** Adds the tile under the pointer to the stroke, marked yellow until the stroke is painted. */
  private strokeAt(ev: PointerEvent) {
    const hit = this.tileAt(ev);
    if (!hit || !this.stroke) return;
    const key = `${hit.tile.x},${hit.tile.z}`;
    if (this.stroke.has(key)) return;
    this.stroke.set(key, hit.tile);
    hit.drawn.setColorAt(hit.index, new THREE.Color(0xffe060));
    if (hit.drawn.instanceColor) hit.drawn.instanceColor.needsUpdate = true;
  }

  private up = (ev: PointerEvent) => {
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
    if (this.layoutChunk !== null) {
      // On a layout, only where it was clicked counts: the cell under it
      const hit = ray.intersectObjects(this.layoutGroup.children, true)[0];
      if (hit) return { chunk: this.layoutChunk, face: null, point: hit.point, tile: this.tileAt(ev)?.tile ?? null };
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
