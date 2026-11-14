// The build's rig checks (tools/paperwhite2/mcss_rig.py check, through the rig-check route) in the new Rig Editor's
// words: what is wrong in terms of its pieces, sequences, timeline and parts, and what to do about it. The check speaks
// of the flat rig the bake writes (pictures, poses, the game's sequences); a v2 source maps them back: picture n is
// piece n (the blank one after them), pose n is sequence n, the game's sequence 0 is the timeline and 1 on the strips
// (1 the battle's stop strip). A message it doesn't know is shown as the check gives it, with what to try.

import type { V2 } from "./v2.ts";

const pieceName = (src: V2 | null, n: number) => (src?.pieces[n] ? `Piece ${src.pieces[n].name}` : `Picture ${n}`);
const sequenceName = (src: V2 | null, n: number) => (src?.sequences[n] ? `Sequence ${src.sequences[n].name}` : `Sequence ${n + 1}`);
/** The game's sequence n: the timeline (0), the stop strip (1) or another strip. */
const stripName = (src: V2 | null, n: number, name: string) =>
  (n === 0 ? "The timeline (the battle's loop)" : n === 1 ? `The stop strip (${name}, the battle's pause)` : `The strip ${name}`);

const RULES: [RegExp, (src: V2 | null, m: RegExpMatchArray) => string][] = [
  [/^sequence (\d+) \((.*)\) has no keys$/, (src, m) => (Number(m[1]) === 0
    ? "Nothing is on the timeline (the battle's loop). Add a sequence to it in Timeline mode."
    : `${stripName(src, Number(m[1]), m[2])} plays nothing. Delete and re-add a sequence, or undo the change that emptied it.`)],
  [/^sequence (\d+) \((.*)\) lasts no frames$/, (src, m) => `${stripName(src, Number(m[1]), m[2])} lasts no frames: give its sequences a length (Sequences mode, Sequence section).`],
  [/^sequence (\d+) \((.*)\): .* show pose ([\d, ]+), past the (\d+) poses/, (src, m) => `${stripName(src, Number(m[1]), m[2])} plays a sequence that no longer exists. Take its clip off the timeline.`],
  [/^the rig has no pictures$/, () => "The rig has no pieces. Cut one on the sheet in Rig setup (drag on the sheet) and give it a bone."],
  [/^the rig has no poses$/, () => "The rig has no sequences. Add one with + Sequence in Sequences mode."],
  [/^the rig has no sequences/, () => "Nothing is on the timeline (the battle's loop). Add a sequence to it in Timeline mode."],
  [/^pose (\d+) has (\d+) parts; .* at most (\d+)$/, (src, m) => `${sequenceName(src, Number(m[1]))} draws ${m[2]} parts; the game draws at most ${m[3]}. Delete some bones, or join pieces.`],
  [/^picture (\d+)'s rectangle (\d+) .*reaches past the sheet's mirrored copy$/, (src, m) => `${pieceName(src, Number(m[1]))}'s ${m[2] === "1" ? "first" : "second"} rectangle reaches past the sheet. Move or resize it on the sheet (Rig setup).`],
  [/^picture (\d+)'s rectangle (\d+) has a negative size$/, (src, m) => `${pieceName(src, Number(m[1]))}'s ${m[2] === "1" ? "first" : "second"} rectangle has a negative size. Resize it on the sheet.`],
  [/^picture (\d+)'s rectangle 2 has no width or height/, (src, m) => `${pieceName(src, Number(m[1]))}'s second rectangle is empty. Give it a size or remove it.`],
  [/^picture (\d+) has (\d+) rectangles/, (src, m) => `${pieceName(src, Number(m[1]))} has ${m[2]} rectangles; the game draws one or two. Remove the others.`],
  [/^picture (\d+)'s OBJ (\d+) is .*, not an OBJ size$/, (src, m) => `${pieceName(src, Number(m[1]))} can't be cut into the DS's sprite sizes. Resize it in whole tiles (8 pixels).`],
  [/^idle part (\d+) is past the poses' parts/, () => "A keeps-moving part isn't one the sequences draw. Turn its Keeps moving off in Timeline mode (Battle pause)."],
  [/^track (\d+) \((.*)\)'s key (\d+) moves out of range$/, (_src, m) => `The part ${m[2]} moves out of range (more than 32,767 pixels). Look for a key with a huge move.`],
  [/^track (\d+) \((.*)\)'s key (\d+) has a scale out of range$/, (_src, m) => `The part ${m[2]} is scaled out of range (beyond ±127). Look for a key with a huge scale.`],
  [/^the box's size is out of range$/, () => "The sprite's box is out of range."],
];

/** One of the check's errors in the editor's words, with what to do. */
export function checkText(message: string, src: V2 | null): string {
  for (const [re, say] of RULES) {
    const m = message.match(re);
    if (m) return say(src, m);
  }
  return `The game's check refuses it: ${message}. Undo the last change, or look at what it names in the rig.`;
}
