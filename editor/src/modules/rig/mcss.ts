// A battle sprite's flat rig (res/pokemon/battle_sprite_rig.schema.json, <side>_rig.json) and MCSS's drawing of it, a
// port of tools/paperwhite2/mcss.py's render() (docs/paperwhite2/design/battle-sprites.md section 3.8), which
// tests/rig-render.test.ts proves pixel for pixel against the Python on several sprites and frames.
//
// For each part of the pose the sequence shows, back to front, each of its picture's rectangles (the second in front)
// is drawn through three movements: the part's track key (scale, turn, move), the part's pivot, then the sequence
// key's (the whole sprite's). A point (u, v) of a rectangle starts at (at.x + u, at.y - v), y up; pixels are sampled at
// their centres, nearest. Nothing here touches the DOM, so the tests and the editor run the same code.

// ---------------------------------------------------------------- The rig, as its JSON holds it

export type Pair = [number, number];
export type Play = "once" | "loop" | "pingpong" | "pingpong_loop";
export type KeyType = "plain" | "srt" | "move";

export interface Rectangle { sheet: Pair; size: Pair; at: Pair }
export interface Obj { x: number; y: number; size: Pair; tile: number; attributes: [number, number, number] }
export interface Picture { rectangles: Rectangle[]; objs: Obj[]; obj_attribute: number }
export interface Key {
  picture?: number;
  pose?: number;
  frames: number;
  rotation?: number;
  scale?: Pair;
  move?: Pair;
  unused?: number;
  marker?: number;
  result_copy?: number;
}
export interface Track { name: string; key_type: KeyType; play: Play; keys: Key[]; loop_start?: number; bank_type?: number }
export interface Part { track: number; pivot: Pair; play: "restart" | "continue"; instance?: number; flags?: number }
export interface Pose { parts: Part[]; instances?: number }
export type Sequence = Track;
export interface Rig {
  format: number;
  side: "front" | "back";
  box: { width: number; height: number; x: number; y: number };
  stop_flags: number;
  idle_parts: number[] | null;
  pictures: Picture[];
  tracks: Track[];
  poses: Pose[];
  sequences: Sequence[];
  [other: string]: unknown;
}

export const SHEET_WIDTH = 256;
export const SHEET_HEIGHT = 128;
export const FULL_TURN = 65536;

/** Whether a track or sequence of this play mode starts again at its end (2 and 4), or holds its last key. */
export const loops = (play: Play) => play === "loop" || play === "pingpong_loop";

export const lengthOf = (track: Track) => track.keys.reduce((n, k) => n + k.frames, 0);

// ---------------------------------------------------------------- Time

/** The key a track shows at a time, by its play mode, with its index and the time since it started (mcss.step_at). */
export function keyAt(track: Track, time: number): { key: Key; index: number; since: number } {
  if (!track.keys.length) throw new Error(`track ${track.name} has no keys`);
  const length = lengthOf(track);
  if (length === 0) return { key: track.keys[0], index: 0, since: 0 };
  let local = loops(track.play) ? time % length : Math.min(time, length - 1);
  for (let i = 0; i < track.keys.length; i++) {
    const key = track.keys[i];
    if (local < key.frames) return { key, index: i, since: local };
    local -= key.frames;
  }
  return { key: track.keys[track.keys.length - 1], index: track.keys.length - 1, since: 0 };
}

/** The sequence's key at a time and the time since it started (mcss.multi_frame_at). */
export function sequenceKeyAt(sequence: Sequence, time: number): { key: Key; index: number; since: number } {
  const length = lengthOf(sequence);
  let local = length && loops(sequence.play) ? time % length : Math.min(time, Math.max(length - 1, 0));
  for (let i = 0; i < sequence.keys.length; i++) {
    const key = sequence.keys[i];
    if (local < key.frames) return { key, index: i, since: local };
    local -= key.frames;
  }
  return { key: sequence.keys[sequence.keys.length - 1], index: sequence.keys.length - 1, since: 0 };
}

/** The battle's idle pause (BtlvMcss_IdleTask): the sequence stopped where it was, and only the idle parts' tracks
 * going on, `elapsed` frames since it began. */
export interface Idle { parts: ReadonlySet<number>; elapsed: number }

/** The time a part's track is at: from the sequence key's start for a part that restarts, else the sequence's time;
 * plus the pause's time for an idle part. */
export function partTime(part: Part, index: number, time: number, since: number, idle?: Idle): number {
  const base = part.play === "restart" ? since : time;
  return idle && idle.parts.has(index) ? base + idle.elapsed : base;
}

// ---------------------------------------------------------------- Movements

/** rotation (65536ths), scale x and y, move x and y (y down): one of the three movements of section 3.8. */
export type Srt = [number, number, number, number, number];

