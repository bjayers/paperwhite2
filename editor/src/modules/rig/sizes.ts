// The sizes of the five files a flat rig makes, uncompressed (what stays resident while the sprite is shown), as
// tools/paperwhite2/mcss_rig.py's files_from_rig writes them: a port of its layout, without the bytes, so the editor
// can show the size meter on every change without asking the server. The archive's compressed NANR isn't estimated
// here (rig_check.py measures it). tests/rig-v2.test.ts checks these against rig_check.py's.

import type { Rig, Track } from "./mcss.ts";

export interface Sizes {
  info: number;
  cells: number;
  animations: number;
  multi_cells: number;
  multi_animations: number;
  resident: number;
}

const align4 = (n: number) => (n + 3) & ~3;
const container = (blocks: number[]) => 16 + blocks.reduce((sum, b) => sum + 8 + b, 0);
const labels = (names: string[]) => names.length * 4 + names.reduce((sum, n) => sum + n.length + 1, 0);

/** An ABNK block's length: 24 bytes of header, 16 a sequence, 8 a key, then the results, shared where equal (and not a
 * kept copy), each a plain 2 bytes, a move 8 or an SRT 16 (those 4-aligned), each sequence's results 4-aligned. */
function bank(sequences: Track[], pointer: "picture" | "pose"): number {
  let results = 0;
  const pool = new Map<string, number>();
  let keys = 0;
  for (const seq of sequences) {
    results = align4(results);
    for (const key of seq.keys) {
      keys++;
      const raw = seq.key_type === "plain" ? `p${key[pointer]}`
        : seq.key_type === "srt" ? `s${key[pointer]},${key.rotation},${key.scale},${key.move}`
        : `m${key[pointer]},${key.unused ?? 0xbeef},${key.move}`;
      const copies = pool.get(raw) ?? 0;
      if ((key.result_copy ?? 0) === copies) {
        if (seq.key_type !== "plain") results = align4(results);
        results += seq.key_type === "plain" ? 2 : seq.key_type === "srt" ? 16 : 8;
        pool.set(raw, copies + 1);
      }
    }
  }
  return 24 + sequences.length * 16 + keys * 8 + align4(results);
}

export function rigSizes(rig: Rig): Sizes {
  const idle = rig.idle_parts ?? [];
  const padding = typeof rig.info_padding === "string" ? rig.info_padding.length / 2 : 4 - ((2 + idle.length) % 4);
  const info = 12 + rig.pictures.length * 48 + 2 + idle.length + padding;
  const objs = rig.pictures.reduce((n, p) => n + p.objs.length, 0);
  const cebk = 24 + rig.pictures.length * 8 + objs * 6;
  const names = rig.tracks.map((t) => t.name);
  const cellLabels = Array.isArray(rig.picture_labels) ? (rig.picture_labels as string[]) : names;
  const cells = container([align4(cebk), labels(cellLabels), 4]);
  const animations = container([bank(rig.tracks, "picture"), labels(names), 4]);
  const nodes = rig.poses.reduce((n, p) => n + p.parts.length, 0);
  const multi_cells = container([20 + rig.poses.length * 8 + nodes * 8]);
  const multi_animations = container([bank(rig.sequences, "pose"), labels(rig.sequences.map((s) => s.name))]);
  return { info, cells, animations, multi_cells, multi_animations, resident: info + cells + animations + multi_cells + multi_animations };
}

/** The ~40 KB a side should stay under unless it's tested on every screen (battle-sprites.md section 15.6). */
export const RESIDENT_GUIDANCE = 40 * 1024;
