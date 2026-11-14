// The Rig Editor's second version's source (docs/paperwhite2/design/rig-editor-v2.md, "Built: step 1"):
// <side>_rig_v2.json beside <side>_rig.json (res/pokemon/battle_sprite_rig_v2.schema.json), the user's model of a side,
// and its bake into the flat rig, which stays the build's only input.
//
// - The rig setup: pieces (the sheet's pictures), one set of bones (parts) shared by every sequence, each with a head
//   (its pivot) and a tail, a parent (connected: the head locked to the parent's tail; or keeping its offset), the
//   default pose and the layer order.
// - Sequences (the game's actions, one pose each): per-part keyframes on the sequence's own time, from the default
//   pose at frame 0 and back to it at the sequence's length, which is never baked (the loop's seam); loop clips placed
//   on parts; the timeline (the game's sequence 0, "stay") a strip of blocks each playing one sequence from its start.
// - The bake makes what the game needs from it: a track per part per sequence (head_a, head_b, ...), sampled every 6
//   frames from the curves, the parts composed through their parents about their pivots, a pose per sequence, the
//   strips' keys, the idle parts. Vanilla sprites convert to this (convertToV2) and bake back byte for byte; the few
//   fields that only describe the originals' storage (track_order, kept_tracks, idle_nodes, a part's own track name or
//   loop) are written only where the default rule doesn't give the original.

import { forward, lengthOf, loops, keyAt, type Key, type KeyType, type Obj, type Pair, type Play, type Rectangle, type Rig, type Srt,
         type Track } from "./mcss.ts";
import { blankPicture, generateObjs, isBlank, partName, signedDegrees } from "./model.ts";
import { boundariesOf, constantTrack, cutsOf, flatKey, fuller, gcd, IDENTITY, inverse, keyOfMap, keysOfPieces, LONGEST, partMap, rounded,
         segmentsOf, SHEAR, shift, sortedKeys, srtOfKey, srtOfValues, then, typeNeeded, valuesAt, type Curve, type Handle, type KeyPose, type Piece as Sample,
         type Channel } from "./armature.ts";

// ---------------------------------------------------------------- The format

export const V2_FORMAT = 2;
export const V2_SCHEMA = "battle_sprite_rig_v2.schema.json";
/** Game Freak's rhythm: keys every 6 frames; sequence lengths, keyframes and the playhead snap to it in the editor. */
export const STEP = 6;
/** The curve of a keyframe that names none, unless the file says otherwise (`curve`). */
export const DEFAULT_CURVE: Curve = "ease_in_out";
/** Every curve, with the presets (the first armature's schema has the first six). */
export const V2_CURVES: Curve[] = ["constant", "linear", "ease_in", "ease_out", "ease_in_out", "bezier", "snap", "back", "bounce", "elastic"];

export interface V2Piece {
  name: string;
  /** One or two rectangles of the sheet; `at` places each from the head of the bone that shows it (x right, y up). */
  rectangles: Rectangle[];
  /** The cell's OBJs where they aren't mcss_rig.generate_objs's (4% of the originals). */
  objs?: Obj[];
  obj_attribute?: number;
}

/** A pose of one bone: what it shows and its movement about its head (in its parent's frame). */
export interface Transform {
  piece?: number;
  hidden?: boolean;
  /** Pixels, x right, y down. */
  move?: Pair;
  /** Degrees, clockwise, not wrapped. */
  rotation?: number;
  scale?: Pair;
}

export interface V2Bone {
  name: string;
  /** The pivot, from the feet, x right, y down (the game's node position). */
  head: Pair;
  /** Where connected children's heads are. */
  tail: Pair;
  parent: number | null;
  /** The head locked to the parent's tail (and the bone's own move ignored); else it keeps its offset. */
  connected?: boolean;
  /** The default pose: what every sequence starts and ends at. */
  default?: Transform;
}

export interface V2Key extends Transform {
  frame: number;
  curve?: Curve;
  curves?: Partial<Record<Channel, Curve>>;
  handles?: Partial<Record<Channel, [Handle, Handle]>>;
  /** The flat key's storage-only fields (unused, marker, result_copy), originals only. */
  flat?: Record<string, number>;
}

export interface ClipUse { clip: number; start?: number }

/** One part's keyframes in one sequence. */
export interface Lane {
  bone: number;
  keys: V2Key[];
  clips?: ClipUse[];
  /** Originals only: the part's own loop when it isn't the sequence's length, its track's name, key type, play mode. */
  frames?: number;
  name?: string;
  key_type?: KeyType;
  play?: Play;
  loop_start?: number;
  bank_type?: number;
  step?: number;
}

/** A part drawn in a sequence, front to back (the pose's node); originals may override where it is and what it plays. */
export interface Layer {
  bone: number;
  head?: Pair;
  play?: "restart" | "continue";
  /** Plays the track of another sequence's part (a track the original shares): [sequence, bone]. */
  track_of?: [number, number];
  instance?: number;
  flags?: number;
}

export interface V2Sequence {
  name: string;
  /** The loop's length (a multiple of 6 for the editor's own); the default pose again at this frame, never baked. */
  frames: number;
  step?: number;
  /** The drawn parts front to back, where they differ from the rig's layers. */
  layers?: Layer[];
  instances?: number;
  parts: Lane[];
}

export interface LoopClip {
  name: string;
  frames: number;
  step?: number;
  /** Keys that loop every `frames`; their channels add to the part's (moves and turns added, scales multiplied), and a
   * key with a piece (or hidden) shows it over the part's until the next such key. */
  keys: V2Key[];
}

