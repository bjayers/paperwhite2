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
import { directionStep, type Entity } from "./entities.ts";
import { spriteFrame } from "./sprites.ts";
import { CHUNK, CHUNK_TILES, TILE, TILE_FLAG_COLLISION, TILE_FLAG_ENCOUNT, TILE_FLAG_WATER, standingOn, tileFlags, type ZoneMap } from "./terrain.ts";

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
  onSelect(entity: Entity | null, tile: { x: number; z: number } | null): void;
  onMove(entity: Entity, x: number, z: number, height: number): void;
  onAdd(x: number, z: number, height: number): void;
  onPaint(tiles: { x: number; z: number }[]): void;
}

const KIND_COLORS: Record<string, number> = { npc: 0x3ac7e0, proxy: 0xf0c330, trigger: 0xf08a30, warp: 0xd040d0, level: 0x888888 };

const loader = new GLTFLoader();
const textures = new Map<string, Promise<THREE.Texture | null>>();

/** A model's frame facing a direction as a texture. */
function spriteTexture(model: string, direction?: string): Promise<THREE.Texture | null> {
  const key = `${model}:${direction}`;
  if (!textures.has(key)) {
    textures.set(key, spriteFrame(model, direction).then((canvas) => {
      if (!canvas) return null;
      const texture = new THREE.CanvasTexture(canvas);
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.colorSpace = THREE.SRGBColorSpace;
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

class MapScene {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  chunks = new THREE.Group();
  overlay = new THREE.Group();
  marks = new THREE.Group();
  raycaster = new THREE.Raycaster();
  /** The tiles under the pointer: each overlay mesh's instances as global tiles. */
  tileMeshes: { mesh: THREE.InstancedMesh; drawn: THREE.InstancedMesh; tiles: { x: number; z: number; h: number }[] }[] = [];
  entityMeshes: { object: THREE.Object3D; entity: Entity }[] = [];
  props: MapViewProps;
  dragging: Entity | null = null;
  paintingNow = false;
  painted = new Map<string, { x: number; z: number }>();
  frame = 0;
  loadedZone: string | null = null;
  loadedModels = false;

  constructor(private host: HTMLDivElement, props: MapViewProps) {
    this.props = props;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(45, 1, 1, 20000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.screenSpacePanning = true;
    // The left button is the editor's: selecting, dragging and painting
    this.controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };
    this.controls.zoomToCursor = true;
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
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    window.removeEventListener("pointerup", this.up);
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

  update(props: MapViewProps) {
    // A new zone loads its models and frames the camera; an edit of the same zone's terrain keeps both
    const zoneChanged = props.map.zone !== this.loadedZone;
    const modelsChanged = props.showModels !== this.loadedModels;
    this.props = props;
    if (zoneChanged || modelsChanged) this.loadChunks(zoneChanged);
    this.buildOverlay();
    this.buildMarks();
  }

  /** Each chunk's GLB at its cell: x east, z south, the cell's center its origin. */
  loadChunks(frame: boolean) {
    const { map, showModels } = this.props;
    this.loadedZone = map.zone;
    this.loadedModels = showModels;
    this.chunks.clear();
    if (showModels) {
      for (const chunk of map.chunks) {
        loader.load(`/${chunk.folder}/model.glb`, (gltf) => {
          if (this.loadedZone !== map.zone || !this.loadedModels) return;
          gltf.scene.position.set(chunk.column * CHUNK + CHUNK / 2, 0, chunk.row * CHUNK + CHUNK / 2);
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
      const cx = ((Math.min(...xs) + Math.max(...xs) + 1) / 2) * CHUNK, cz = ((Math.min(...zs) + Math.max(...zs) + 1) / 2) * CHUNK;
      const span = Math.max(Math.max(...xs) - Math.min(...xs) + 1, Math.max(...zs) - Math.min(...zs) + 1) * CHUNK;
      this.controls.target.set(cx, 0, cz);
      this.camera.position.set(cx, span * 0.9, cz + span * 0.6);
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
      if (!l) continue;
      const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: overlay === "off" ? 0 : 0.45, depthWrite: false });
      const mesh = new THREE.InstancedMesh(plane, material, l.tiles.length);
      const tiles: { x: number; z: number; h: number }[] = [];
      const m = new THREE.Matrix4();
      l.tiles.forEach((t, i) => {
        const gx = chunk.column * CHUNK_TILES + t.x, gz = chunk.row * CHUNK_TILES + t.z;
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
  }

  buildMarks() {
    const { entities, selected, map, layer } = this.props;
    this.marks.clear();
    this.entityMeshes = [];
    for (const e of entities) {
      if (e.x === null || e.z === null) continue;
      const isSelected = selected?.kind === e.kind && selected.index === e.index;
      const stands = standingOn(map, e.x, e.z, e.y);
      const ground = stands?.height ?? e.y;
      // On the other layer: faded, still to be clicked
      const fade = stands !== null && stands.layer !== Math.min(layer, this.layersAt(e.x, e.z) - 1) ? 0.35 : 1;
      const color = KIND_COLORS[e.kind];
      // Its tiles: a box the size of its area
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(e.width * TILE - 1, isSelected ? 4 : 2, e.depth * TILE - 1),
        new THREE.MeshBasicMaterial({ color: isSelected ? 0xffffff : color, transparent: true, opacity: (isSelected ? 0.85 : 0.6) * fade, depthTest: false }),
      );
      box.position.set((e.x + e.width / 2) * TILE, ground + 1.5, (e.z + e.depth / 2) * TILE);
      box.renderOrder = 3;
      this.marks.add(box);
      this.entityMeshes.push({ object: box, entity: e });
      if (e.kind === "npc") {
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

  /** How many layers the chunk under a tile has. */
  layersAt(x: number, z: number): number {
    const chunk = this.props.map.chunks.find((c) => c.column === Math.floor(x / CHUNK_TILES) && c.row === Math.floor(z / CHUNK_TILES));
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

  pick(ev: PointerEvent): { tile: { x: number; z: number; h: number } | null; entity: Entity | null } {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(pointer, this.camera);
    const hitEntity = this.raycaster.intersectObjects(this.entityMeshes.map((m) => m.object), false)[0];
    const entity = hitEntity ? this.entityMeshes.find((m) => m.object === hitEntity.object)?.entity ?? null : null;
    let tile: { x: number; z: number; h: number } | null = null;
    for (const { mesh, tiles } of this.tileMeshes) {
      const hit = this.raycaster.intersectObject(mesh, false)[0];
      if (hit && hit.instanceId !== undefined && (!tile || hit.distance < 0)) tile = tiles[hit.instanceId];
      if (tile) break;
    }
    return { tile, entity };
  }

  down = (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    const { tile, entity } = this.pick(ev);
    if (this.props.painting && tile) {
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
    if (onSelected && onSelected.x !== null) {
      this.dragging = onSelected;
      this.controls.enabled = false;
    }
  };

  move = (ev: PointerEvent) => {
    if (!this.dragging && !this.paintingNow) return;
    const { tile } = this.pick(ev);
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
      m.object.position.x = (tile.x + e.width / 2) * TILE;
      m.object.position.z = (tile.z + e.depth / 2) * TILE;
      m.object.position.y = tile.h + (m.object instanceof THREE.Sprite ? 12 : 1.5);
    }
    (this.dragging as Entity & { to?: typeof tile }).to = tile;
  };

  up = () => {
    if (this.paintingNow) {
      this.paintingNow = false;
      this.controls.enabled = true;
      this.props.onPaint([...this.painted.values()]);
      return;
    }
    if (!this.dragging) return;
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
