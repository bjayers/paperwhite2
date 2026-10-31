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
