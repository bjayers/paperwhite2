// A map chunk's props in its GLB (res/field/maps/models/<model>/model.glb): the nodes at the scene's root named
// bw2_prop_<index>_id_<prop ID>, each a translation and a turn about y, which tools/data/map_model_data.py's
// patch_props packs into the chunk in the order of their index. Writing them replaces those nodes and keeps every
// other node, renumbering the references to nodes that the removed ones moved (children, skins, scenes, animations).

const MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const PROP = /^bw2_prop_\d+_id_\d+(?:\.\d+)?$/;

export interface GlbProp {
  id: number;
  translation: [number, number, number];
  /** The turn about y, as a quaternion's y and w. */
  rotation: [number, number, number, number];
}

type Node = { name?: string; children?: number[]; [key: string]: unknown };
type Gltf = {
  nodes?: Node[];
  scenes?: { nodes?: number[] }[];
  scene?: number;
  skins?: { joints?: number[]; skeleton?: number }[];
  animations?: { channels?: { target?: { node?: number } }[] }[];
  [key: string]: unknown;
};

function read(glb: Buffer): { json: Gltf; rest: Buffer } {
  if (glb.readUInt32LE(0) !== MAGIC || glb.readUInt32LE(16) !== JSON_CHUNK) throw new Error("Not a GLB with its JSON first");
  const length = glb.readUInt32LE(12);
  return { json: JSON.parse(glb.subarray(20, 20 + length).toString("utf8")) as Gltf, rest: glb.subarray(20 + length) };
}

function write(json: Gltf, rest: Buffer): Buffer {
  // Indented as map_model_data.py's write_glb writes it (its floats keep a point that JSON.stringify drops, as 40.0)
  let text = Buffer.from(JSON.stringify(json, null, 2), "utf8");
  // The JSON chunk is padded with spaces to 4 bytes
  if (text.length % 4) text = Buffer.concat([text, Buffer.alloc(4 - (text.length % 4), 0x20)]);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(MAGIC, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + text.length + rest.length, 8);
  header.writeUInt32LE(text.length, 12);
  header.writeUInt32LE(JSON_CHUNK, 16);
  return Buffer.concat([header, text, rest]);
}

/** The GLB with its props replaced by these, in this order. */
export function setGlbProps(glb: Buffer, props: GlbProp[]): Buffer {
  const { json, rest } = read(glb);
  const nodes = json.nodes ?? [];
  const keep: number[] = [];
  const renumber = new Map<number, number>();
  nodes.forEach((n, i) => {
    if (PROP.test(n.name ?? "")) return;
    renumber.set(i, keep.length);
    keep.push(i);
  });
  const moved = (i: number) => {
    const to = renumber.get(i);
    if (to === undefined) throw new Error(`Node ${i} is a prop that another node refers to`);
    return to;
  };
  const kept: Node[] = keep.map((i) => ({ ...nodes[i], ...(nodes[i].children ? { children: nodes[i].children!.map(moved) } : {}) }));
  for (const skin of json.skins ?? []) {
    if (skin.joints) skin.joints = skin.joints.map(moved);
    if (skin.skeleton !== undefined) skin.skeleton = moved(skin.skeleton);
  }
  for (const animation of json.animations ?? []) {
    for (const channel of animation.channels ?? []) if (channel.target?.node !== undefined) channel.target.node = moved(channel.target.node);
  }
  const scenes = json.scenes ?? [{ nodes: [] }];
  for (const scene of scenes) scene.nodes = (scene.nodes ?? []).filter((i) => renumber.has(i)).map(moved);
  const root = scenes[json.scene ?? 0];
  props.forEach((p, index) => {
    root.nodes!.push(kept.length);
    kept.push({
      name: `bw2_prop_${String(index).padStart(4, "0")}_id_${String(p.id).padStart(5, "0")}`,
      translation: p.translation,
      rotation: p.rotation,
    });
  });
  json.nodes = kept;
  json.scenes = scenes;
  return write(json, rest);
}

// ---------------------------------------------------------------- Faces

