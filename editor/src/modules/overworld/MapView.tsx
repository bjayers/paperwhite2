// The map view, shared by the Overworld Editor and the later Map Editor: a zone's map chunks in 3D (their GLBs, served
// with their texture PNGs from /res/), each placed at its matrix cell, the collision tiles laid over them at their
// heights (one layer at a time, for the two-layer chunks), and the entities on their tiles with their sprites,
// leashes, sight lines and areas. It reports clicks, drags and painting in global tiles; the editor changes the data.
// The left button selects, drags and paints; the middle orbits, the right pans and the wheel zooms. An entity stands
// on the layer nearest its height, as in game; those on the other layer are drawn faded.

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { directionStep, type Entity } from "./entities.ts";
import { FRAME_SECONDS, movers, type World } from "./movement.ts";
import { angle as turnAngle, FX, type CameraArea, type ViewCamera } from "./cameras.ts";
import { lineAtLevel, railTile, railToWorld, sidesAt, type RailMap, type RailPlace } from "./rails.ts";
import { spriteFrame, spriteFrameCount } from "./sprites.ts";
import { AmbientMover, ambientOrigin, pathOutline } from "./ambientPath.ts";
import { TILE, TILE_FLAG_COLLISION, TILE_FLAG_ENCOUNT, TILE_FLAG_WATER, standingOn, tileFlags, type ZoneMap } from "./terrain.ts";

export type OverlayMode = "off" | "walk" | "type";

export interface MapViewProps {
  map: ZoneMap;
  entities: Entity[];
  selected: Entity | null;
  layer: number;
  overlay: OverlayMode;
  /** The models' detail: the GLBs, or the tiles alone (faster). */
  showModels: boolean;
  /** While true, a drag paints tiles rather than moving entities. */
  painting: boolean;
  /** The tile type being painted, to color the tiles as the stroke passes; null to mark them yellow (a height). */
  paintType: number | null;
  /** The NPCs move as their move codes move them in game, from their tiles, which stay marked. */
  preview: boolean;
  /** Straight down, without perspective, north up: the camera only pans and zooms. */
  overhead: boolean;
  onSelect(entity: Entity | null, tile: { x: number; z: number } | null): void;
  onMove(entity: Entity, x: number, z: number, height: number): void;
  onAdd(x: number, z: number, height: number): void;
  onPaint(tiles: { x: number; z: number }[]): void;
  /** The zone's rails, for a zone without a grid, and the same for places on them. */
  rails: RailMap | null;
  /** The rails' height shown, in units, or null for every one (Castelia's rails are at several). */
  railLevel: number | null;
  /** In a zone with both, which tiles are drawn and picked: the grid's, the rails' or both (the entities always). */
  ground: "both" | "grid" | "rails";
  onMoveRail(entity: Entity, place: RailPlace): void;
  onAddRail(place: RailPlace, height: number): void;
  onPaintRail(places: RailPlace[]): void;
  /** The zone's camera areas, drawn for the Cameras tab, and a camera to look through in place of the editor's. */
  cameraAreas: CameraArea[] | null;
  viewCamera: ViewCamera | null;
  /** A rectangle of tiles an entity covers (a trigger, a warp, a camera rect), moved, resized or drawn: its first tile and
   * its size in tiles. */
  onRect(entity: Entity, rect: TileRect): void;
  /** The entity whose rectangle is being drawn: a drag on the map draws it. */
  drawRect: Entity | null;
  /** A rail point dragged to a spot, in units, at its own height. */
  onMoveRailPoint(index: number, x: number, z: number): void;
}

export interface TileRect { x: number; z: number; width: number; depth: number }

/** Whether an entity covers a rectangle the map can move and resize: a trigger, a warp or a camera rect on the grid. */
export const hasRect = (e: Entity, areas: CameraArea[] | null) =>
  e.x !== null && e.z !== null && !e.rail && (e.kind === "trigger" || e.kind === "warp" || (e.kind === "camera" && !!areas?.[e.index]?.rect));

/** A handle's edges: which of the rectangle's sides it moves. */
type Handle = { w?: boolean; e?: boolean; n?: boolean; s?: boolean };

/** A tile of a rail, as picked: its place and its spot in the world. */
type RailPick = RailPlace & { pos: [number, number, number] };

/** The four corners of a rail tile, as a quad around its place (fronts and sides from - 0.5 to + 0.5), inset. */
function railQuad(rails: RailMap, line: number, f0: number, f1: number, s0: number, s1: number, y: number): THREE.Vector3[] | null {
  const len = rails.lines[line]?.length ?? 0;
  const a = Math.max(0, f0), b = Math.min(len, f1);
  const corners = [[a, s0], [a, s1], [b, s1], [b, s0]].map(([f, s]) => railToWorld(rails, line, f, s));
  if (corners.some((c) => !c)) return null;
  return corners.map((c) => new THREE.Vector3(c![0], c![1] + y, c![2]));
}

/** Quads as one mesh: two triangles each, a color each. */
function quadMesh(quads: THREE.Vector3[][], colors: THREE.Color[], material: THREE.Material): THREE.Mesh {
  const positions = new Float32Array(quads.length * 12), rgb = new Float32Array(quads.length * 12), index: number[] = [];
  quads.forEach((q, i) => {
    q.forEach((v, j) => { positions.set([v.x, v.y, v.z], i * 12 + j * 3); rgb.set([colors[i].r, colors[i].g, colors[i].b], i * 12 + j * 3); });
    index.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setAttribute("color", new THREE.BufferAttribute(rgb, 3));
  g.setIndex(index);
  return new THREE.Mesh(g, material);
}

const KIND_COLORS: Record<string, number> = { npc: 0x3ac7e0, proxy: 0xf0c330, building: 0x50d070, trigger: 0xf08a30, warp: 0xd040d0, level: 0x888888, rail: 0x7fe0ff, camera: 0xb070ff, instance: 0xb050ff, ambient: 0x60e0a0 };

/** A prop model's scene, read once and cloned for each placement. */
const propModels = new Map<string, Promise<THREE.Object3D | null>>();
const propLoader = new GLTFLoader();
function propModel(folder: string): Promise<THREE.Object3D | null> {
  if (!propModels.has(folder)) {
    propModels.set(folder, propLoader.loadAsync(`/${folder}/model.glb`).then((gltf) => {
      gltf.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) { (m as THREE.MeshStandardMaterial).alphaTest = 0.5; m.side = THREE.DoubleSide; }
      });
      return gltf.scene;
    }, () => null));
  }
  return propModels.get(folder)!;
}

/** A loader that draws a chunk with the zone's texture set in its season: each texture the set has (by its file's
 * name) from there, the others as the model names them. */
export function chunkLoader(map: ZoneMap): GLTFLoader {
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    const m = /\/textures\/[^/]+\/([^/]+\.png)$/.exec(url);
    return m && map.textureSet && map.textures.has(m[1]) ? url.slice(0, m.index) + `/textures/${map.textureSet}/${m[1]}` : url;
  });
  return new GLTFLoader(manager);
}
const textures = new Map<string, Promise<THREE.Texture | null>>();
/** The textures already read, for the preview's frames, which change every few frames. */
const readyTextures = new Map<string, THREE.Texture | null>();

