// The Map Editor's tile libraries (docs/paperwhite2/design/map-editor.md, The tile library): pieces of the game's map
// chunks cut on the tile grid by tools/paperwhite2/map_tiles.py. A library's sources and the user's names for its tiles
// are res/paperwhite2/map_tiles/<library>/library.json; its catalogue, generated, is build/map_tiles/<library>/:
// tiles.json lists the tiles and tiles.glb holds each one's model as a node named by its key.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { api } from "../../api.ts";
import { TILE } from "../overworld/terrain.ts";

export interface TileTerrain { shape: number; slope: number; offset: number; tile_type: number; diagonal: number }

export interface Tile {
  key: string;
  name?: string;
  category?: string;
  hidden?: boolean;
  kind: "ground" | "object";
  /** Its footprint in tiles, x and z. */
  size: [number, number];
  /** How many times the library's chunks use it, and where (the first few): a model folder's name, the tile x and z
   * of its north-west corner in the chunk, and the height its lowest point stands at. */
  uses: number;
  at: { model: string; x: number; z: number; y: number }[];
  triangles: number;
  materials: string[];
  /** The first source's terrain rows under it, z by x, as the chunk's terrain CSV has them; null outside the chunk. */
  collision: (TileTerrain | null)[][];
}

export interface Catalogue { library: string; tiles: Tile[] }

const loader = new GLTFLoader();
const scenes = new Map<string, Promise<THREE.Group>>();

/** A library's tiles' models, by key, read once. */
export function tileModels(library: string): Promise<THREE.Group> {
  if (!scenes.has(library)) {
    const promise = loader.loadAsync(`/build/map_tiles/${library}/tiles.glb?t=${Date.now()}`).then((gltf) => {
      gltf.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          (m as THREE.MeshStandardMaterial).alphaTest = 0.5;
          m.side = THREE.DoubleSide;
        }
      });
      return gltf.scene;
    });
    promise.catch(() => scenes.delete(library));
    scenes.set(library, promise);
  }
  return scenes.get(library)!;
}

export function forgetTiles(library: string) {
  scenes.delete(library);
  thumbnails.clear();
}

export const loadCatalogue = (library: string) => api.tileCatalogue(library) as Promise<Catalogue>;

/** A tile's model, a copy to place in a scene, its origin its footprint's north-west corner at its lowest point. */
export async function tileObject(library: string, key: string): Promise<THREE.Object3D | null> {
  const scene = await tileModels(library);
  const node = scene.getObjectByName(key);
  return node ? node.clone() : null;
}

// ---------------------------------------------------------------- Thumbnails

const SIZE = 96;
let thumbRenderer: THREE.WebGLRenderer | null = null;
const thumbnails = new Map<string, Promise<string>>();
let queue: Promise<unknown> = Promise.resolve();

/** A picture of a tile from above and to the south, as a data URL, drawn one at a time on a shared renderer. */
export function tileThumbnail(library: string, tile: Tile): Promise<string> {
  const id = `${library}:${tile.key}`;
  if (!thumbnails.has(id)) {
    const job = queue.then(() => drawThumbnail(library, tile));
    queue = job.catch(() => undefined);
    thumbnails.set(id, job);
  }
  return thumbnails.get(id)!;
}

async function drawThumbnail(library: string, tile: Tile): Promise<string> {
  const object = await tileObject(library, tile.key);
  if (!object) return "";
  thumbRenderer ??= new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  thumbRenderer.setSize(SIZE, SIZE);
  thumbRenderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(30, 80, 40);
  scene.add(sun, object);
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, TILE / 2);
  const camera = new THREE.OrthographicCamera(-radius, radius, radius, -radius, 0.1, 4000);
  camera.position.copy(center).add(new THREE.Vector3(0, 1, 0.8).normalize().multiplyScalar(radius * 4));
  camera.lookAt(center);
  // Textures load after the model; wait for them before drawing
  await new Promise((done) => setTimeout(done, 0));
  await texturesReady(object);
  thumbRenderer.render(scene, camera);
  return thumbRenderer.domElement.toDataURL("image/png");
}

function texturesReady(object: THREE.Object3D): Promise<unknown> {
  const waits: Promise<unknown>[] = [];
  object.traverse((o) => {
    const material = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    const image = material?.map?.image as HTMLImageElement | ImageBitmap | undefined;
    if (image && "complete" in image && !image.complete) waits.push(new Promise((done) => image.addEventListener("load", done, { once: true })));
  });
  return Promise.all(waits);
}

/** A tile's words for the palette: its name, or its materials. */
export const tileLabel = (t: Tile) => t.name || t.materials.slice(0, 2).join(", ") + (t.materials.length > 2 ? ` +${t.materials.length - 2}` : "");