/** Faces of the GLB's mesh, by primitive (a draw call) and their triangles' numbers in its index list. */
export interface FaceSet { primitive: number; triangles: number[] }

export interface FaceEdits {
  /** Faces to delete. */
  remove?: FaceSet[];
  /** Faces to draw with another texture: an image by its URI, as the GLB names its images (../../textures/<set>/<name>.png). */
  retexture?: { faces: FaceSet[]; image: string }[];
}

type Accessor = { bufferView?: number; byteOffset?: number; componentType: number; count: number; type: string; [k: string]: unknown };
type Primitive = { attributes: Record<string, number>; indices?: number; material?: number; [k: string]: unknown };
type Material = { name?: string; pbrMetallicRoughness?: { baseColorTexture?: { index: number }; [k: string]: unknown }; [k: string]: unknown };
type FaceGltf = Gltf & {
  accessors: Accessor[];
  bufferViews: { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number; target?: number }[];
  buffers: { byteLength: number }[];
  meshes: { primitives: Primitive[]; [k: string]: unknown }[];
  materials?: Material[];
  textures?: { source: number; sampler?: number }[];
  images?: { uri?: string; name?: string }[];
};

function binChunk(rest: Buffer): Buffer {
  if (rest.length < 8 || rest.readUInt32LE(4) !== 0x004e4942) throw new Error("The GLB has no binary chunk");
  return rest.subarray(8, 8 + rest.readUInt32LE(0));
}

function indicesOf(json: FaceGltf, bin: Buffer, accessor: number): number[] {
  const a = json.accessors[accessor];
  const view = json.bufferViews[a.bufferView ?? -1];
  if (!view) throw new Error("An index accessor has no buffer view");
  const size = { 5121: 1, 5123: 2, 5125: 4 }[a.componentType];
  if (!size) throw new Error("Unsupported index type");
  const start = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const out: number[] = [];
  for (let i = 0; i < a.count; i++) {
    const at = start + i * size;
    out.push(size === 1 ? bin[at] : size === 2 ? bin.readUInt16LE(at) : bin.readUInt32LE(at));
  }
  return out;
}

/** The GLB with faces deleted or drawn with other textures, and whether its draw calls or materials changed, which the
 * packer can only write as a whole model (data.json's "written"). */