/** A model's frame facing a direction (step 1 or 2 mid-walk) as a texture. */
function spriteTexture(model: string, direction?: string, step = 0): Promise<THREE.Texture | null> {
  const key = `${model}:${direction}:${step}`;
  if (!textures.has(key)) {
    textures.set(key, spriteFrame(model, direction, step).then((canvas) => {
      if (!canvas) {
        readyTextures.set(key, null);
        return null;
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.colorSpace = THREE.SRGBColorSpace;
      readyTextures.set(key, texture);
      return texture;
    }));
  }
  return textures.get(key)!;
}

function tileColor(type: number, mode: OverlayMode): THREE.Color {
  const flags = tileFlags(type);
  if (mode === "walk") return new THREE.Color(flags & TILE_FLAG_COLLISION ? 0xe04040 : 0x40c060);
  if (flags & TILE_FLAG_COLLISION) return new THREE.Color(0xe04040);
  if (flags & TILE_FLAG_WATER) return new THREE.Color(0x3a7ae0);
  if (flags & TILE_FLAG_ENCOUNT) return new THREE.Color(0x9ad040);
  return new THREE.Color(0xd8d8d8);
}

/** How far the tiles are drawn nearer the camera than they are, in units (liftOverlay). */
const TILE_LIFT = 6;

const same = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((v, i) => v === b[i]);

class MapScene {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  perspective: THREE.PerspectiveCamera;
  /** The overhead view's camera, and the height of the map it shows at zoom 1, in units. */
  ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 20000);
  orthoHeight = 1024;
  overhead = false;
  /** Where the perspective view looked when the overhead one took over. */
  perspectiveTarget = new THREE.Vector3();
  controls: OrbitControls;
  chunks = new THREE.Group();
  overlay = new THREE.Group();
  marks = new THREE.Group();
  raycaster = new THREE.Raycaster();
  /** The tiles under the pointer: each overlay mesh's instances as global tiles. */
  tileMeshes: { mesh: THREE.InstancedMesh; drawn: THREE.InstancedMesh; tiles: { x: number; z: number; h: number }[] }[] = [];
  /** The rails' tiles: a mesh a line, two triangles a tile. */
  railMeshes: { mesh: THREE.Mesh; tiles: RailPick[] }[] = [];
  paintedRail = new Map<string, RailPick>();
  entityMeshes: { object: THREE.Object3D; entity: Entity }[] = [];
  props: MapViewProps;
  dragging: Entity | null = null;
  /** The selected rectangle's handles, and the rectangle being moved, resized or drawn. */
  handles: { object: THREE.Object3D; handle: Handle }[] = [];
  rectEdit: { entity: Entity; mode: "move" | "resize" | "draw"; handle?: Handle; grab?: { x: number; z: number };
              rect: TileRect; next: TileRect } | null = null;
  rectPreview: THREE.Line | null = null;
  paintingNow = false;
  painted = new Map<string, { x: number; z: number }>();
  frame = 0;
  /** The NPCs' sprites, and the preview's movers and time. */
  npcSprites = new Map<Entity, THREE.Sprite>();
  /** The ambients' sprites, and the preview's ambient movers. */
  ambientSprites = new Map<Entity, THREE.Sprite>();
  ambientMovers: { entity: Entity; mover: AmbientMover }[] = [];
  world: World | null = null;
  previewTime = 0;
  lastFrame = 0;
  overlayKey: unknown[] = [];
  marksKey: unknown[] = [];
  loadedZone: string | null = null;
  /** The zone and season whose models are loaded. */
  loadedKey: string | null = null;
  loadedModels = false;

  constructor(private host: HTMLDivElement, props: MapViewProps) {
    this.props = props;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);
    this.camera = this.perspective = new THREE.PerspectiveCamera(45, 1, 1, 20000);
    this.controls = this.makeControls(new THREE.Vector3());
    this.scene.background = new THREE.Color(0x1e2129);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(300, 800, 400);
    this.scene.add(sun, this.chunks, this.overlay, this.marks);
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
      this.liftOverlay();
      this.stepPreview();
      this.render();
    };
    loop();
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    window.removeEventListener("pointerup", this.up);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  /** The game's camera, for a camera preview: 4:3, as the DS's screen. */
  gameCamera = new THREE.PerspectiveCamera(40, 4 / 3, 1, 4096);

  /** The view through the editor's camera, or through the game's in the DS's 4:3 frame. */
  render() {
    const view = this.props.viewCamera;
    const size = this.renderer.getSize(new THREE.Vector2());
    // A preview shows the map as the game draws it, without the editor's tiles and marks
    this.overlay.visible = this.marks.visible = !view;
    if (!view) {
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, size.x, size.y);
      this.renderer.render(this.scene, this.camera);
      return;
    }
    const h = Math.min(size.y, (size.x * 3) / 4), w = (h * 4) / 3;
    const x = (size.x - w) / 2, y = (size.y - h) / 2;
    this.renderer.setScissorTest(false);
    this.renderer.setClearColor(0x000000);
    this.renderer.clear();
    this.renderer.setScissorTest(true);
    this.renderer.setScissor(x, y, w, h);
    this.renderer.setViewport(x, y, w, h);
    this.gameCamera.fov = view.fov;
    this.gameCamera.position.set(...view.eye);
    this.gameCamera.up.set(0, 1, 0);
    this.gameCamera.lookAt(...view.target);
    this.gameCamera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.gameCamera);
    this.renderer.setScissorTest(false);
  }

  /** The camera's controls, about a target: the left button is the editor's (selecting, dragging and painting); the
   * middle orbits (pans, overhead), the right pans and the wheel zooms toward the cursor. */
  makeControls(target: THREE.Vector3): OrbitControls {
    const controls = new OrbitControls(this.camera, this.renderer.domElement);
    controls.enableDamping = true;
    controls.screenSpacePanning = true;
    controls.zoomToCursor = true;
    controls.enableRotate = !this.overhead;
    controls.mouseButtons = { LEFT: null, MIDDLE: this.overhead ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };
    controls.target.copy(target);
    controls.update();
    return controls;
  }

  /** Moves the tiles toward the camera along its lines of sight, by TILE_LIFT units at the point it looks at: they
   * stay exactly where they were on screen, but nearer, so what lies a little above the ground (autumn's fallen leaves)
   * doesn't hide them, whatever the GPU's depth precision, while walls and trees still do. */
  liftOverlay() {
    if (this.camera === this.ortho) {
      this.overlay.scale.setScalar(1);
      this.overlay.position.copy(this.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(-TILE_LIFT));
      return;
    }
    const eye = this.camera.position;
    const distance = Math.max(eye.distanceTo(this.controls.target), TILE_LIFT * 4);
    const scale = 1 - TILE_LIFT / distance;
    this.overlay.scale.setScalar(scale);
    this.overlay.position.copy(eye).multiplyScalar(1 - scale);
  }

  /** Switches between the perspective view and the overhead one, over the same spot. */
  setOverhead(on: boolean) {
    if (on === this.overhead) return;
    const target = this.controls.target.clone();
    this.controls.dispose();
    this.overhead = on;
    if (on) {
      this.perspectiveTarget.copy(target);
      const distance = this.perspective.position.distanceTo(target);
      this.orthoHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(this.perspective.fov / 2));
      this.ortho.zoom = 1;
      this.placeOrtho(target);
      this.camera = this.ortho;
    } else {
      // Back over where the overhead view was panned to
      this.perspective.position.add(target.clone().sub(this.perspectiveTarget));
      this.camera = this.perspective;
    }
    this.resize();
    this.controls = this.makeControls(target);
  }

  placeOrtho(target: THREE.Vector3) {
    this.ortho.position.set(target.x, target.y + 4000, target.z);
    this.ortho.up.set(0, 0, -1);
    this.ortho.lookAt(target);
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.host;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.perspective.aspect = w / h;
    this.perspective.updateProjectionMatrix();
    const half = this.orthoHeight / 2;
    Object.assign(this.ortho, { left: -half * (w / h), right: half * (w / h), top: half, bottom: -half });
    this.ortho.updateProjectionMatrix();
  }

  update(props: MapViewProps) {
    // A new zone loads its models and frames the camera; an edit of the same zone's terrain keeps both
    const zoneChanged = props.map.zone !== this.loadedZone;
    const seasonChanged = `${props.map.zone}:${props.map.season}` !== this.loadedKey;
    const modelsChanged = props.showModels !== this.loadedModels;
    this.props = props;
    this.setOverhead(props.overhead);
    if (seasonChanged || modelsChanged) this.loadChunks(zoneChanged);
    // Only what changed: the overlay with the terrain or its look, the marks with the entities or the selection
    const overlayKey = [props.map, props.layer, props.overlay, props.rails, props.railLevel, props.ground];
    if (!same(overlayKey, this.overlayKey)) this.buildOverlay();
    const marksKey = [props.map, props.entities, props.selected, props.layer, props.showModels, props.rails, props.railLevel, props.cameraAreas];
    if (!same(marksKey, this.marksKey)) this.buildMarks();
    this.overlayKey = overlayKey;
    this.marksKey = marksKey;
    // The preview starts from the NPCs' tiles, again whenever they change
    if (!props.preview) {
      if (this.world) this.buildMarks();
      this.world = null;
    } else if (!this.world || this.previewEntities !== props.entities) this.startPreview();
  }

  /** Each chunk's GLB at its cell: x east, z south, the cell's center its origin. */
  loadChunks(frame: boolean) {
    const { map, showModels } = this.props;
    this.loadedZone = map.zone;
    const key = (this.loadedKey = `${map.zone}:${map.season}`);
    this.loadedModels = showModels;
    this.chunks.clear();
    if (showModels) {
      const loader = chunkLoader(map);
      for (const chunk of map.chunks) {
        loader.load(`/${chunk.folder}/model.glb`, (gltf) => {
          if (this.loadedKey !== key || !this.loadedModels) return;
          gltf.scene.position.set(chunk.column * map.chunkSize + map.chunkSize / 2, 0, chunk.row * map.chunkSize + map.chunkSize / 2);
          gltf.scene.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (mesh.isMesh) {
              const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
              mats.forEach((m) => { (m as THREE.MeshStandardMaterial).alphaTest = 0.5; m.side = THREE.DoubleSide; });
            }
          });
          this.chunks.add(gltf.scene);
        }, undefined, () => {});
      }
    }
    if (frame && map.chunks.length) {
      const xs = map.chunks.map((c) => c.column), zs = map.chunks.map((c) => c.row);
      const size = map.chunkSize;
      const cx = ((Math.min(...xs) + Math.max(...xs) + 1) / 2) * size, cz = ((Math.min(...zs) + Math.max(...zs) + 1) / 2) * size;
      const span = Math.max(Math.max(...xs) - Math.min(...xs) + 1, Math.max(...zs) - Math.min(...zs) + 1) * size;
      this.controls.target.set(cx, 0, cz);
      this.perspective.position.set(cx, span * 0.9, cz + span * 0.6);
      this.orthoHeight = span * 1.1;
      this.ortho.zoom = 1;
      this.placeOrtho(this.controls.target);
      this.resize();
      this.controls.update();
    }
  }

  buildOverlay() {
    const { map, layer, overlay } = this.props;
    this.overlay.clear();
    this.tileMeshes = [];
    const plane = new THREE.PlaneGeometry(TILE - 1.5, TILE - 1.5).rotateX(-Math.PI / 2);
    const pickPlane = new THREE.PlaneGeometry(TILE, TILE).rotateX(-Math.PI / 2);
    const pickMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true, opacity: 0 });
    for (const chunk of map.chunks) {
      const l = chunk.layers[Math.min(layer, chunk.layers.length - 1)];
      if (!l || (this.props.rails && this.props.ground === "rails")) continue;
      // With a small depth bias too, beside liftOverlay
      const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: overlay === "off" ? 0 : 0.45, depthWrite: false,
                                                     polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -24 });
      const mesh = new THREE.InstancedMesh(plane, material, l.tiles.length);
      const tiles: { x: number; z: number; h: number }[] = [];
      const m = new THREE.Matrix4();
      l.tiles.forEach((t, i) => {
        const gx = chunk.column * map.chunkTiles + t.x, gz = chunk.row * map.chunkTiles + t.z;
        m.makeTranslation(gx * TILE + TILE / 2, l.heights[i] + 0.6, gz * TILE + TILE / 2);
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, tileColor(t.tileType, overlay));
        tiles.push({ x: gx, z: gz, h: l.heights[i] });
      });
      mesh.renderOrder = 1;
      this.overlay.add(mesh);
      // Picking uses whole tiles, without the gaps that the drawn ones leave between them
      const pickMesh = new THREE.InstancedMesh(pickPlane, pickMaterial, l.tiles.length);
      for (let i = 0; i < l.tiles.length; i++) {
        mesh.getMatrixAt(i, m);
        pickMesh.setMatrixAt(i, m);
      }
      this.overlay.add(pickMesh);
      this.tileMeshes.push({ mesh: pickMesh, drawn: mesh, tiles });
    }
    this.buildRails();
  }

  /** The rails' tiles, each line's around its places, colored by their attributes. */
  buildRails() {
    const { rails, overlay } = this.props;
    this.railMeshes = [];
    if (!rails || this.props.ground === "grid") return;
    const material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: overlay === "off" ? 0 : 0.45, depthWrite: false,
                                                   side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -24 });
    const inset = 0.06;
    rails.lines.forEach((line, i) => {
      if (!lineAtLevel(rails, i, this.props.railLevel)) return;
      const quads: THREE.Vector3[][] = [], colors: THREE.Color[] = [], tiles: RailPick[] = [];
      for (let f = 0; f < line.length; f++) {
        for (const side of sidesAt(rails, i, f)) {
          const q = railQuad(rails, i, f - 0.5 + inset, f + 0.5 - inset, side - 0.5 + inset, side + 0.5 - inset, 0.6);
          const pos = railToWorld(rails, i, f, side);
          if (!q || !pos) continue;
          quads.push(q);
          const type = railTile(rails, { line: i, front: f, side });
          colors.push(type === null ? new THREE.Color(0x777777) : tileColor(type, overlay === "off" ? "type" : overlay));
          tiles.push({ line: i, front: f, side, pos });
        }
      }
      if (!quads.length) return;
      const mesh = quadMesh(quads, colors, material);
      mesh.renderOrder = 1;
      this.overlay.add(mesh);
      this.railMeshes.push({ mesh, tiles });
    });
  }

  /** Colors a rail tile as the stroke passes it. */
  markPaintedRail(tile: RailPick) {
    const { paintType, overlay } = this.props;
    const color = paintType === null ? new THREE.Color(0xffd400) : tileColor(paintType, overlay === "off" ? "type" : overlay);
    for (const { mesh, tiles } of this.railMeshes) {
      const i = tiles.findIndex((t) => t.line === tile.line && t.front === tile.front && t.side === tile.side);
      if (i < 0) continue;
      const attr = mesh.geometry.getAttribute("color") as THREE.BufferAttribute;
      for (let j = 0; j < 4; j++) attr.setXYZ(i * 4 + j, color.r, color.g, color.b);
      attr.needsUpdate = true;
    }
  }

  previewEntities: Entity[] | null = null;

  startPreview() {
    this.previewEntities = this.props.entities;
    this.world = movers(this.props.map, this.props.entities, this.props.rails);
    this.ambientMovers = [];
    for (const e of this.props.entities) {
      if (e.kind !== "ambient" || !e.ambient) continue;
      const entry = { entity: e, mover: new AmbientMover(e.ambient, 0) };
      this.ambientMovers.push(entry);
      // (its sheet's frames choose its animation: a walking Pokémon's always plays)
      if (e.model) void spriteFrameCount(e.model).then((n) => { entry.mover.sheetFrames = n; });
    }
    this.previewTime = 0;
    this.lastFrame = performance.now();
  }

  /** The preview's frames since the last drawing, at 30 a second, and the sprites where the movers are. */
  stepPreview() {
    const now = performance.now();
    const elapsed = Math.min(0.25, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (!this.world) return;
    this.previewTime += elapsed;
    while (this.previewTime >= FRAME_SECONDS) {
      this.world.tick();
      for (const a of this.ambientMovers) a.mover.tick();
      this.previewTime -= FRAME_SECONDS;
    }
    for (const { entity, mover } of this.ambientMovers) {
      const sprite = this.ambientSprites.get(entity);
      if (!sprite || !entity.model) continue;
      const at = mover.place();
      sprite.position.set(at.x, at.y + 12, at.z);
      sprite.visible = !at.hidden && sprite.material.map !== null;
      const key = `${entity.model}:${at.dir}:${at.step}`;
      const texture = readyTextures.get(key);
      if (texture === undefined) spriteTexture(entity.model, at.dir, at.step);
      else if (texture && sprite.material.map !== texture) { sprite.material.map = texture; sprite.material.needsUpdate = true; }
    }
    const rails = this.props.rails;
    for (const m of this.world.railMovers) {
      const sprite = this.npcSprites.get(m.entity);
      if (!sprite || !m.entity.model || !rails) continue;
      const at = m.place();
      const pos = railToWorld(rails, m.line, at.front, at.side);
      if (pos) sprite.position.set(pos[0], pos[1] + 12, pos[2]);
      const key = `${m.entity.model}:${m.dir}:${at.frame}`;
      const texture = readyTextures.get(key);
      if (texture === undefined) spriteTexture(m.entity.model, m.dir, at.frame);
      else if (texture && sprite.material.map !== texture) { sprite.material.map = texture; sprite.material.needsUpdate = true; }
    }
    for (const m of this.world.movers) {
      const sprite = this.npcSprites.get(m.entity);
      if (!sprite || !m.entity.model) continue;
      const at = m.place();
      sprite.position.set((at.x + 0.5) * TILE, m.y + 12, (at.z + 0.5) * TILE);
      const key = `${m.entity.model}:${m.dir}:${at.frame}`;
      const texture = readyTextures.get(key);
      if (texture === undefined) spriteTexture(m.entity.model, m.dir, at.frame);
      else if (texture && sprite.material.map !== texture) { sprite.material.map = texture; sprite.material.needsUpdate = true; }
    }
  }

  buildMarks() {
    const { entities, selected, map, layer } = this.props;
    this.marks.clear();
    this.entityMeshes = [];
    this.npcSprites.clear();
    this.ambientSprites.clear();
    this.handles = [];
    this.rectPreview = null;
    if (selected && hasRect(selected, this.props.cameraAreas)) this.addHandles(selected);
    for (const e of entities) {
      const isSelected = selected?.kind === e.kind && selected.index === e.index;
      if (e.railPart) {
        this.addRailPart(e, isSelected);
        continue;
      }
      if (e.kind === "camera") {
        this.addCameraArea(e, isSelected);
        continue;
      }
      if (e.rail) {
        this.addRailEntity(e, isSelected);
        continue;
      }
      if (e.x === null || e.z === null) continue;
      const stands = standingOn(map, e.x, e.z, e.y);
      const ground = stands?.height ?? e.y;
      // On the other layer: faded, still to be clicked
      // On the other layer, or a host (whose instances are what appears): faded, still to be clicked
      const fade = (stands !== null && stands.layer !== Math.min(layer, this.layersAt(e.x, e.z) - 1)) || e.host ? 0.35 : 1;
      const color = KIND_COLORS[e.kind];
      if (e.building) {
        this.addBuilding(e, isSelected);
        continue;
      }
      // Its tiles: a box the size of its area
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(e.width * TILE - 1, isSelected ? 4 : 2, e.depth * TILE - 1),
        new THREE.MeshBasicMaterial({ color: isSelected ? 0xffffff : color, transparent: true, opacity: (isSelected ? 0.85 : e.kind === "instance" ? 0.35 : 0.6) * fade, depthTest: false }),
      );
      box.position.set((e.x + e.width / 2) * TILE, ground + 1.5, (e.z + e.depth / 2) * TILE);
      box.renderOrder = 3;
      this.marks.add(box);
      this.entityMeshes.push({ object: box, entity: e });
      if (e.kind === "ambient") {
        // Its sprite at its own height (in the world, not over the ground), on a line down to its tile
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffffff, transparent: true, opacity: fade, alphaTest: 0.5 * fade, depthTest: false }));
        sprite.renderOrder = 5;
        sprite.scale.set(24, 24, 1);
        sprite.visible = false;
        const [ox, oy, oz] = e.ambient ? ambientOrigin(e.ambient) : [(e.x + 0.5) * TILE, e.y, (e.z + 0.5) * TILE];
        sprite.position.set(ox, oy + 12, oz);
        if (e.model) spriteTexture(e.model, e.direction).then((t) => { if (t) { sprite.material.map = t; sprite.material.needsUpdate = true; sprite.visible = true; } });
        this.marks.add(sprite);
        this.entityMeshes.push({ object: sprite, entity: e });
        this.ambientSprites.set(e, sprite);
        // Its path round its place, at its height: brighter when it's chosen
        const outline = e.ambient ? pathOutline(e.ambient) : [];
        if (outline.length) {
          const path = new THREE.Line(new THREE.BufferGeometry().setFromPoints(outline.map(([dx, dz]) => new THREE.Vector3(ox + dx, oy + 1, oz + dz))),
            new THREE.LineBasicMaterial({ color: isSelected ? 0xffffff : color, transparent: true, opacity: (isSelected ? 1 : 0.55) * fade, depthTest: false }));
          path.renderOrder = 4;
          this.marks.add(path);
        }
        // Chosen, with a reaction: the tiles it reacts within, and its fixed heading with its spread either way
        const react = e.ambient?.react;
        if (isSelected && react) {
          const near = (react.near ?? 3) * TILE + TILE / 2;
          const flat = (points: [number, number][], c: number) => {
            const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(([x, z]) => new THREE.Vector3(x, ground + 2.5, z))),
              new THREE.LineDashedMaterial({ color: c, dashSize: 4, gapSize: 3, depthTest: false }));
            l.computeLineDistances();
            l.renderOrder = 4;
            this.marks.add(l);
          };
          const cx = (e.x + 0.5) * TILE, cz = (e.z + 0.5) * TILE;
          flat([[cx - near, cz - near], [cx + near, cz - near], [cx + near, cz + near], [cx - near, cz + near], [cx - near, cz - near]], 0xffd060);
          if (react.direction !== undefined && react.kind !== "hide") {
            const ray = (deg: number, length: number): [number, number][] =>
              [[ox, oz], [ox + Math.sin((deg * Math.PI) / 180) * length, oz - Math.cos((deg * Math.PI) / 180) * length]];
            flat(ray(react.direction, 4 * TILE), 0xffffff);
            const spread = react.spread ?? 20;
            if (spread) { flat(ray(react.direction - spread, 3 * TILE), 0xffd060); flat(ray(react.direction + spread, 3 * TILE), 0xffd060); }
          }
        }
        const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(ox, ground + 2, oz),
                                                            new THREE.Vector3(ox, oy, oz)]);
        const stem = new THREE.Line(g, new THREE.LineDashedMaterial({ color: isSelected ? 0xffffff : color, dashSize: 3, gapSize: 2, depthTest: false }));
        stem.computeLineDistances();
        stem.renderOrder = 4;
        this.marks.add(stem);
        continue;
      }
      if (e.kind === "npc" || e.kind === "instance") {
        // Over its tile's marks and the models, so an NPC behind a building still shows
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffffff, transparent: true, opacity: fade, alphaTest: 0.5 * fade, depthTest: false }));
        sprite.renderOrder = 5;
        sprite.scale.set(24, 24, 1);
        // Shown once its sprite loads: a sprite without a texture draws as a white square
        sprite.visible = false;
        sprite.position.set((e.x + 0.5) * TILE, ground + 12, (e.z + 0.5) * TILE);
        if (e.model) spriteTexture(e.model, e.direction).then((t) => { if (t) { sprite.material.map = t; sprite.material.needsUpdate = true; sprite.visible = true; } });
        this.marks.add(sprite);
        this.entityMeshes.push({ object: sprite, entity: e });
        this.npcSprites.set(e, sprite);
        // Its facing: a small arrow on its tile
        const [dx, dz] = directionStep(e.direction);
        const arrow = new THREE.ArrowHelper(new THREE.Vector3(dx, 0, dz), new THREE.Vector3((e.x + 0.5) * TILE, ground + 3, (e.z + 0.5) * TILE), 12, 0xffffff, 5, 4);
        this.marks.add(arrow);
        const line = (points: [number, number][], c: number) => {
          const g = new THREE.BufferGeometry().setFromPoints(points.map(([x, z]) => new THREE.Vector3(x * TILE, ground + 2.5, z * TILE)));
          const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: c, depthTest: false }));
          l.renderOrder = 4;
          this.marks.add(l);
        };
        if (e.leash && (e.leash.x || e.leash.z)) {
          const x0 = e.x - e.leash.x, x1 = e.x + 1 + e.leash.x, z0 = e.z - e.leash.z, z1 = e.z + 1 + e.leash.z;
          line([[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]], 0x40e0ff);
        }
        if (e.sight) {
          for (let i = 1; i <= e.sight; i++) {
            const t = new THREE.Mesh(new THREE.PlaneGeometry(TILE - 4, TILE - 4).rotateX(-Math.PI / 2),
              new THREE.MeshBasicMaterial({ color: 0xff5050, transparent: true, opacity: 0.35, depthTest: false }));
            t.position.set((e.x + 0.5 + dx * i) * TILE, ground + 2, (e.z + 0.5 + dz * i) * TILE);
            t.renderOrder = 2;
            this.marks.add(t);
          }
        }
      }
    }
  }

  /** A camera area: a rect's tiles with an arrow the way its camera blends, or a circle's ring between its angles. */
  addCameraArea(e: Entity, isSelected: boolean) {
    const area = this.props.cameraAreas?.[e.index];
    if (!area) return;
    const color = isSelected ? 0xffffff : KIND_COLORS.camera;
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: isSelected ? 0.35 : 0.22, depthTest: false, side: THREE.DoubleSide });
    const edge = new THREE.LineBasicMaterial({ color, depthTest: false });
    const group = new THREE.Group();
    group.renderOrder = 2;
    if (area.rect) {
      const r = area.rect;
      const alongX = r.width === 1;
      const w = (alongX ? r.height : r.width) * TILE, d = (alongX ? r.unk06 : r.height) * TILE;
      const x0 = r.x * TILE, z0 = r.z * TILE;
      const y = this.groundAt(r.x + Math.floor((alongX ? r.height : r.width) / 2), r.z + Math.floor((alongX ? r.unk06 : r.height) / 2)) + 3;
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), material);
      quad.position.set(x0 + w / 2, y, z0 + d / 2);
      group.add(quad);
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(
        [[x0, z0], [x0 + w, z0], [x0 + w, z0 + d], [x0, z0 + d], [x0, z0]].map(([x, z]) => new THREE.Vector3(x, y, z))), edge));
      // The first row's edge green and the last's orange
      const side = (a: [number, number], b: [number, number], c: number) => group.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a[0], y + 0.5, a[1]), new THREE.Vector3(b[0], y + 0.5, b[1])]),
        new THREE.LineBasicMaterial({ color: c, depthTest: false })));
      if (alongX) { side([x0 + 1, z0], [x0 + 1, z0 + d], 0x40e070); side([x0 + w - 1, z0], [x0 + w - 1, z0 + d], 0xffa030); }
      else { side([x0, z0 + 1], [x0 + w, z0 + 1], 0x40e070); side([x0, z0 + d - 1], [x0 + w, z0 + d - 1], 0xffa030); }
      const from = new THREE.Vector3(x0 + w / 2, y, z0 + d / 2).add(alongX ? new THREE.Vector3(-w / 2 + 6, 0, 0) : new THREE.Vector3(0, 0, -d / 2 + 6));
      const length = (alongX ? w : d) - 12;
      if (length > 4) group.add(new THREE.ArrowHelper(alongX ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1), from, length, color, 8, 6));
    } else if (area.circle) {
      const c = area.circle;
      const center = c.center.map((v) => v / FX);
      const r0 = c.radius[0] / FX, r1 = c.radius[1] / FX;
      let a0 = turnAngle(c.angle[0]), a1 = turnAngle(c.angle[1]);
      if (a1 <= a0) a1 += Math.PI * 2;
      // The game's angle is atan2(dx, dz): from +z toward +x
      const points: THREE.Vector3[] = [];
      const steps = 48;
      for (let i = 0; i <= steps; i++) { const a = a0 + ((a1 - a0) * i) / steps; points.push(new THREE.Vector3(center[0] + Math.sin(a) * r1, center[1] + 3, center[2] + Math.cos(a) * r1)); }
      for (let i = steps; i >= 0; i--) { const a = a0 + ((a1 - a0) * i) / steps; points.push(new THREE.Vector3(center[0] + Math.sin(a) * r0, center[1] + 3, center[2] + Math.cos(a) * r0)); }
      points.push(points[0].clone());
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), edge));
      const ball = new THREE.Mesh(new THREE.SphereGeometry(4, 10, 6), material);
      ball.position.set(center[0], center[1] + 3, center[2]);
      group.add(ball);
    }
    group.traverse((o) => { o.renderOrder = 2; });
    this.marks.add(group);
    this.entityMeshes.push({ object: group, entity: e });
  }

  /** The selected rectangle's handles: a ball at each corner and a bar on each side. */
  addHandles(e: Entity) {
    const x0 = e.x! * TILE, z0 = e.z! * TILE, x1 = (e.x! + e.width) * TILE, z1 = (e.z! + e.depth) * TILE;
    const y = this.groundAt(e.x!, e.z!) + 4;
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false });
    const add = (object: THREE.Mesh, x: number, z: number, handle: Handle) => {
      object.position.set(x, y, z);
      object.renderOrder = 7;
      this.marks.add(object);
      this.handles.push({ object, handle });
    };
    for (const [x, z, handle] of [[x0, z0, { w: true, n: true }], [x1, z0, { e: true, n: true }], [x1, z1, { e: true, s: true }],
                                  [x0, z1, { w: true, s: true }]] as [number, number, Handle][]) add(new THREE.Mesh(new THREE.SphereGeometry(3.5, 10, 6), material), x, z, handle);
    const bar = (w: number, d: number) => new THREE.Mesh(new THREE.BoxGeometry(w, 2, d), material);
    add(bar(Math.max(4, x1 - x0 - 12), 3), (x0 + x1) / 2, z0, { n: true });
    add(bar(Math.max(4, x1 - x0 - 12), 3), (x0 + x1) / 2, z1, { s: true });
    add(bar(3, Math.max(4, z1 - z0 - 12)), x0, (z0 + z1) / 2, { w: true });
    add(bar(3, Math.max(4, z1 - z0 - 12)), x1, (z0 + z1) / 2, { e: true });
  }

  /** The rectangle being moved, resized or drawn, outlined where it would go. */
  showRect(r: TileRect) {
    if (this.rectPreview) this.marks.remove(this.rectPreview);
    const y = this.groundAt(r.x, r.z) + 5;
    const x0 = r.x * TILE, z0 = r.z * TILE, x1 = (r.x + r.width) * TILE, z1 = (r.z + r.depth) * TILE;
    this.rectPreview = new THREE.Line(new THREE.BufferGeometry().setFromPoints(
      [[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]].map(([x, z]) => new THREE.Vector3(x, y, z))),
      new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false }));
    this.rectPreview.renderOrder = 8;
    this.marks.add(this.rectPreview);
  }

  /** The height of the ground at a tile, on the layer shown. */
  groundAt(x: number, z: number): number {
    for (const { tiles } of this.tileMeshes) {
      const t = tiles.find((t) => t.x === x && t.z === z);
      if (t) return t.h;
    }
    return 0;
  }

  /** A rail's point (a ball at its spot) or line (a tube along its middle). */
  addRailPart(e: Entity, isSelected: boolean) {
    const rails = this.props.rails;
    const part = e.railPart!;
    if (!rails) return;
    const material = new THREE.MeshBasicMaterial({ color: isSelected ? 0xffffff : KIND_COLORS.rail, transparent: true, opacity: 0.9, depthTest: false });
    if (part.type === "point") {
      const p = rails.points[part.index];
      if (!p) return;
      const ball = new THREE.Mesh(new THREE.SphereGeometry(isSelected ? 4 : 3, 12, 8), material);
      ball.position.set(p.pos[0] / 4096, p.pos[1] / 4096 + 2, p.pos[2] / 4096);
      ball.renderOrder = 6;
      this.marks.add(ball);
      this.entityMeshes.push({ object: ball, entity: e });
      return;
    }
    const line = rails.lines[part.index];
    if (!line?.length || !lineAtLevel(rails, part.index, this.props.railLevel)) return;
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 32; i++) {
      const p = railToWorld(rails, part.index, (line.length * i) / 32, 0);
      if (p) points.push(new THREE.Vector3(p[0], p[1] + 2, p[2]));
    }
    if (points.length < 2) return;
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 64, isSelected ? 1.6 : 1, 6, false), material);
    tube.renderOrder = 5;
    this.marks.add(tube);
    this.entityMeshes.push({ object: tube, entity: e });
  }

  /** An entity on the rails: its tiles (its spans' for a warp or a trigger) and an NPC's sprite. */
  addRailEntity(e: Entity, isSelected: boolean) {
    const rails = this.props.rails;
    const r = e.rail!;
    const center = rails ? railToWorld(rails, r.line, r.front, r.side) : null;
    if (!rails || !center || !lineAtLevel(rails, r.line, this.props.railLevel)) return;
    const quads: THREE.Vector3[][] = [];
    for (let f = r.front; f < r.front + r.frontSpan; f++) {
      const q = railQuad(rails, r.line, f - 0.5, f + 0.5, r.side - 0.5, r.side + r.sideSpan - 0.5, 1.5);
      if (q) quads.push(q);
    }
    const color = new THREE.Color(isSelected ? 0xffffff : KIND_COLORS[e.kind]);
    const box = quadMesh(quads, quads.map(() => color),
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: isSelected ? 0.85 : 0.6, depthTest: false, side: THREE.DoubleSide }));
    box.renderOrder = 3;
    box.userData.center = new THREE.Vector3(...center);
    box.userData.base = box.position.clone();
    this.marks.add(box);
    this.entityMeshes.push({ object: box, entity: e });
    if (e.kind !== "npc" && e.kind !== "instance") return;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffffff, transparent: true, alphaTest: 0.5, depthTest: false }));
    sprite.renderOrder = 5;
    sprite.scale.set(24, 24, 1);
    sprite.visible = false;
    sprite.position.set(center[0], center[1] + 12, center[2]);
    sprite.userData.center = new THREE.Vector3(...center);
    sprite.userData.base = sprite.position.clone();
    if (e.model) spriteTexture(e.model, e.direction).then((t) => { if (t) { sprite.material.map = t; sprite.material.needsUpdate = true; sprite.visible = true; } });
    this.marks.add(sprite);
    this.entityMeshes.push({ object: sprite, entity: e });
    this.npcSprites.set(e, sprite);
  }

  /** A building: its prop's model where the chunk places it, turned, and a square at its origin. */
  addBuilding(e: Entity, isSelected: boolean) {
    const b = e.building!;
    const base = new THREE.Mesh(new THREE.BoxGeometry(TILE - 2, isSelected ? 4 : 2, TILE - 2),
      new THREE.MeshBasicMaterial({ color: isSelected ? 0xffffff : KIND_COLORS.building, transparent: true, opacity: isSelected ? 0.85 : 0.6, depthTest: false }));
    base.position.set(b.ux, b.uy + 1.5, b.uz);
    base.renderOrder = 3;
    base.userData.base = base.position.clone();
    this.marks.add(base);
    this.entityMeshes.push({ object: base, entity: e });
    if (!b.model || !this.props.showModels) return;
    const holder = new THREE.Group();
    holder.position.set(b.ux, b.uy, b.uz);
    holder.rotation.y = (b.angle * Math.PI) / 180;
    holder.userData.base = holder.position.clone();
    this.marks.add(holder);
    this.entityMeshes.push({ object: holder, entity: e });
    const marks = this.marks;
    propModel(b.model).then((scene) => {
      if (!scene || holder.parent !== marks) return;
      // The props are skinned meshes: their copies need their own bones
      const copy = cloneSkinned(scene);
      // Chosen: half seen through, so the tiles under it show while it moves
      if (isSelected) copy.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const half = (x: THREE.Material) => { const c = x.clone(); c.transparent = true; c.opacity = 0.5; c.depthWrite = false; return c; };
        m.material = Array.isArray(m.material) ? m.material.map(half) : half(m.material);
      });
      holder.add(copy);
      // Its footprint: the tiles under the model, outlined on the ground
      const box = new THREE.Box3().setFromObject(holder);
      if (box.isEmpty()) return;
      const x0 = Math.floor(box.min.x / TILE + 0.01), x1 = Math.ceil(box.max.x / TILE - 0.01);
      const z0 = Math.floor(box.min.z / TILE + 0.01), z1 = Math.ceil(box.max.z / TILE - 0.01);
      const y = b.uy + 2.5;
      const outline = new THREE.Line(new THREE.BufferGeometry().setFromPoints(
        [[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]].map(([x, z]) => new THREE.Vector3(x * TILE, y, z * TILE))),
        new THREE.LineBasicMaterial({ color: isSelected ? 0xffffff : KIND_COLORS.building, depthTest: false }));
      outline.renderOrder = 4;
      holder.userData.outline = outline;
      outline.userData.base = outline.position.clone();
      marks.add(outline);
      this.entityMeshes.push({ object: outline, entity: e });
    });
  }

  /** How many layers the chunk under a tile has. */
  layersAt(x: number, z: number): number {
    const n = this.props.map.chunkTiles;
    const chunk = this.props.map.chunks.find((c) => c.column === Math.floor(x / n) && c.row === Math.floor(z / n));
    return Math.max(1, chunk?.layers.length ?? 1);
  }

  /** Colors a tile as the stroke passes it, before the edit is made. */
  markPainted(tile: { x: number; z: number }) {
    const { paintType, overlay } = this.props;
    const color = paintType === null ? new THREE.Color(0xffd400) : tileColor(paintType, overlay === "off" ? "type" : overlay);
    for (const { drawn, tiles } of this.tileMeshes) {
      const i = tiles.findIndex((t) => t.x === tile.x && t.z === tile.z);
      if (i < 0) continue;
      drawn.setColorAt(i, color);
      drawn.instanceColor!.needsUpdate = true;
      (drawn.material as THREE.MeshBasicMaterial).opacity = Math.max((drawn.material as THREE.MeshBasicMaterial).opacity, 0.45);
    }
  }

  /** Aims the raycaster from the camera through the pointer. */
  aim(ev: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(pointer, this.camera);
  }

  pick(ev: PointerEvent): { tile: { x: number; z: number; h: number } | null; entity: Entity | null; rail: RailPick | null } {
    this.aim(ev);
    // A building's model is a group of meshes: a hit on any of them is the building's
    // Every entity under the pointer, nearest first; a building's model is a group of meshes, a hit on any its own
    const owner = (object: THREE.Object3D | null): Entity | null => {
      for (let o = object; o; o = o.parent) {
        const found = this.entityMeshes.find((m) => m.object === o)?.entity;
        if (found) return found;
      }
      return null;
    };
    const under: Entity[] = [];
    for (const hit of this.raycaster.intersectObjects(this.entityMeshes.map((m) => m.object), true)) {
      const e = owner(hit.object);
      if (e && !under.includes(e)) under.push(e);
    }
    // An instance over its host is the one meant (the host's own fields are unused), and a host comes last
    const rank = (e: Entity) => (e.kind === "instance" ? 0 : e.host ? 2 : 1);
    const nearest = under[0];
    const sameTile = under.filter((e) => nearest && e.x === nearest.x && e.z === nearest.z);
    const entity: Entity | null = sameTile.sort((a, b) => rank(a) - rank(b))[0] ?? nearest ?? null;
    let tile: { x: number; z: number; h: number } | null = null;
    let tileDistance = Infinity;
    for (const { mesh, tiles } of this.tileMeshes) {
      const hit = this.raycaster.intersectObject(mesh, false)[0];
      if (hit && hit.instanceId !== undefined) { tile = tiles[hit.instanceId]; tileDistance = hit.distance; break; }
    }
    // A rail's tile, when it is nearer than the grid's (the rails run over the chunks' own terrain)
    let rail: RailPick | null = null;
    let railDistance = Infinity;
    for (const { mesh, tiles } of this.railMeshes) {
      const hit = this.raycaster.intersectObject(mesh, false)[0];
      if (hit && hit.faceIndex !== undefined && hit.faceIndex !== null && hit.distance < railDistance) {
        rail = tiles[Math.floor(hit.faceIndex / 2)] ?? null;
        railDistance = hit.distance;
      }
    }
    if (rail && railDistance <= tileDistance + 1) tile = null;
    else rail = null;
    return { tile, entity, rail };
  }

  down = (ev: PointerEvent) => {
    // A click on the map leaves the box typed in last, so the editor's keys (Ctrl+Z) are the map's again
    (document.activeElement as HTMLElement | null)?.blur?.();
    if (ev.button !== 0) return;
    // Shift+click is the editor's (adding), not the page's text selection
    if (ev.shiftKey) ev.preventDefault();
    const { tile, entity, rail } = this.pick(ev);
    // Drawing a rectangle: from the tile pressed to the tile let go on
    if (this.props.drawRect) {
      if (!tile) return;
      const rect = { x: tile.x, z: tile.z, width: 1, depth: 1 };
      this.rectEdit = { entity: this.props.drawRect, mode: "draw", grab: { x: tile.x, z: tile.z }, rect, next: rect };
      this.controls.enabled = false;
      this.showRect(rect);
      return;
    }
    // The selected rectangle's handles, then the rectangle itself
    const chosen = this.props.selected;
    if (chosen && hasRect(chosen, this.props.cameraAreas) && !this.props.painting && !ev.shiftKey) {
      const sel = chosen;
      const rect = { x: sel.x!, z: sel.z!, width: sel.width, depth: sel.depth };
      const handle = this.raycaster.intersectObjects(this.handles.map((h) => h.object), false)[0];
      if (handle) {
        this.rectEdit = { entity: sel, mode: "resize", handle: this.handles.find((h) => h.object === handle.object)!.handle, rect, next: rect };
        this.controls.enabled = false;
        return;
      }
      if (entity === sel && tile) {
        this.rectEdit = { entity: sel, mode: "move", grab: { x: tile.x, z: tile.z }, rect, next: rect };
        this.controls.enabled = false;
        return;
      }
    }
    if (this.props.painting && rail) {
      this.paintingNow = true;
      this.controls.enabled = false;
      this.painted = new Map();
      this.paintedRail = new Map([[`${rail.line}:${rail.front}:${rail.side}`, rail]]);
      this.markPaintedRail(rail);
      return;
    }
    if (ev.shiftKey && rail) {
      this.props.onAddRail(rail, rail.pos[1]);
      return;
    }
    if (this.props.painting && tile) {
      this.paintedRail = new Map();
      this.paintingNow = true;
      this.controls.enabled = false;
      this.painted = new Map([[`${tile.x},${tile.z}`, tile]]);
      this.markPainted(tile);
      return;
    }
    if (ev.shiftKey && tile) {
      this.props.onAdd(tile.x, tile.z, tile.h);
      return;
    }
    // On the selected entity's tile, the selected one (chosen from the panel's list of a tile's entities)
    const sel = this.props.selected;
    const onSelected = sel && entity && sel.x === entity.x && sel.z === entity.z ? sel : entity;
    this.props.onSelect(onSelected, tile);
    if (onSelected?.railPart && onSelected.railPart.type === "line") return;
    // A camera area moves by its rectangle once chosen (rectEdit), never as an event
    if (onSelected?.kind === "camera") return;
    if (onSelected && (onSelected.x !== null || onSelected.rail)) {
      this.dragging = onSelected;
      this.controls.enabled = false;
    }
  };

  move = (ev: PointerEvent) => {
    if (this.rectEdit) {
      const { tile } = this.pick(ev);
      if (!tile) return;
      const { mode, rect, handle, grab } = this.rectEdit;
      let next = rect;
      if (mode === "move") next = { ...rect, x: rect.x + tile.x - grab!.x, z: rect.z + tile.z - grab!.z };
      else if (mode === "draw") {
        next = { x: Math.min(grab!.x, tile.x), z: Math.min(grab!.z, tile.z), width: Math.abs(tile.x - grab!.x) + 1, depth: Math.abs(tile.z - grab!.z) + 1 };
      } else {
        let x0 = rect.x, z0 = rect.z, x1 = rect.x + rect.width - 1, z1 = rect.z + rect.depth - 1;
        if (handle!.w) x0 = Math.min(tile.x, x1);
        if (handle!.e) x1 = Math.max(tile.x, x0);
        if (handle!.n) z0 = Math.min(tile.z, z1);
        if (handle!.s) z1 = Math.max(tile.z, z0);
        next = { x: x0, z: z0, width: x1 - x0 + 1, depth: z1 - z0 + 1 };
      }
      this.rectEdit.next = next;
      this.showRect(next);
      return;
    }
    if (!this.dragging && !this.paintingNow) return;
    // A rail point moves on the level of its own height
    if (this.dragging?.railPart) {
      const p = this.props.rails?.points[this.dragging.railPart.index];
      if (!p) return;
      const y = p.pos[1] / 4096;
      this.aim(ev);
      const hit = new THREE.Vector3();
      if (!this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), hit)) return;
      for (const m of this.entityMeshes.filter((x) => x.entity === this.dragging)) m.object.position.set(hit.x, y + 2, hit.z);
      (this.dragging as Entity & { toSpot?: THREE.Vector3 }).toSpot = hit.clone();
      return;
    }
    const { tile, rail } = this.pick(ev);
    if (rail && this.paintingNow) {
      const key = `${rail.line}:${rail.front}:${rail.side}`;
      if (!this.paintedRail.has(key)) {
        this.paintedRail.set(key, rail);
        this.markPaintedRail(rail);
      }
      return;
    }
    // An entity on the rails moves along them: its marks by the distance between the places' spots
    if (this.dragging?.rail) {
      if (!rail) return;
      for (const m of this.entityMeshes.filter((x) => x.entity === this.dragging)) {
        const { base, center } = m.object.userData as { base?: THREE.Vector3; center?: THREE.Vector3 };
        if (base && center) m.object.position.set(base.x + rail.pos[0] - center.x, base.y + rail.pos[1] - center.y, base.z + rail.pos[2] - center.z);
      }
      (this.dragging as Entity & { toRail?: RailPick }).toRail = rail;
      return;
    }
    if (!tile) return;
    if (this.paintingNow) {
      const key = `${tile.x},${tile.z}`;
      if (!this.painted.has(key)) {
        this.painted.set(key, tile);
        this.markPainted(tile);
      }
      return;
    }
    const mark = this.entityMeshes.filter((m) => m.entity === this.dragging);
    for (const m of mark) {
      const e = m.entity;
      // A building moves by whole tiles from where it is, keeping its place in its tile
      if (e.building && m.object.userData.base) {
        const base = m.object.userData.base as THREE.Vector3;
        m.object.position.set(base.x + (tile.x - e.x!) * TILE, base.y, base.z + (tile.z - e.z!) * TILE);
        continue;
      }
      m.object.position.x = (tile.x + e.width / 2) * TILE;
      m.object.position.z = (tile.z + e.depth / 2) * TILE;
      m.object.position.y = tile.h + (m.object instanceof THREE.Sprite ? 12 : 1.5);
    }
    (this.dragging as Entity & { to?: typeof tile }).to = tile;
  };

  up = () => {
    if (this.rectEdit) {
      const { entity, rect, next, mode } = this.rectEdit;
      this.rectEdit = null;
      this.controls.enabled = true;
      if (mode === "draw" || next.x !== rect.x || next.z !== rect.z || next.width !== rect.width || next.depth !== rect.depth) this.props.onRect(entity, next);
      else if (this.rectPreview) { this.marks.remove(this.rectPreview); this.rectPreview = null; }
      return;
    }
    if (this.paintingNow) {
      this.paintingNow = false;
      this.controls.enabled = true;
      if (this.painted.size) this.props.onPaint([...this.painted.values()]);
      if (this.paintedRail.size) this.props.onPaintRail([...this.paintedRail.values()]);
      return;
    }
    if (!this.dragging) return;
    if (this.dragging.railPart) {
      const e = this.dragging as Entity & { toSpot?: THREE.Vector3 };
      const to = e.toSpot;
      delete e.toSpot;
      this.dragging = null;
      this.controls.enabled = true;
      if (to) this.props.onMoveRailPoint(e.railPart!.index, Math.round(to.x), Math.round(to.z));
      return;
    }
    if (this.dragging.rail) {
      const e = this.dragging as Entity & { toRail?: RailPick };
      const to = e.toRail;
      delete e.toRail;
      this.dragging = null;
      this.controls.enabled = true;
      const r = e.rail!;
      if (to && (to.line !== r.line || to.front !== r.front || to.side !== r.side)) this.props.onMoveRail(e, to);
      return;
    }
    const to = (this.dragging as Entity & { to?: { x: number; z: number; h: number } }).to;
    const e = this.dragging;
    this.dragging = null;
    this.controls.enabled = true;
    if (to && (to.x !== e.x || to.z !== e.z)) this.props.onMove(e, to.x, to.z, to.h);
  };
}

export function MapView(props: MapViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<MapScene | null>(null);
  useEffect(() => {
    scene.current = new MapScene(host.current!, props);
    return () => scene.current?.dispose();
    // The scene is made once; update() gives it new props
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { scene.current?.update(props); });
  return <div className="ow-map" ref={host} />;
}