export interface Block {
  sequence: number;
  /** How long the block plays (the sequence's length by default; longer loops the sequence, its parts restarting). */
  frames?: number;
  /** The whole sprite's place for the block (originals' sequence keys). */
  move?: Pair;
  rotation?: number;
  scale?: Pair;
  flat?: Record<string, number>;
}

export interface Strip {
  name: string;
  play?: Play;
  key_type?: KeyType;
  loop_start?: number;
  bank_type?: number;
  blocks: Block[];
}

export interface V2 {
  format: 2;
  side: "front" | "back";
  step?: number;
  curve?: Curve;
  box: { width: number; height: number; x: number; y: number };
  stop_flags: number;
  /** The battle's random pause: off, the sprite never pauses (the game's idle 0xff). */
  pause: boolean;
  /** Bones that go on animating through the pause (fire, a blink). */
  keeps_moving: number[];
  idle_nodes?: number[];
  kept?: { info_padding?: string; obj_mapping?: number; extension?: number; picture_labels?: string[] };
  pieces: V2Piece[];
  bones: V2Bone[];
  /** The rig's layer order, front to back: bones (the parts every sequence draws unless it has its own). */
  layers?: number[];
  sequences: V2Sequence[];
  loop_clips?: LoopClip[];
  /** The game's sequence 0 ("stay"), the loop played all the time. */
  timeline: Strip;
  /** The originals' other sequences (1 "stop", the egg's), kept as strips. */
  strips?: Strip[];
  /** The flat tracks' order where the rule (by sequence, then bone) doesn't give it: [sequence, bone], or [null, n] for
   * kept_tracks[n]. */
  track_order?: [number | null, number][];
  /** Tracks no pose plays (446 original sides have some), kept as they are. */
  kept_tracks?: Track[];
  [other: string]: unknown;
}

// ---------------------------------------------------------------- Snapping (the editor's rules; the format allows any frame)

/** A keyframe's or the playhead's frame snapped to the step (the nearest multiple of 6, never below 0). */
export const snapFrame = (frame: number, step = STEP) => Math.max(0, Math.round(frame / step) * step);
/** A sequence's length snapped to the step: the nearest multiple of 6, at least one step. */
export const snapLength = (frames: number, step = STEP) => Math.max(step, Math.round(frames / step) * step);
/** The frames a sequence bakes (the samples, each held one step): 0, 6, ... up to the last before its length. The
 * length itself is the next loop's frame 0, where the default pose (or the end key) is, so it is never held twice. */
export const bakedFrames = (frames: number, step = STEP) => Array.from({ length: Math.ceil(frames / step) }, (_, i) => i * step);

// ---------------------------------------------------------------- Small helpers

const LETTERS = "abcdefghijklmnopqrstuvwxyz";
/** The suffix of a sequence's tracks: a, b, ... z, then the number. */
export const sequenceLetter = (s: number) => (s < LETTERS.length ? LETTERS[s] : String(s));
/** A name the files' labels can hold (ASCII). */
const labelOf = (name: string) => name.replace(/[^\x21-\x7e]/g, "_") || "part";
/** The track a part of a sequence bakes to, unless the part names its own. */
export const trackName = (bone: V2Bone, sequence: number) => `${labelOf(bone.name)}_${sequenceLetter(sequence)}`;

/** The layers a sequence draws: its own, or the rig's. */
export function layersOf(src: V2, s: number): Layer[] {
  const own = src.sequences[s]?.layers;
  if (own) return own;
  return (src.layers ?? src.bones.map((_, i) => i)).map((bone) => ({ bone }));
}

/** A bone's pivot: its head, or a connected bone's parent's tail. */
export function headOf(src: V2, bone: number): Pair {
  const b = src.bones[bone];
  if (b?.connected && b.parent !== null && src.bones[b.parent]) return src.bones[b.parent].tail;
  return b?.head ?? [0, 0];
}

const degreesTo65536 = (degrees: number) => (degrees / 360) * 65536;
const lcm = (a: number, b: number) => (a / gcd(a, b)) * b;

// ---------------------------------------------------------------- A part's keys as the bake reads them

/** A lane's keys as key poses (the first armature's, which the sampling shares): the implicit start at the default
 * pose (unless a key is at frame 0), the pictures resolved (held from key to key; `pictureOf` gives the picture shown
 * for the piece shown and whether it is hidden), every channel given (a connected bone's move locked to 0). The bake
 * and the editor's keyframing both read a part's keys through this. */
export function lanePoses(src: V2, b: number, lane: Lane | undefined, locked: boolean,
                          pictureOf: (shown: number | undefined, hidden: boolean) => number): KeyPose[] {
  const bone = src.bones[b];
  const d = bone.default ?? {};
  const defaultCurve = src.curve ?? DEFAULT_CURVE;
  let shown = d.piece;
  let hidden = d.hidden ?? d.piece === undefined;
  const pictureNow = () => pictureOf(shown, hidden);
  const values = (k: Transform) => ({
    move: (locked ? [0, 0] : k.move ?? d.move ?? [0, 0]) as Pair,
    rotation: k.rotation ?? d.rotation ?? 0,
    scale: (k.scale ?? d.scale ?? [1, 1]) as Pair,
  });
  const explicit = sortedKeys((lane?.keys ?? []) as KeyPose[]) as unknown as V2Key[];
  const out: KeyPose[] = [];
  if (!explicit.some((k) => k.frame === 0)) out.push({ frame: 0, picture: pictureNow(), ...values({}), curve: defaultCurve });
  for (const k of explicit) {
    if (k.piece !== undefined) { shown = k.piece; hidden = false; }
    if (k.hidden !== undefined) hidden = k.hidden;
    const pose: KeyPose = { frame: k.frame, picture: pictureNow(), ...values(k), curve: k.curve ?? defaultCurve };
    if (k.curves) pose.curves = k.curves;
    if (k.handles) pose.handles = k.handles;
    if (k.flat) pose.flat = k.flat;
    out.push(pose);
  }
  return out;
}