/** A key's movement as its type holds it: a plain key none, a move key a move. */
export function srtOf(key: Key, type: KeyType): Srt {
  if (type === "srt") return [key.rotation ?? 0, key.scale?.[0] ?? 1, key.scale?.[1] ?? 1, key.move?.[0] ?? 0, key.move?.[1] ?? 0];
  if (type === "move") return [0, 1, 1, key.move?.[0] ?? 0, key.move?.[1] ?? 0];
  return [0, 1, 1, 0, 0];
}

/** A point, y up, through a movement as MCSS applies it: scaled, turned (G3_RotZ(-sin, cos)), then moved (y down). */
export function forward(x: number, y: number, t: Srt): Pair {
  const [rot, sx, sy, mx, my] = t;
  x = x * sx;
  y = y * sy;
  const angle = rot / 65536 * 2 * Math.PI;
  const sin = -Math.sin(angle), cos = Math.cos(angle);
  return [x * cos - y * sin + mx, x * sin + y * cos - my];
}

/** An affine map (a, b, c, d, e, f): x' = a x + b y + e, y' = c x + d y + f. */
export type Affine = [number, number, number, number, number, number];

export function affineOf(t: Srt): Affine {
  const [rot, sx, sy, mx, my] = t;
  const angle = rot / 65536 * 2 * Math.PI;
  const sin = -Math.sin(angle), cos = Math.cos(angle);
  return [cos * sx, -sin * sy, sin * sx, cos * sy, mx, -my];
}

/** The movements one after another, as one map (in mcss.render's order of operations, so the floats agree). */
export function compose(transforms: Srt[]): Affine {
  let a = 1, b = 0, c = 0, d = 1, e = 0, f = 0;
  for (const t of transforms) {
    const [ta, tb, tc, td, te, tf] = affineOf(t);
    [a, b, c, d, e, f] = [ta * a + tb * c, ta * b + tb * d, tc * a + td * c, tc * b + td * d, ta * e + tb * f + te, tc * e + td * f + tf];
  }
  return [a, b, c, d, e, f];
}

// ---------------------------------------------------------------- A frame

export interface DrawnQuad {
  rectangle: Rectangle;
  /** Which rectangle of its picture (0 the first). */
  rectangleIndex: number;
  picture: number;
  /** The part's place in the pose, 0 the front. */
  part: number;
  track: number;
  keyIndex: number;
  /** Track key, pivot, sequence key. */
  transforms: [Srt, Srt, Srt];
}

export interface FrameState {
  pose: number;
  sequenceKey: number;
  /** The time since the sequence key started. */
  since: number;
  quads: DrawnQuad[];
}

/** The quads drawn at a time of a sequence, back to front (mcss.frame_quads). */
export function frameQuads(rig: Rig, sequence: number, time: number, idle?: Idle): FrameState {
  const seq = rig.sequences[sequence];
  const multi = sequenceKeyAt(seq, time);
  const pose = multi.key.pose ?? 0;
  const parts = rig.poses[pose]?.parts;
  if (!parts) throw new Error(`sequence ${sequence} shows pose ${pose}, past the ${rig.poses.length} poses`);
  const out: DrawnQuad[] = [];
  const whole = srtOf(multi.key, seq.key_type);
  for (let n = parts.length - 1; n >= 0; n--) {
    const part = parts[n];
    const track = rig.tracks[part.track];
    if (!track) throw new Error(`part ${n} plays track ${part.track}, past the ${rig.tracks.length} tracks`);
    const step = keyAt(track, partTime(part, n, time, multi.since, idle));
    const picture = step.key.picture ?? 0;
    if (picture >= rig.pictures.length) throw new Error(`a track shows picture ${picture}, past the ${rig.pictures.length} pictures`);
    const transforms: [Srt, Srt, Srt] = [srtOf(step.key, track.key_type), [0, 1, 1, part.pivot[0], part.pivot[1]], whole];
    rig.pictures[picture].rectangles.forEach((rectangle, k) => {
      // The bin holds a second quad only with a width (mcss.info_file)
      if (k > 0 && !rectangle.size[0]) return;
      out.push({ rectangle, rectangleIndex: k, picture, part: n, track: part.track, keyIndex: step.index, transforms });
    });
  }
  return { pose, sequenceKey: multi.index, since: multi.since, quads: out };
}

/** A quad's corners on the sprite (x right, y up from the feet): top left, top right, bottom left, bottom right. */
export function quadCorners(quad: DrawnQuad): Pair[] {
  const r = quad.rectangle;
  return ([[0, 0], [r.size[0], 0], [0, r.size[1]], [r.size[0], r.size[1]]] as Pair[]).map(([u, v]) => {
    let point: Pair = [r.at[0] + u, r.at[1] - v];
    for (const t of quad.transforms) point = forward(point[0], point[1], t);
    return point;
  });
}

