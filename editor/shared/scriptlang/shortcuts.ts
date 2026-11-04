// The script language's shortcuts (docs/paperwhite2/design/script-language.md, Messages): a message window shown,
// waited for and closed, as one call. Each is the sequence the game's scripts use for that window, so their lines read
// back as the shortcut: say(line) is ParentActorMsg MSGFILE_SCRIPT, line, 0, 0, then LastKeyWait and ActorMsgClose.
// Arguments after the line take the game's most common value where they're left out, and show only where they differ.

export interface Shortcut {
  name: string;
  /** The message's macro, and the arguments it must have (by index) for its lines to be the shortcut. */
  macro: string;
  fixed: Record<number, string>;
  /** The shortcut's arguments in order: each the macro's argument it fills, and its value when left out. */
  params: { arg: number; name: string; default?: string }[];
  /** The commands after it, in order, with no arguments. */
  after: string[];
  description: string;
}

export const SHORTCUTS: Shortcut[] = [
  { name: "say", macro: "ParentActorMsg", fixed: { 0: "MSGFILE_SCRIPT" }, after: ["LastKeyWait", "ActorMsgClose"],
    params: [{ arg: 1, name: "line" }, { arg: 2, name: "p2", default: "0" }, { arg: 3, name: "box_type", default: "0" }],
    description: "The talk window of the NPC the player talked to, with the line; waits for a key and closes it" },
  { name: "say_npc", macro: "ActorMsg", fixed: { 0: "MSGFILE_SCRIPT" }, after: ["LastKeyWait", "ActorMsgClose"],
    params: [{ arg: 2, name: "npc" }, { arg: 1, name: "line" }, { arg: 3, name: "p3", default: "0" }, { arg: 4, name: "box_type", default: "0" }],
    description: "A talk window from an NPC (by its id), with the line; waits for a key and closes it" },
  { name: "say_event", macro: "SystemMsg", fixed: {}, after: ["LastKeyWait", "SystemMsgClose"],
    params: [{ arg: 0, name: "line" }, { arg: 1, name: "position", default: "2" }],
    description: "The grey event window, with the line; waits for a key and closes it" },
  { name: "say_bubble", macro: "InfoMsg", fixed: {}, after: ["LastKeyWait", "InfoMsgClose"],
    params: [{ arg: 0, name: "line" }, { arg: 1, name: "position", default: "2" }],
    description: "The bubble window, with the line; waits for a key and closes it" },
  { name: "say_sign", macro: "MsgPlaceSign", fixed: {}, after: ["MsgPlaceSignClose"],
    params: [{ arg: 0, name: "line" }, { arg: 1, name: "position", default: "2" }],
    description: "The bordered sign window, with the line (it waits for a key itself); closes it" },
];

export const SHORTCUT_NAMES = new Map(SHORTCUTS.map((s) => [s.name, s]));

/** A shortcut's arguments from its message's (the trailing ones left out where they're their defaults), or null where
 * the message isn't the shortcut's. */
export function shortcutArgs(s: Shortcut, args: string[]): string[] | null {
  for (const [i, text] of Object.entries(s.fixed)) if (args[Number(i)] !== text) return null;
  if (args.length !== Math.max(...s.params.map((p) => p.arg), ...Object.keys(s.fixed).map(Number)) + 1) return null;
  const out = s.params.map((p) => args[p.arg]);
  while (out.length > 1) {
    const p = s.params[out.length - 1];
    if (p.default === undefined || out[out.length - 1] !== p.default) break;
    out.pop();
  }
  return out;
}

/** A shortcut's message's arguments from the shortcut's (the left-out ones their defaults); a message on error. */
export function messageArgs(s: Shortcut, given: string[]): string[] | string {
  const required = s.params.filter((p) => p.default === undefined).length;
  if (given.length < required || given.length > s.params.length) {
    return `${s.name} takes ${required === s.params.length ? required : `${required} to ${s.params.length}`} arguments`;
  }
  const args: string[] = [];
  for (const [i, text] of Object.entries(s.fixed)) args[Number(i)] = text;
  s.params.forEach((p, n) => { args[p.arg] = n < given.length ? given[n] : p.default!; });
  return args;
}