export function editGlbFaces(glb: Buffer, edits: FaceEdits): { glb: Buffer; drawCallsChanged: boolean } {
  const { json: raw, rest } = read(glb);
  const json = raw as FaceGltf;
  if (json.meshes?.length !== 1) throw new Error("Expected one mesh");
  const bin = Buffer.from(binChunk(rest));
  const primitives = json.meshes[0].primitives;
  const lists = primitives.map((p) => {
    if (p.indices === undefined) throw new Error("A primitive has no indices");
    return indicesOf(json, bin, p.indices);
  });
  const gone = primitives.map(() => new Set<number>());
  const check = (set: FaceSet) => {
    if (!primitives[set.primitive]) throw new Error(`No primitive ${set.primitive}`);
    for (const t of set.triangles) if (!Number.isInteger(t) || t < 0 || t * 3 >= lists[set.primitive].length) throw new Error(`No triangle ${t}`);
  };
  for (const set of edits.remove ?? []) {
    check(set);
    set.triangles.forEach((t) => gone[set.primitive].add(t));
  }
  // Faces drawn with another texture move to a primitive of their own, by the attributes they use and the material
  const added: { primitive: Primitive; indices: number[] }[] = [];
  let materialsChanged = false;
  for (const re of edits.retexture ?? []) {
    if (!/^(\.\.\/)*[a-z0-9_./-]+\.png$/i.test(re.image)) throw new Error("Name a PNG of the texture set");
    for (const set of re.faces) {
      check(set);
      const source = primitives[set.primitive];
      const material = materialFor(json, source.material, re.image);
      materialsChanged ||= material !== source.material;
      const key = JSON.stringify([source.attributes, material]);
      let target = added.find((a) => JSON.stringify([a.primitive.attributes, a.primitive.material]) === key);
      if (!target) {
        const { indices: _, ...rest } = source;
        target = { primitive: { ...rest, material }, indices: [] };
        added.push(target);
      }
      for (const t of set.triangles) {
        if (gone[set.primitive].has(t)) continue;
        gone[set.primitive].add(t);
        target.indices.push(...lists[set.primitive].slice(t * 3, t * 3 + 3));
      }
    }
  }
  // The new index lists go after the binary chunk's data, each in a buffer view of its own
  const tail: Buffer[] = [];
  let length = bin.length;
  const indexAccessor = (indices: number[]): number => {
    const pad = (4 - (length % 4)) % 4;
    if (pad) { tail.push(Buffer.alloc(pad)); length += pad; }
    const data = Buffer.alloc(indices.length * 4);
    indices.forEach((v, i) => data.writeUInt32LE(v, i * 4));
    json.bufferViews.push({ buffer: 0, byteOffset: length, byteLength: data.length, target: 34963 });
    tail.push(data);
    length += data.length;
    json.accessors.push({ bufferView: json.bufferViews.length - 1, componentType: 5125, count: indices.length, type: "SCALAR" });
    return json.accessors.length - 1;
  };
  const kept: Primitive[] = [];
  primitives.forEach((p, i) => {
    if (!gone[i].size) { kept.push(p); return; }
    const remaining = lists[i].filter((_, k) => !gone[i].has(Math.floor(k / 3)));
    if (remaining.length) kept.push({ ...p, indices: indexAccessor(remaining) });
  });
  for (const a of added) if (a.indices.length) kept.push({ ...a.primitive, indices: indexAccessor(a.indices) });
  const drawCallsChanged = kept.length !== primitives.length || materialsChanged;
  json.meshes[0].primitives = kept;
  const binary = Buffer.concat([bin, ...tail]);
  const padded = binary.length % 4 ? Buffer.concat([binary, Buffer.alloc(4 - (binary.length % 4))]) : binary;
  json.buffers[0].byteLength = padded.length;
  const header = Buffer.alloc(8);
  header.writeUInt32LE(padded.length, 0);
  header.writeUInt32LE(0x004e4942, 4);
  return { glb: write(json, Buffer.concat([header, padded])), drawCallsChanged };
}

/** A material like the one given but showing the image: one the GLB has, or a copy named after the image. */
function materialFor(json: FaceGltf, from: number | undefined, image: string): number {
  const materials = (json.materials ??= []);
  const base = from !== undefined ? materials[from] : { pbrMetallicRoughness: {} };
  const images = (json.images ??= []);
  const textures = (json.textures ??= []);
  let imageIndex = images.findIndex((i) => i.uri === image);
  if (imageIndex < 0) { images.push({ uri: image }); imageIndex = images.length - 1; }
  const current = base.pbrMetallicRoughness?.baseColorTexture;
  const sampler = current ? textures[current.index]?.sampler : undefined;
  let textureIndex = textures.findIndex((t) => t.source === imageIndex && t.sampler === sampler);
  if (textureIndex < 0) {
    textures.push(sampler === undefined ? { source: imageIndex } : { source: imageIndex, sampler });
    textureIndex = textures.length - 1;
  }
  const wanted: Material = { ...base, pbrMetallicRoughness: { ...base.pbrMetallicRoughness, baseColorTexture: { index: textureIndex } } };
  const same = (m: Material) => JSON.stringify({ ...m, name: undefined }) === JSON.stringify({ ...wanted, name: undefined });
  const found = materials.findIndex(same);
  if (found >= 0) return found;
  // Named after the texture, as the game's materials mostly are, and unique, in Nitro's 16 characters
  const stem = image.slice(image.lastIndexOf("/") + 1, -4).slice(0, 16);
  let name = stem;
  for (let n = 2; materials.some((m) => m.name === name); n++) name = `${stem.slice(0, 16 - String(n).length - 1)}_${n}`;
  materials.push({ ...wanted, name });
  return materials.length - 1;
}