/** x0, x1, y0, y1 of a quad's corners, y up. */
export function quadBox(quad: DrawnQuad): [number, number, number, number] {
  const corners = quadCorners(quad);
  return [Math.min(...corners.map((p) => p[0])), Math.max(...corners.map((p) => p[0])),
          Math.min(...corners.map((p) => p[1])), Math.max(...corners.map((p) => p[1]))];
}

/** Where a frame is drawn: width, height, and the feet's place from its top left. */
export interface Canvas { width: number; height: number; originX: number; originY: number }

export interface Frame extends Canvas {
  /** A palette index a pixel, rows from the top; 0 nothing. */
  pixels: Uint8Array;
  /** The part drawn at each pixel, +1 (0 nothing), for picking a part with the mouse. */
  owners?: Uint8Array;
}

/** A canvas holding boxes, with the margin mcss.render gives its own. */
export function canvasOf(boxes: [number, number, number, number][]): Canvas {
  if (!boxes.length) return { width: 1, height: 1, originX: 0, originY: 0 };
  const left = Math.floor(Math.min(...boxes.map((b) => b[0]))) - 1;
  const right = Math.ceil(Math.max(...boxes.map((b) => b[1]))) + 1;
  const bottom = Math.floor(Math.min(...boxes.map((b) => b[2]))) - 1;
  const top = Math.ceil(Math.max(...boxes.map((b) => b[3]))) + 1;
  return { width: right - left, height: top - bottom, originX: -left, originY: top };
}

/** Draws a frame as palette indices (mcss.render): on the canvas given, or by default on the frame's own bounds. */
export function render(rig: Rig, sheet: Uint8Array, sequence = 0, time = 0, canvas?: Canvas, idle?: Idle,
                       options: { owners?: boolean } = {}): Frame {
  const { quads } = frameQuads(rig, sequence, time, idle);
  const boxes = quads.map(quadBox);
  const c = canvas ?? canvasOf(boxes);
  if (!canvas && !boxes.length) return { ...c, pixels: new Uint8Array(1) };
  const { width, height, originX, originY } = c;
  const pixels = new Uint8Array(width * height);
  const owners = options.owners ? new Uint8Array(width * height) : undefined;
  quads.forEach((quad, q) => {
    const [x0, x1, y0, y1] = boxes[q];
    const [a, b, cc, d, e, f] = compose(quad.transforms);
    const det = a * d - b * cc;
    if (!det) return;
    const ia = d / det, ib = -b / det, ic = -cc / det, id = a / det;
    const r = quad.rectangle;
    const [qx, qy] = r.at;
    const [w, h] = r.size;
    const [s0, t0] = r.sheet;
    for (let y = Math.floor(y0); y < Math.ceil(y1) + 1; y++) {
      const row = originY - y - 1;
      if (row < 0 || row >= height) continue;
      const py = y + 0.5 - f;
      for (let x = Math.floor(x0); x < Math.ceil(x1) + 1; x++) {
        const column = originX + x;
        if (column < 0 || column >= width) continue;
        const px = x + 0.5 - e;
        const u = ia * px + ib * py - qx, v = qy - (ic * px + id * py);
        if (u >= 0 && u < w && v >= 0 && v < h) {
          const s = Math.trunc(s0 + u), t = Math.trunc(t0 + v);
          if (s >= 0 && s < SHEET_WIDTH && t >= 0 && t < SHEET_HEIGHT) {
            const index = sheet[t * SHEET_WIDTH + s];
            if (index) {
              pixels[row * width + column] = index;
              if (owners) owners[row * width + column] = quad.part + 1;
            }
          }
        }
      }
    }
  });
  return { ...c, pixels, owners };
}

/** A canvas that holds every frame of a sequence's loop (and the box and the feet), with a margin, so the preview
 * doesn't jump. */
export function loopCanvas(rig: Rig, sequence: number, margin = 8): Canvas {
  const boxes: [number, number, number, number][] = [[-8, 8, 0, 8]];
  const length = lengthOf(rig.sequences[sequence]) || 1;
  const step = Math.max(1, Math.ceil(length / 600));
  try {
    for (let t = 0; t < length; t += step) for (const quad of frameQuads(rig, sequence, t).quads) boxes.push(quadBox(quad));
  } catch {
    // (a rig with errors: the frames that can be drawn)
  }
  const c = canvasOf(boxes);
  return { width: c.width + 2 * margin, height: c.height + 2 * margin, originX: c.originX + margin, originY: c.originY + margin };
}