// ---------------------------------------------------------------- The bake

export interface BakedV2 {
  rig: Rig;
  warnings: string[];
  /** Per flat track: the keys baked with a shear approximated. */
  shears: Map<number, number>;
  /** The flat track of each part of each sequence that has one, by `${sequence}/${bone}`. */
  trackOf: Map<string, number>;
}

/** Bakes a source into the flat rig the build packs. Deterministic: the same source gives the same rig, by the rules in
 * rig-editor-v2.md's "Built: step 1". */
export function bakeV2(src: V2): BakedV2 {
  const warnings: string[] = [];
  const shears = new Map<number, number>();
  const step0 = src.step ?? STEP;
  const clips = src.loop_clips ?? [];

  // ---- Pictures: the pieces, and a blank one for hidden keys when the pieces have none
  const pictures = src.pieces.map((p) => {
    let objs = p.objs;
    if (!objs) {
      try {
        objs = generateObjs({ rectangles: p.rectangles, objs: [], obj_attribute: 0 });
      } catch {
        objs = [];
        warnings.push(`Piece ${p.name}: its rectangles can't be cut into OBJs (sizes in whole tiles); the cell gets none.`);
      }
    }
    return { rectangles: p.rectangles, objs, obj_attribute: p.obj_attribute ?? 0 };
  });
  let blank = pictures.findIndex((p) => isBlank(p));
  const blankPictureIndex = () => {
    if (blank < 0) {
      blank = pictures.length;
      pictures.push(blankPicture());
    }
    return blank;
  };

  // ---- Which parts of which sequences have a track of their own, and the tracks' order
  const key = (s: number, b: number) => `${s}/${b}`;
  const needs = new Set<string>();
  src.sequences.forEach((seq, s) => {
    for (const layer of layersOf(src, s)) if (!layer.track_of) needs.add(key(s, layer.bone));
    for (const lane of seq.parts) needs.add(key(s, lane.bone));
  });
  const derived: [number | null, number][] = [];
  src.sequences.forEach((_, s) => src.bones.forEach((_, b) => { if (needs.has(key(s, b))) derived.push([s, b]); }));
  const kept = src.kept_tracks ?? [];
  kept.forEach((_, n) => { if (!src.track_order) derived.push([null, n]); });
  let order = src.track_order ?? derived;
  {
    const want = new Set([...needs, ...kept.map((_, n) => `kept/${n}`)]);
    const got = order.map(([s, b]) => (s === null ? `kept/${b}` : key(s, b)));
    if (got.length !== want.size || new Set(got).size !== got.length || got.some((g) => !want.has(g))) {
      warnings.push("The track order doesn't list every part's track once: the tracks are in the usual order (by sequence, then part).");
      order = [...src.sequences.flatMap((_, s) => src.bones.map((_, b) => [s, b] as [number, number]).filter(([, b]) => needs.has(key(s, b)))),
               ...kept.map((_, n) => [null, n] as [null, number])];
    }
  }
  const trackOf = new Map<string, number>();
  order.forEach(([s, b], i) => { if (s !== null) trackOf.set(key(s, b), i); });
  const tracks: (Track | undefined)[] = order.map(([s, b]) => (s === null ? kept[b] : undefined));

  // The track a layer plays, the pivot it plays it at
  const layerTrack = (s: number, layer: Layer) => trackOf.get(layer.track_of ? key(layer.track_of[0], layer.track_of[1]) : key(s, layer.bone));
  const pivotIn = (s: number, b: number): Pair => {
    const layer = layersOf(src, s).find((l) => l.bone === b && !l.track_of) ?? layersOf(src, s).find((l) => l.bone === b);
    return layer?.head ?? headOf(src, b);
  };

  // ---- Parents: a circle is broken (the bone bakes as the root's)
  const cyclic = new Set<number>();
  src.bones.forEach((_, b) => {
    const seen = new Set<number>([b]);
    let p = src.bones[b].parent;
    while (p !== null && p !== undefined && src.bones[p]) {
      if (seen.has(p)) { cyclic.add(b); break; }
      seen.add(p);
      p = src.bones[p].parent;
    }
  });
  for (const b of cyclic) warnings.push(`${src.bones[b].name} and its parents go round in a circle: it bakes as if parented to the root.`);
  const parentOf = (b: number): number | null => {
    const p = src.bones[b]?.parent ?? null;
    return p !== null && !cyclic.has(b) && src.bones[p] && p !== b ? p : null;
  };

  const keyPosesOf = (b: number, lane: Lane | undefined): KeyPose[] =>
    lanePoses(src, b, lane, !!src.bones[b].connected && parentOf(b) !== null, (shown, hidden) => (hidden || shown === undefined ? blankPictureIndex() : shown));

  /** A clip's keys as key poses (channels relative, curve constant unless named), and its pictures by frame. */
  const clipPoses = clips.map((clip) => sortedKeys(clip.keys.map((k) => ({ frame: k.frame, move: k.move ?? [0, 0], rotation: k.rotation ?? 0,
    scale: k.scale ?? [1, 1], curve: k.curve ?? "constant", ...(k.curves ? { curves: k.curves } : {}), ...(k.handles ? { handles: k.handles } : {}) }) as KeyPose)));
  const clipPictures = clips.map((clip) => sortedKeys(clip.keys as KeyPose[]).filter((k) => (k as V2Key).piece !== undefined || (k as V2Key).hidden !== undefined) as V2Key[]);
  /** The picture a clip shows at its time, or undefined (the part's own). */
  const clipPictureAt = (c: number, t: number): number | undefined => {
    const list = clipPictures[c];
    if (!list.length) return undefined;
    let at = list[list.length - 1];
    for (const k of list) if (k.frame <= t) at = k;
    return at.hidden ? blankPictureIndex() : at.piece;
  };

  // ---- The tracks, each part's parent's first
  const state = new Map<string, "busy" | "done">();
  const bakeTrack = (s: number, b: number) => {
    const id = key(s, b);
    if (state.has(id)) return;
    state.set(id, "busy");
    const index = trackOf.get(id)!;
    const seq = src.sequences[s];
    const lane = seq.parts.find((l) => l.bone === b);
    const bone = src.bones[b];
    // The parent's track in this sequence (as the sequence draws it), baked first
    const p = parentOf(b);
    let parentTrack: Track | undefined;
    let parentPivot: Pair = [0, 0];
    if (p !== null) {
      const layer = layersOf(src, s).find((l) => l.bone === p);
      const pid = layer?.track_of ? key(layer.track_of[0], layer.track_of[1]) : key(s, p);
      if (trackOf.has(pid)) {
        const [ps, pb] = pid.split("/").map(Number);
        if (state.get(pid) !== "busy") bakeTrack(ps, pb);
        parentTrack = tracks[trackOf.get(pid)!];
        parentPivot = pivotIn(ps, pb);
      } else warnings.push(`${bone.name}'s parent ${src.bones[p].name} isn't drawn in ${seq.name}: there it moves as the root's.`);
    }
    const frames = lane?.frames ?? seq.frames;
    const play = lane?.play ?? "loop";
    const loop = loops(play);
    const step = lane?.step ?? seq.step ?? step0;
    const pivot = pivotIn(s, b);
    const keys = keyPosesOf(b, lane);
    for (const k of lane?.keys ?? []) if (k.frame > frames) warnings.push(`${bone.name} in ${seq.name}: a key at frame ${k.frame}, past the sequence's ${frames}, never plays.`);
    const uses = (lane?.clips ?? []).filter((u) => {
      if (clips[u.clip]) return true;
      warnings.push(`${bone.name} in ${seq.name}: loop clip ${u.clip} doesn't exist.`);
      return false;
    });

    // How long the bake runs: the part's loop, or long enough for a moving parent's loop and the clips' too
    let length = frames;
    const parentLength = parentTrack ? lengthOf(parentTrack) : 0;
    const parentMoves = parentTrack ? !constantTrack(parentTrack) : false;
    const grow = (other: number, what: string) => {
      if (other <= 0 || frames <= 0 || !loop || length % other === 0) return;
      const both = lcm(length, other);
      if (both <= LONGEST) {
        warnings.push(`${bone.name} in ${seq.name} loops every ${frames} frames and ${what} every ${other}: baked over ${both} frames so they keep together.`);
        length = both;
      } else warnings.push(`${bone.name} in ${seq.name} loops every ${frames} frames and ${what} every ${other}: they'd meet again only after ${both}; give them lengths that divide each other.`);
    };
    if (parentMoves) grow(parentLength, `its parent ${src.bones[p!].name}`);
    for (const u of uses) grow(clips[u.clip].frames, `its loop clip ${clips[u.clip].name}`);

    // Where the samples are cut besides the step: the parent's keys, the clips' keys (and their steps, where they curve)
    const cuts: number[] = parentMoves ? boundariesOf(parentTrack!, length) : [];
    for (const u of uses) {
      const clip = clips[u.clip];
      const c = clip.frames;
      if (c <= 0) continue;
      const curved = clipPoses[u.clip].some((k) => (k.curve ?? "constant") !== "constant" || k.curves);
      const clipStep = clip.step ?? step;
      const marks = new Set(clip.keys.map((k) => k.frame % c));
      if (curved) for (let m = 0; m < c; m += clipStep) marks.add(m);
      const start = u.start ?? 0;
      for (let n = Math.floor(-start / c) - 1; start + n * c < length; n++) for (const m of marks) {
        const t = start + n * c + m;
        if (t > 0 && t < length) cuts.push(t);
      }
    }
    const parentRest = parentTrack ? shift(parentPivot[0], -parentPivot[1]) : IDENTITY;
    let type: KeyType = lane?.key_type ?? "plain";
    const spans: { pieces: Sample[]; to: number; extra?: Record<string, number> }[] = [];
    for (const seg of segmentsOf(keys, frames, length)) {
      const kp = keys[seg.index];
      const sample = (time: number): Sample => {
        const local = Math.min(time - seg.base, frames);
        const v = valuesAt(keys, local, frames, loop, seg.index);
        let picture = kp.picture ?? 0;
        for (const u of uses) {
          const clip = clips[u.clip];
          const tc = clip.frames > 0 ? ((((time - (u.start ?? 0)) % clip.frames) + clip.frames) % clip.frames) : 0;
          const cv = valuesAt(clipPoses[u.clip], tc, clip.frames, true);
          v.move = [v.move[0] + cv.move[0], v.move[1] + cv.move[1]];
          v.rotation += cv.rotation;
          v.scale = [v.scale[0] * cv.scale[0], v.scale[1] * cv.scale[1]];
          picture = clipPictureAt(u.clip, tc) ?? picture;
        }
        if (bone.connected && p !== null) v.move = [0, 0];
        const own = srtOfValues(v);
        const head = { picture };
        if (!parentTrack) return { from: time, srt: rounded(own), head };
        const pk = keyAt(parentTrack, time);
        const ps = srtOfKey(pk.key, parentTrack.key_type);
        // The parent's movement from its rest (its key about its pivot), after the part's own about its pivot
        const world = then(partMap(own, pivot), then(inverse(parentRest), partMap(ps, parentPivot)));
        const out = keyOfMap(world, pivot, own[0] + ps[0]);
        return { from: time, srt: rounded(out.srt), head, ...(out.skew > SHEAR ? { skew: true } : {}) };
      };
      if (seg.to <= seg.from) spans.push({ pieces: [sample(seg.from)], to: seg.to, extra: kp.flat });
      else spans.push({ pieces: cutsOf(seg.from, seg.to, step, cuts).map(sample), to: seg.to, extra: kp.flat });
    }
    for (const sp of spans) for (const piece of sp.pieces) type = fuller(type, typeNeeded(piece.srt));
    const out: Key[] = [];
    const counter = { count: 0 };
    for (const sp of spans) out.push(...keysOfPieces(sp.pieces, sp.to, type, sp.extra, counter));
    tracks[index] = {
      name: lane?.name ?? trackName(bone, s), key_type: type, play,
      ...(lane?.loop_start !== undefined ? { loop_start: lane.loop_start } : {}),
      ...(lane?.bank_type !== undefined ? { bank_type: lane.bank_type } : {}),
      keys: out,
    };
    if (counter.count) {
      shears.set(index, counter.count);
      warnings.push(`${tracks[index]!.name}: ${counter.count} baked keys would need a shear the game can't draw (a parent's uneven scale over a turned child); they keep the nearest turn and scale. Keep ${p !== null ? src.bones[p].name : "the parent"}'s scale even, or the child unturned.`);
    }
    state.set(id, "done");
  };
  for (const [s, b] of order) if (s !== null) bakeTrack(s, b);

  // ---- Poses: a sequence's layers
  const poses = src.sequences.map((seq, s) => ({
    parts: layersOf(src, s).map((layer) => {
      const track = layerTrack(s, layer);
      if (track === undefined) throw new Error(`${seq.name}: a part plays a track that doesn't exist (${JSON.stringify(layer.track_of)})`);
      return {
        track, pivot: layer.head ?? headOf(src, layer.bone), play: layer.play ?? "restart",
        ...(layer.instance !== undefined ? { instance: layer.instance } : {}),
        ...(layer.flags !== undefined ? { flags: layer.flags } : {}),
      };
    }),
    ...(seq.instances !== undefined ? { instances: seq.instances } : {}),
  }));

  // ---- Strips: the timeline, then the originals' others; a block a key showing its sequence's pose
  const sequences = [src.timeline, ...(src.strips ?? [])].map((strip) => {
    const srts = strip.blocks.map((block) => rounded([degreesTo65536(block.rotation ?? 0), block.scale?.[0] ?? 1, block.scale?.[1] ?? 1,
                                                      block.move?.[0] ?? 0, block.move?.[1] ?? 0]));
    let type: KeyType = strip.key_type ?? "plain";
    for (const t of srts) type = fuller(type, typeNeeded(t));
    return {
      name: strip.name, key_type: type, play: strip.play ?? "loop",
      ...(strip.loop_start !== undefined ? { loop_start: strip.loop_start } : {}),
      ...(strip.bank_type !== undefined ? { bank_type: strip.bank_type } : {}),
      keys: strip.blocks.map((block, i) => {
        const frames = block.frames ?? src.sequences[block.sequence]?.frames ?? 0;
        if (!src.sequences[block.sequence]) warnings.push(`${strip.name}: block ${i + 1} plays sequence ${block.sequence}, which doesn't exist.`);
        return flatKey({ pose: block.sequence }, frames, srts[i], type, block.flat);
      }),
    };
  });

  // ---- The pause: the keeps-moving parts by their place in the rig's layers
  let idle: number[] | null = null;
  if (src.pause) {
    if (src.idle_nodes) idle = src.idle_nodes.slice();
    else {
      const setup = src.layers ?? src.bones.map((_, i) => i);
      const places = new Set<number>();
      for (const b of src.keeps_moving) {
        const at = setup.indexOf(b);
        if (at < 0) warnings.push(`${src.bones[b]?.name ?? b} keeps moving but isn't in the rig's layers: it pauses with the rest.`);
        else places.add(at);
      }
      idle = [...places].sort((a, b) => a - b);
    }
  }

  const rig: Rig = {
    format: 1, side: src.side, box: src.box, stop_flags: src.stop_flags, idle_parts: idle,
    pictures, tracks: tracks as Track[], poses, sequences,
    // (after the rest, as mcss_rig writes them)
    ...(src.kept?.info_padding !== undefined ? { info_padding: src.kept.info_padding } : {}),
    ...(src.kept?.obj_mapping !== undefined ? { obj_mapping: src.kept.obj_mapping } : {}),
    ...(src.kept?.extension !== undefined ? { extension: src.kept.extension } : {}),
    ...(src.kept?.picture_labels !== undefined ? { picture_labels: src.kept.picture_labels } : {}),
  };
  return { rig, warnings, shears, trackOf };
}

