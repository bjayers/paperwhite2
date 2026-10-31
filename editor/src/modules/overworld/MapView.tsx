// The map view, shared by the Overworld Editor and the later Map Editor: a zone's map chunks in 3D (their GLBs, served
// with their texture PNGs from /res/), each placed at its matrix cell, the collision tiles laid over them at their
// heights (one layer at a time, for the two-layer chunks), and the entities on their tiles with their sprites,
// leashes, sight lines and areas. It reports clicks, drags and painting in global tiles; the editor changes the data.

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { api } from "../../api.ts";
import { parsePal } from "../palettes/pal.ts";
import { readIndexedPng } from "../palettes/png.ts";
import { actorFolder, directionStep, type Entity } from "./entities.ts";
import { CHUNK, CHUNK_TILES, TILE, TILE_FLAG_COLLISION, TILE_FLAG_ENCOUNT, TILE_FLAG_WATER, tileFlags, type ZoneMap } from "./terrain.ts";

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
  onSelect(entity: Entity | null, tile: { x: number; z: number } | null): void;
  onMove(entity: Entity, x: number, z: number, height: number): void;
  onAdd(x: number, z: number, height: number): void;
  onPaint(tiles: { x: number; z: number }[]): void;
}

const KIND_COLORS: Record<string, number> = { npc: 0x3ac7e0, proxy: 0xf0c330, trigger: 0xf08a30, warp: 0xd040d0, level: 0x888888 };

const loader = new GLTFLoader();
const sprites = new Map<string, Promise<THREE.Texture | null>>();

/** A model's first sprite frame as a texture: its PNG in its palette, the frame as tall as the sheet. */
function spriteTexture(model: string): Promise<THREE.Texture | null> {
  if (!sprites.has(model)) {
    const folder = actorFolder(model);
    sprites.set(model, (async () => {
      try {
        const data = JSON.parse((await api.file(`${folder}/data.json`)).text) as { sprite?: string };
        const from = data.sprite ? actorFolder(data.sprite) : folder;
        const [image, pal] = await Promise.all([api.asset(`${from}/sprite.png`).then(readIndexedPng), api.file(`${from}/sprite.pal`)]);
        const colors = parsePal(pal.text);
        const size = Math.min(image.height, image.width);
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext("2d")!;
        const img = ctx.createImageData(size, size);
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
          const v = image.pixels[y * image.width + x];
          if (!v) continue;
          const c = colors[v] ?? [255, 0, 255];
          img.data.set([c[0], c[1], c[2], 255], (y * size + x) * 4);
        }
        ctx.putImageData(img, 0, 0);
        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
      } catch {
        return null;
      }
    })());
  }
  return sprites.get(model)!;
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
  tileMeshes: { mesh: THREE.InstancedMesh; tiles: { x: number; z: number; h: number }[] }[] = [];
  entityMeshes: { object: THREE.Object3D; entity: Entity }[] = [];
  props: MapViewProps;
  dragging: Entity | null = null;
  paintingNow = false;
  painted = new Map<string, { x: number; z: number }>();
  frame = 0;
  loadedMap: ZoneMap | null = null;
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
    this.scene.background = new THREE.Color(0x1e2129);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(300, 800, 400);
    this.scene.add(sun, this.chunks, this.overlay, this.marks);
    const dom = this.renderer.domElement;
    dom.addEventListener("pointerdown", this.down);
    dom.addEventListener("pointermove", this.move);
    window.addEventListener("pointerup", this.up);
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
    const mapChanged = props.map !== this.loadedMap;
    const modelsChanged = props.showModels !== this.loadedModels;
    this.props = props;
    if (mapChanged || modelsChanged) this.loadChunks(mapChanged);
    this.buildOverlay();
    this.buildMarks();
  }

  /** Each chunk's GLB at its cell: x east, z south, the cell's center its origin. */
  loadChunks(frame: boolean) {
    const { map, showModels } = this.props;
    this.loadedMap = map;
    this.loadedModels = showModels;
    this.chunks.clear();
    if (showModels) {
      for (const chunk of map.chunks) {
        loader.load(`/${chunk.folder}/model.glb`, (gltf) => {
          if (this.loadedMap !== map) return;
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
      this.tileMeshes.push({ mesh: pickMesh, tiles });
    }
  }

  heightAt(x: number, z: number): number {
    for (const { tiles } of this.tileMeshes) {
      const t = tiles.find((t) => t.x === x && t.z === z);
      if (t) return t.h;
    }
    return 0;
  }

  buildMarks() {
    const { entities, selected } = this.props;
    this.marks.clear();
    this.entityMeshes = [];
    for (const e of entities) {
      if (e.x === null || e.z === null) continue;
      const isSelected = selected?.kind === e.kind && selected.index === e.index;
      const ground = e.kind === "npc" ? e.y || this.heightAt(e.x, e.z) : this.heightAt(e.x, e.z);
      const color = KIND_COLORS[e.kind];
      // Its tiles: a box the size of its area
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(e.width * TILE - 1, isSelected ? 4 : 2, e.depth * TILE - 1),
        new THREE.MeshBasicMaterial({ color: isSelected ? 0xffffff : color, transparent: true, opacity: isSelected ? 0.85 : 0.6, depthTest: false }),
      );
      box.position.set((e.x + e.width / 2) * TILE, ground + 1.5, (e.z + e.depth / 2) * TILE);
      box.renderOrder = 3;
      this.marks.add(box);
      this.entityMeshes.push({ object: box, entity: e });
      if (e.kind === "npc") {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffffff, transparent: true, alphaTest: 0.5, depthTest: true }));
        sprite.scale.set(24, 24, 1);
        // Shown once its sprite loads: a sprite without a texture draws as a white square
        sprite.visible = false;
        sprite.position.set((e.x + 0.5) * TILE, ground + 12, (e.z + 0.5) * TILE);
        if (e.model) spriteTexture(e.model).then((t) => { if (t) { sprite.material.map = t; sprite.material.needsUpdate = true; sprite.visible = true; } });
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
      return;
    }
    if (ev.shiftKey && tile) {
      this.props.onAdd(tile.x, tile.z, tile.h);
      return;
    }
    this.props.onSelect(entity, tile);
    if (entity && entity.x !== null) {
      this.dragging = entity;
      this.controls.enabled = false;
    }
  };

  move = (ev: PointerEvent) => {
    if (!this.dragging && !this.paintingNow) return;
    const { tile } = this.pick(ev);
    if (!tile) return;
    if (this.paintingNow) {
      this.painted.set(`${tile.x},${tile.z}`, tile);
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