// ---------------------------------------------------------------- Converting a flat rig (a vanilla sprite)

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** A vanilla sprite's flat rig as a v2 source that bakes back to it byte for byte: each pose a sequence, each part's
 * keys as constant keyframes, one set of parts shared by the sequences (matched by the track's name without the
 * action's letter, head_a and head_b being one part, else by place in the pose), the stay sequence as the timeline,
 * the others as strips, the idle parts as keeps-moving parts. */
export function convertToV2(rig: Rig): V2 {
  // ---- The parts: one bone per part, shared by the poses
  interface Made { name: string; tracks: number[]; head?: Pair; firstPicture?: number }
  const bones: Made[] = [];
  /** owner[track] = the [pose, bone] whose lane bakes it */
  const owner = new Map<number, [number, number]>();
  const nodeBones: number[][] = [];
  rig.poses.forEach((pose, p) => {
    const used = new Map<number, number>(); // bone -> the track it plays in this pose
    const names = new Set(pose.parts.map((part) => partName(rig.tracks[part.track])));
    const here: number[] = [];
    pose.parts.forEach((part, k) => {
      const t = part.track;
      const name = partName(rig.tracks[t]);
      const free = (b: number) => !used.has(b) || used.get(b) === t;
      let b: number | undefined;
      const owned = owner.get(t);
      if (owned && free(owned[1])) b = owned[1];
      if (b === undefined) b = bones.findIndex((x, i) => x.name === name && free(i) && (!owned || !used.has(i)));
      if (b === undefined || b < 0) {
        // By place: the part at the same place in the first pose, if its name is nowhere in this pose
        const at = nodeBones[0]?.[k];
        if (p > 0 && at !== undefined && free(at) && !used.has(at) && !names.has(bones[at].name) && !owned) b = at;
      }
      if (b === undefined || b < 0) {
        b = bones.length;
        bones.push({ name, tracks: [] });
      }
      used.set(b, t);
      if (!owned) {
        owner.set(t, [p, b]);
        bones[b].tracks.push(t);
      }
      if (!bones[b].head) bones[b].head = part.pivot;
      if (bones[b].firstPicture === undefined) bones[b].firstPicture = rig.tracks[t].keys[0]?.picture;
      here.push(b);
    });
    nodeBones.push(here);
  });
  // Bones in the order of the tracks they play, so the usual track order (by sequence, then bone) is the original's
  const rank = bones.map((b, i) => [Math.min(...b.tracks, Infinity), i] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(([, i]) => i);
  const renumber = new Map(rank.map((old, n) => [old, n]));
  const boneNo = (old: number) => renumber.get(old)!;
  const ordered = rank.map((old) => bones[old]);
  // Names made unique for the editor's lists (the track names stay as they were, through the parts' own names)
  const taken = new Map<string, number>();
  const names = ordered.map((b) => {
    const n = (taken.get(b.name) ?? 0) + 1;
    taken.set(b.name, n);
    return n === 1 ? b.name : `${b.name} ${n}`;
  });

  const v2Bones: V2Bone[] = ordered.map((b, i) => {
    const head = (b.head ?? [0, 0]) as Pair;
    const picture = b.firstPicture !== undefined ? rig.pictures[b.firstPicture] : undefined;
    let tail: Pair = [head[0], head[1] - 8];
    const r = picture?.rectangles[0];
    if (r && r.size[0] && r.size[1]) {
      const mid: Pair = [Math.round(head[0] + r.at[0] + r.size[0] / 2), Math.round(head[1] - (r.at[1] - r.size[1] / 2))];
      if (mid[0] !== head[0] || mid[1] !== head[1]) tail = mid;
    }
    return { name: names[i], head, tail, parent: null, ...(b.firstPicture !== undefined ? { default: { piece: b.firstPicture } } : {}) };
  });

  // ---- Pieces: the pictures, named after the first part that shows them
  const pieceNames = rig.pictures.map((_, n) => {
    for (let t = 0; t < rig.tracks.length; t++) if (rig.tracks[t].keys.some((k) => k.picture === n)) return partName(rig.tracks[t]);
    return "piece";
  });
  const pieceTaken = new Map<string, number>();
  const pieces: V2Piece[] = rig.pictures.map((picture, n) => {
    const base = isBlank(picture) ? "blank" : pieceNames[n];
    const c = (pieceTaken.get(base) ?? 0) + 1;
    pieceTaken.set(base, c);
    let generated: Obj[] | null = null;
    try { generated = generateObjs({ rectangles: picture.rectangles, objs: [], obj_attribute: 0 }); } catch { generated = null; }
    return {
      name: c === 1 ? base : `${base} ${c}`, rectangles: picture.rectangles,
      ...(generated && sameJson(generated, picture.objs) ? {} : { objs: picture.objs }),
      ...(picture.obj_attribute ? { obj_attribute: picture.obj_attribute } : {}),
    };
  });

  // ---- Sequences: a pose each, its parts' tracks as lanes of constant keys
  const setupLayers = (nodeBones[0] ?? []).map(boneNo);
  const sequences: V2Sequence[] = rig.poses.map((pose, p) => {
    const lanes: Lane[] = [];
    const layers: Layer[] = pose.parts.map((part, k) => {
      const b = boneNo(nodeBones[p][k]);
      const own = owner.get(part.track)!;
      const layer: Layer = { bone: b };
      const head = v2Bones[b].head;
      if (part.pivot[0] !== head[0] || part.pivot[1] !== head[1]) layer.head = part.pivot;
      if (part.play !== "restart") layer.play = part.play;
      if (own[0] !== p || boneNo(own[1]) !== b) layer.track_of = [own[0], boneNo(own[1])];
      if (part.instance !== undefined) layer.instance = part.instance;
      if (part.flags !== undefined) layer.flags = part.flags;
      return layer;
    });
    for (const [t, [op, ob]] of [...owner].sort((a, b) => a[0] - b[0])) {
      if (op !== p) continue;
      lanes.push(laneOf(rig.tracks[t], boneNo(ob), p, v2Bones[boneNo(ob)]));
    }
    lanes.sort((a, b) => a.bone - b.bone);
    const frames = Math.max(0, ...lanes.map((l) => l.frames ?? 0));
    for (const lane of lanes) if (lane.frames === frames) delete lane.frames;
    const plainLayers = layers.every((l, k) => Object.keys(l).length === 1 && l.bone === setupLayers[k]) && layers.length === setupLayers.length;
    return {
      name: `Sequence ${p + 1}`, frames,
      ...(plainLayers ? {} : { layers }),
      ...(pose.instances !== undefined ? { instances: pose.instances } : {}),
      parts: lanes,
    };
  });

  // ---- Strips
  const stripOf = (seq: Rig["sequences"][number]): Strip => ({
    name: seq.name,
    ...(seq.play !== "loop" ? { play: seq.play } : {}),
    ...(seq.key_type !== "plain" ? { key_type: seq.key_type } : {}),
    ...(seq.loop_start !== undefined ? { loop_start: seq.loop_start } : {}),
    ...(seq.bank_type !== undefined ? { bank_type: seq.bank_type } : {}),
    blocks: seq.keys.map((k) => {
      const block: Block = { sequence: k.pose ?? 0 };
      if (k.frames !== sequences[k.pose ?? 0]?.frames) block.frames = k.frames;
      if (seq.key_type !== "plain" && (k.move?.[0] || k.move?.[1])) block.move = [k.move![0], k.move![1]];
      if (seq.key_type === "srt") {
        if (k.rotation) block.rotation = signedDegrees(k.rotation);
        if ((k.scale?.[0] ?? 1) !== 1 || (k.scale?.[1] ?? 1) !== 1) block.scale = [k.scale![0], k.scale![1]];
      }
      const extra: Record<string, number> = {};
      for (const x of ["unused", "marker", "result_copy"] as const) if (k[x] !== undefined) extra[x] = k[x]!;
      if (Object.keys(extra).length) block.flat = extra;
      return block;
    }),
  });

  const src: V2 = {
    format: 2, side: rig.side, step: STEP, curve: "constant",
    box: rig.box, stop_flags: rig.stop_flags,
    pause: rig.idle_parts !== null,
    keeps_moving: [],
    pieces, bones: v2Bones, layers: setupLayers, sequences,
    loop_clips: [],
    timeline: stripOf(rig.sequences[0]),
    ...(rig.sequences.length > 1 ? { strips: rig.sequences.slice(1).map(stripOf) } : {}),
  };
  // The idle parts as keeps-moving bones, where their places in the rig's layers give them back
  if (rig.idle_parts?.length) {
    const bonesIdle = rig.idle_parts.map((n) => setupLayers[n]);
    const back = [...new Set(bonesIdle.filter((b) => b !== undefined).map((b) => setupLayers.indexOf(b)))].sort((a, b) => a - b);
    if (bonesIdle.every((b) => b !== undefined) && sameJson(back, rig.idle_parts)) src.keeps_moving = [...new Set(bonesIdle)].sort((a, b) => a - b);
    else src.idle_nodes = rig.idle_parts.slice();
  }
  const kept: NonNullable<V2["kept"]> = {};
  for (const field of ["info_padding", "obj_mapping", "extension", "picture_labels"] as const) if (rig[field] !== undefined) (kept as Record<string, unknown>)[field] = rig[field];
  if (Object.keys(kept).length) src.kept = kept;
  // Tracks no pose plays, kept; and the tracks' order where the usual one isn't the original's
  const unplayed = rig.tracks.map((_, t) => t).filter((t) => !owner.has(t));
  if (unplayed.length) src.kept_tracks = unplayed.map((t) => rig.tracks[t]);
  const original: [number | null, number][] = rig.tracks.map((_, t) => {
    const own = owner.get(t);
    return own ? [own[0], boneNo(own[1])] : [null, unplayed.indexOf(t)];
  });
  const usual: [number | null, number][] = [];
  sequences.forEach((_, s) => v2Bones.forEach((_, b) => { if (original.some(([os, ob]) => os === s && ob === b)) usual.push([s, b]); }));
  unplayed.forEach((_, n) => usual.push([null, n]));
  if (!sameJson(original, usual)) src.track_order = original;
  return orderedV2(src);
}

/** A flat track as a lane of constant keys: one at each key's start, the turn in degrees unwrapped from the key before. */
function laneOf(track: Track, bone: number, sequence: number, b: V2Bone): Lane {
  let frame = 0;
  let turn = 0;
  const keys: V2Key[] = track.keys.map((key) => {
    const out: V2Key = { frame, piece: key.picture ?? 0 };
    if (track.key_type !== "plain") {
      const m = key.move ?? [0, 0];
      if (m[0] || m[1]) out.move = [m[0], m[1]];
    }
    if (track.key_type === "srt") {
      let d = signedDegrees(key.rotation ?? 0);
      while (d - turn > 180) d -= 360;
      while (d - turn < -180) d += 360;
      turn = d;
      if (d) out.rotation = d;
      const sc = key.scale ?? [1, 1];
      if (sc[0] !== 1 || sc[1] !== 1) out.scale = [sc[0], sc[1]];
    }
    const extra: Record<string, number> = {};
    for (const x of ["unused", "marker", "result_copy"] as const) if (key[x] !== undefined) extra[x] = key[x]!;
    if (Object.keys(extra).length) out.flat = extra;
    frame += key.frames;
    return out;
  });
  // A piece the key before already shows needn't be named again
  let shown: number | undefined = b.default?.piece;
  for (const k of keys) {
    if (k.piece === shown) delete k.piece;
    else shown = k.piece;
  }
  const lane: Lane = { bone, keys, frames: lengthOf(track) };
  if (track.name !== trackName(b, sequence)) lane.name = track.name;
  if (track.key_type !== "plain") lane.key_type = track.key_type;
  if (track.play !== "loop") lane.play = track.play;
  if (track.loop_start !== undefined) lane.loop_start = track.loop_start;
  if (track.bank_type !== undefined) lane.bank_type = track.bank_type;
  return lane;
}

// ---------------------------------------------------------------- The file's field order

const order = <T extends object>(o: T, fields: string[]): T => {
  const out: Record<string, unknown> = {};
  for (const f of fields) if ((o as Record<string, unknown>)[f] !== undefined) out[f] = (o as Record<string, unknown>)[f];
  for (const [k, v] of Object.entries(o)) if (!(k in out) && v !== undefined) out[k] = v;
  return out as T;
};
const KEY_FIELDS = ["frame", "piece", "hidden", "move", "rotation", "scale", "curve", "curves", "handles", "flat"];

/** A source with its fields in the file's order (the schema's). */
export function orderedV2(src: V2): V2 {
  const key = (k: V2Key) => order(k, KEY_FIELDS);
  return order({
    ...src,
    pieces: src.pieces.map((p) => order(p, ["name", "rectangles", "objs", "obj_attribute"])),
    bones: src.bones.map((b) => order({ ...b, ...(b.default ? { default: order(b.default, ["piece", "hidden", "move", "rotation", "scale"]) } : {}) },
                                      ["name", "head", "tail", "parent", "connected", "default"])),
    sequences: src.sequences.map((s) => order({
      ...s,
      ...(s.layers ? { layers: s.layers.map((l) => order(l, ["bone", "head", "play", "track_of", "instance", "flags"])) } : {}),
      parts: s.parts.map((l) => order({ ...l, keys: l.keys.map(key) }, ["bone", "name", "key_type", "play", "loop_start", "bank_type", "frames", "step", "clips", "keys"])),
    }, ["name", "frames", "step", "layers", "instances", "parts"])),
    ...(src.loop_clips ? { loop_clips: src.loop_clips.map((c) => order({ ...c, keys: c.keys.map(key) }, ["name", "frames", "step", "keys"])) } : {}),
  }, ["$schema", "format", "side", "step", "curve", "box", "stop_flags", "pause", "keeps_moving", "idle_nodes", "kept", "pieces", "bones", "layers",
      "sequences", "loop_clips", "timeline", "strips", "track_order", "kept_tracks"]);
}

// ---------------------------------------------------------------- A fresh source

/** An empty source for a side: no pieces or bones yet, one empty sequence on the timeline. Bakes only once it has a
 * bone (the game needs a part). */
export function emptyV2(side: "front" | "back"): V2 {
  return orderedV2({
    format: 2, side, step: STEP, box: { width: 0, height: 0, x: 0, y: 0 }, stop_flags: 0, pause: true, keeps_moving: [],
    pieces: [], bones: [], layers: [], sequences: [{ name: "Idle", frames: 60, parts: [] }], loop_clips: [],
    timeline: { name: "stay", blocks: [{ sequence: 0 }] },
  });
}

// ---------------------------------------------------------------- Shears and points, for the tests and the editor

/** Where a point of a bone's frame (pixels from its head, x right, y down) is on the sprite at a time of a sequence, as
 * the baked rig draws it: through the part's baked key and its pivot. */
export function bakedPoint(baked: BakedV2, src: V2, s: number, b: number, time: number, point: Pair): Pair {
  const t = baked.trackOf.get(`${s}/${b}`);
  if (t === undefined) throw new Error(`no track for ${s}/${b}`);
  const track = baked.rig.tracks[t];
  const k = keyAt(track, time).key;
  const srt: Srt = track.key_type === "srt" ? [k.rotation ?? 0, k.scale?.[0] ?? 1, k.scale?.[1] ?? 1, k.move?.[0] ?? 0, k.move?.[1] ?? 0]
    : track.key_type === "move" ? [0, 1, 1, k.move?.[0] ?? 0, k.move?.[1] ?? 0] : [0, 1, 1, 0, 0];
  const pivot = baked.rig.poses[s].parts.find((p) => p.track === t)?.pivot ?? headOf(src, b);
  const [x, y] = forward(point[0], -point[1], srt);
  return [x + pivot[0], -y + pivot[1]];
}

/** 65536ths of a turn from degrees, as the bake rounds them. */
export const turnOf = (degrees: number) => ((Math.round(degreesTo65536(degrees)) % 65536) + 65536) % 65536;
