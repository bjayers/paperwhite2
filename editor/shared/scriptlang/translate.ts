// A script's block of a .s file translated to the script language and back (docs/paperwhite2/design/script-language.md).
//
// To the language: the block's lines become statements one by one (a command as its name and arguments, a jump as a
// goto, a condition and its conditional jump as an if-goto, data and directives as asm), then the if-gotos become if
// and else where the jumps lay them out so: `if (!c) goto L; T; goto K; L: E; K:` is `if (c) { T } else { E }`. Labels
// that something else still jumps to stay. Nothing moves: the block's commands keep their order, so it compiles to the
// same layout.
//
// Back: each statement its lines, a condition always as the stack's pushes and VMStackCmp with VMJumpIf CMP_STACK
// (which jumps when the condition is false, Scrcmd_Vm_VMJumpIf), an if and its else with new labels.

import { MENUS, isVarText, negate, splitTop, type AssignOp, type CmpOp, type Expr, type Script, type Stmt, type Sub } from "./lang.ts";
import { parseS, type SLine } from "./sfile.ts";
import { SHORTCUTS, SHORTCUT_NAMES, messageArgs, shortcutArgs } from "./shortcuts.ts";
import { showValue, storeValue, type ValueContext } from "./values.ts";

/** An argument of a command, as the command reference (res/paperwhite2/scripts/commands.json) has it. */
export interface RefArg {
  name: string;
  /** How the command reads it: a number, a variable, or either (any: from 0x4000 a variable). */
  type: "u8" | "u16" | "u32" | "var" | "any";
  kind: string;
  description?: string;
}

export interface RefCommand {
  op: number;
  macro: string;
  name: string;
  aliases?: string[];
  frost?: string;
  handler?: string;
  description?: string;
  args: RefArg[];
}

/** A movement action (res/paperwhite2/scripts/movements.json): a Move's action code and its name. */
export interface RefMovement {
  code: number;
  name: string;
  description?: string;
}

/** A named global script (res/paperwhite2/scripts/globals.json): a call sets its inputs' variables and calls it. */
export interface RefGlobal {
  name: string;
  script: number;
  inputs: { name: string; var: string; kind?: string; description?: string }[];
  result?: string;
  description?: string;
}

/** The language's names for the commands (the command reference's, or a macro's in lowercase with underscores where
 * it has none) and back, each name or alias to its macro, and the named globals. */
export class Names {
  readonly toLang = new Map<string, string>();
  readonly toMacro = new Map<string, string>();
  readonly commands = new Map<string, RefCommand>();
  readonly globals = new Map<string, RefGlobal>();
  /** The movement actions' names by code and back (res/paperwhite2/scripts/movements.json). */
  readonly movementNames = new Map<number, string>();
  readonly movementCodes = new Map<string, number>();
  readonly movements = new Map<string, RefMovement>();

  constructor(macros: Iterable<string>, reference: RefCommand[] = [], globals: RefGlobal[] = [], movements: RefMovement[] = []) {
    for (const m of movements) {
      this.movementNames.set(m.code, m.name);
      this.movementCodes.set(m.name, m.code);
      this.movements.set(m.name, m);
    }
    for (const c of reference) {
      this.commands.set(c.macro, c);
      this.toLang.set(c.macro, c.name);
      for (const n of [c.name, ...(c.aliases ?? [])]) if (!this.toMacro.has(n)) this.toMacro.set(n, c.macro);
    }
    for (const m of macros) {
      if (this.toLang.has(m)) continue;
      const name = snake(m);
      // (the first macro keeps a name two would share)
      if (this.toMacro.has(name)) continue;
      this.toLang.set(m, name);
      this.toMacro.set(name, m);
    }
    for (const g of globals) this.globals.set(g.name, g);
  }
}

export const snake = (name: string) =>
  name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2").toLowerCase();

/** The macros' names in include/asm/field_script.inc's text. */
export function macroNames(inc: string): string[] {
  return [...inc.matchAll(/^\s*\.macro\s+(\w+)/gm)].map((m) => m[1]);
}

const STACK_OPS = new Set(["VMStackPush", "VMStackPushConst", "VMStackPushFlag", "VMStackCmp", "VMStackAdd", "VMStackSub", "VMStackMul", "VMStackDiv"]);
const CMP_NAMES: Record<string, number> = { CMP_LT: 0, CMP_EQ: 1, CMP_GT: 2, CMP_LE: 3, CMP_GE: 4, CMP_NE: 5, CMP_OR: 6, CMP_AND: 7, CMP_STACK: 0xff };
const CMP_OPS: CmpOp[] = ["<", "==", ">", "<=", ">=", "!="];
const OP_NAMES: Record<CmpOp, string> = { "<": "CMP_LT", "==": "CMP_EQ", ">": "CMP_GT", "<=": "CMP_LE", ">=": "CMP_GE", "!=": "CMP_NE" };
const ARITH: Record<string, "+" | "-" | "*" | "/"> = { VMStackAdd: "+", VMStackSub: "-", VMStackMul: "*", VMStackDiv: "/" };
const ARITH_MACROS = { "+": "VMStackAdd", "-": "VMStackSub", "*": "VMStackMul", "/": "VMStackDiv" } as const;
/** Commands after which nothing runs on. */
export const TERMINATORS = new Set(["VMHalt", "VMReturn", "RTEndGlobal"]);
/** The commands of data (a movement's, a map script table's), which a label before them starts. */
const DATA_COMMANDS = new Set(["Move", "MoveEnd", "MapScript", "MapScriptConditions", "MapScriptsEnd"]);

/** The variable commands that read as assignments, and back. */
const ASSIGNS: Record<string, AssignOp> = { WorkAdd: "+=", WorkSub: "-=", WorkMul: "*=", WorkDiv: "/=", WorkMod: "%=" };
const ASSIGN_MACROS: Record<AssignOp, string> = { "=": "WorkSetConst", "+=": "WorkAdd", "-=": "WorkSub", "*=": "WorkMul", "/=": "WorkDiv", "%=": "WorkMod" };

/** An argument as the language shows it: a variable's as var(X), where the command reads one (its type var, or any
 * with a variable's number). */
function showArg(text: string, type: RefArg["type"] | undefined): string {
  return type === "var" || (type === "any" && isVarText(text)) ? `var(${text})` : text;
}

/** An argument as the .s has it: var(X) is X. */
export function plainArg(text: string): string {
  const m = /^var\((.*)\)$/.exec(text.trim());
  return m ? m[1].trim() : text.trim();
}

/** A named global's call, where lines from first set its inputs' variables in its order (WorkSetConst, or WorkGet for
 * another variable), none for one without inputs, and then call it: the call and the last line, or null. */
function globalCall(lines: SLine[], first: number, end: number, names: Names): { stmt: Stmt; last: number } | null {
  const sets: { var: string; value: string }[] = [];
  let i = first;
  for (; i < end; i++) {
    const l = lines[i];
    if (l.kind !== "cmd") return null;
    if ((l.name === "WorkSetConst" || l.name === "WorkGet") && l.args.length === 2) {
      sets.push({ var: l.args[0], value: l.name === "WorkGet" ? `var(${l.args[1]})` : l.args[1] });
      continue;
    }
    break;
  }
  const call = lines[i];
  // (a global without inputs is its call alone)
  if (call?.kind !== "cmd" || call.name !== "RTCallGlobal" || call.args.length !== 1) return null;
  const script = Number(call.args[0]);
  for (const g of names.globals.values()) {
    if (g.script !== script || g.inputs.length !== sets.length) continue;
    if (g.inputs.every((input, k) => parseInt(input.var, 16) === parseInt(sets[k].var, 16) && /^0x/i.test(sets[k].var))) {
      return { stmt: { k: "call", name: g.name, args: sets.map((s) => s.value) }, last: i };
    }
  }
  return null;
}

const cmpOf = (arg: string): number | undefined => (arg in CMP_NAMES ? CMP_NAMES[arg] : /^\d+$/.test(arg) ? Number(arg) : undefined);

/** A condition from a run of stack commands, from first, that a VMJumpIf CMP_STACK ends: the condition and the
 * jump's line, or null where the run isn't one condition. */
function stackCondition(lines: SLine[], first: number, end: number): { expr: Expr; jump: number } | null {
  const stack: Expr[] = [];
  for (let i = first; i < end; i++) {
    const l = lines[i];
    if (l.kind !== "cmd") return null;
    if (!STACK_OPS.has(l.name)) {
      if (l.name === "VMJumpIf" && l.args[0] === "CMP_STACK" && stack.length === 1) return { expr: stack[0], jump: i };
      return null;
    }
    switch (l.name) {
      case "VMStackPush": stack.push({ k: "var", text: l.args[0] }); break;
      case "VMStackPushConst": stack.push({ k: "const", text: l.args[0] }); break;
      case "VMStackPushFlag": stack.push({ k: "flag", arg: l.args[0] }); break;
      case "VMStackCmp": {
        const op = cmpOf(l.args[0]);
        const r = stack.pop();
        const left = stack.pop();
        if (op === undefined || op > 7 || !r || !left) return null;
        stack.push(op === 6 ? { k: "or", l: left, r } : op === 7 ? { k: "and", l: left, r } : { k: "cmp", op: CMP_OPS[op], l: left, r });
        break;
      }
      default: {
        const r = stack.pop();
        const left = stack.pop();
        if (!r || !left) return null;
        stack.push({ k: "arith", op: ARITH[l.name], l: left, r });
      }
    }
  }
  return null;
}

/** Whether a label starts data: the command after it (past other lines) is a data command. */
function startsData(lines: SLine[], at: number, end: number): boolean {
  for (let i = at + 1; i < end; i++) {
    const l = lines[i];
    if (l.kind === "label") return false;
    if (l.kind === "cmd") return DATA_COMMANDS.has(l.name);
    // (or bytes: a table a command reads)
    if (/^\s*\.(byte|2byte|4byte|word|hword)\b/.test(l.text)) return true;
  }
  return false;
}

/** The statements of lines [start, end), one by one, before structuring. */
export function flatStatements(lines: SLine[], start: number, end: number, names: Names): Stmt[] {
  const out: Stmt[] = [];
  // (after data or an alignment without a label, up to the next label: nothing can jump into it)
  let inData = false;
  for (let i = start; i < end; i++) {
    const l = lines[i];
    if (l.kind === "label") inData = false;
    if (l.kind === "other") {
      const t = l.text.trim();
      const alias = ALIAS_LINE.exec(t);
      if (!t) out.push({ k: "blank" });
      else if (alias) out.push({ k: "alias", name: alias[1], value: alias[2] });
      else if (/^\.(balign|byte|2byte|4byte|word|hword)\b/.test(t)) { out.push({ k: "raw", lines: [l.text] }); inData = true; }
      else if (t.startsWith("//")) out.push({ k: "comment", text: t });
      else out.push({ k: "raw", lines: [l.text] });
      continue;
    }
    if (l.kind === "label") {
      // Data, with the labels in it, as it is, up to a label of code
      if (startsData(lines, i, end)) {
        const raw = [l.text];
        let j = i + 1;
        for (; j < end; j++) {
          const m = lines[j];
          if (m.kind === "label" && !startsData(lines, j, end)) break;
          raw.push(m.text);
        }
        out.push({ k: "raw", lines: raw });
        i = j - 1;
        continue;
      }
      out.push({ k: "label", name: l.name });
      continue;
    }
    // (a data command is data, with or without its label)
    if (DATA_COMMANDS.has(l.name) || inData) {
      out.push({ k: "raw", lines: [l.text] });
      inData = true;
      continue;
    }
    if (l.name === "VMJump" && l.args.length === 1) {
      out.push({ k: "goto", target: l.args[0] });
      continue;
    }
    // A routine called: by its label's name, NAME();
    if (l.name === "VMCall" && l.args.length === 1 && /^[A-Za-z_]\w*$/.test(l.args[0]) && !names.toMacro.has(l.args[0])) {
      out.push({ k: "call", name: l.args[0], args: [] });
      continue;
    }
    if (STACK_OPS.has(l.name)) {
      const cond = stackCondition(lines, i, end);
      if (cond) {
        // (it jumps when the condition is false)
        out.push({ k: "ifgoto", cond: negate(cond.expr), target: lines[cond.jump].kind === "cmd" ? (lines[cond.jump] as { args: string[] }).args[1] : "" });
        i = cond.jump;
        continue;
      }
    }
    if (l.name === "WorkSetConst" || l.name === "WorkGet" || l.name === "RTCallGlobal") {
      const g = globalCall(lines, i, end, names);
      if (g) {
        out.push(g.stmt);
        i = g.last;
        continue;
      }
    }
    // The variable commands as assignments
    if ((l.name === "WorkSetConst" || l.name === "WorkGet") && l.args.length === 2) {
      out.push({ k: "assign", target: l.args[0], op: "=", value: l.name === "WorkGet" ? `var(${l.args[1]})` : l.args[1] });
      continue;
    }
    if (l.name in ASSIGNS && l.args.length === 2) {
      out.push({ k: "assign", target: l.args[0], op: ASSIGNS[l.name], value: showArg(l.args[1], "any") });
      continue;
    }
    if ((l.name === "WorkCmpConst" || l.name === "WorkCmpWork") && l.args.length === 2) {
      // Its jumps after it, each on its comparison
      const left: Expr = { k: "var", text: l.args[0] };
      const right: Expr = l.name === "WorkCmpConst" ? { k: "const", text: l.args[1] } : { k: "var", text: l.args[1] };
      let j = i + 1;
      const jumps: Stmt[] = [];
      for (; j < end; j++) {
        const m = lines[j];
        if (m.kind !== "cmd" || m.name !== "VMJumpIf" || m.args.length !== 2) break;
        const op = cmpOf(m.args[0]);
        if (op === undefined || op > 5) break;
        jumps.push({ k: "ifgoto", cond: { k: "cmp", op: CMP_OPS[op], l: left, r: right }, target: m.args[1] });
      }
      if (jumps.length) {
        out.push(...jumps);
        i = j - 1;
        continue;
      }
    }
    // A message window shown, waited for and closed, as its shortcut
    const shortcut = SHORTCUTS.find((sc) => sc.macro === l.name && sc.after.every((m, n) => {
      const next = lines[i + 1 + n];
      return next?.kind === "cmd" && next.name === m && !next.args.length;
    }));
    const shortArgs = shortcut ? shortcutArgs(shortcut, l.args) : null;
    if (shortcut && shortArgs) {
      out.push({ k: "call", name: shortcut.name, args: shortArgs });
      i += shortcut.after.length;
      continue;
    }
    const name = names.toLang.get(l.name);
    const ref = names.commands.get(l.name);
    if (!name) out.push({ k: "raw", lines: [l.text] });
    else out.push({ k: "call", name, args: l.args.map((a, n) => showArg(a, ref?.args[n]?.type)) });
  }
  return out;
}

/** An alias's line in the .s: a comment, as the .s has no place for one. */
const ALIAS_LINE = /^\/\/@ alias ([A-Za-z_]\w*) = (.+?)\s*$/;

/** The aliases of a file's lines, outside lines [skipFrom, skipTo): each name's value as written. */
export function fileAliases(lines: SLine[], skipFrom = 0, skipTo = 0): Map<string, string> {
  const out = new Map<string, string>();
  lines.forEach((l, i) => {
    const m = l.kind === "other" && (i < skipFrom || i >= skipTo) ? ALIAS_LINE.exec(l.text.trim()) : null;
    if (m) out.set(m[1], m[2]);
  });
  return out;
}

/** How many times each label is called as a routine (VMCall), through a file's lines. */
export function callUses(lines: SLine[]): Map<string, number> {
  const calls = new Map<string, number>();
  for (const l of lines) if (l.kind === "cmd" && l.name === "VMCall" && l.args.length === 1) calls.set(l.args[0], (calls.get(l.args[0]) ?? 0) + 1);
  return calls;
}

/** How many times each label is named, in jumps and in arguments, through a file's lines. */
export function labelUses(lines: SLine[]): Map<string, number> {
  const uses = new Map<string, number>();
  for (const l of lines) {
    if (l.kind !== "cmd") continue;
    for (const a of l.args) if (/^[A-Za-z_]\w*$/.test(a)) uses.set(a, (uses.get(a) ?? 0) + 1);
  }
  return uses;
}

/** The if-gotos made if and else where the jumps lay them out so. uses counts the jumps to each label still left;
 * exit is the label the statements run on into, after their end (none at the block's top): a jump to it at a part's
 * end is no jump, so `if (!c) goto L; T; goto exit; L: E` there is an if and an else too (else if chains). */
function structure(stmts: Stmt[], uses: Map<string, number>, exit?: string): Stmt[] {
  const out: Stmt[] = [];
  const labelAt = (name: string, from: number) => {
    for (let j = from; j < stmts.length; j++) { const s = stmts[j]; if (s.k === "label" && s.name === name) return j; }
    return -1;
  };
  const used = (name: string) => uses.set(name, (uses.get(name) ?? 1) - 1);
  for (let i = 0; i < stmts.length; i++) {
    const s = stmts[i];
    if (s.k !== "ifgoto") { out.push(s); continue; }
    const j = labelAt(s.target, i + 1);
    if (j < 0) { out.push(s); continue; }
    used(s.target);
    const then = stmts.slice(i + 1, j);
    // (its last statement past blank lines and comments)
    let at = then.length - 1;
    while (at >= 0 && (then[at].k === "blank" || then[at].k === "comment")) at--;
    const last = then[at];
    // An else: the then part jumps past a part after the label, to a label after it or to where these run on
    if (last?.k === "goto") {
      const k = labelAt(last.target, j + 1);
      if (k >= 0 || last.target === exit) {
        const end = k >= 0 ? k : stmts.length;
        used(last.target);
        const elseFrom = (uses.get(s.target) ?? 0) > 0 ? j : j + 1;
        const body = [...then.slice(0, at), ...then.slice(at + 1)];
        out.push({ k: "if", cond: negate(s.cond), then: structure(body, uses, last.target),
                   else: structure(stmts.slice(elseFrom, end), uses, last.target) });
        // (the end's label stays where something else jumps to it)
        i = k >= 0 && (uses.get(last.target) ?? 0) > 0 ? k - 1 : end;
        continue;
      }
    }
    out.push({ k: "if", cond: negate(s.cond), then: structure(then, uses, s.target) });
    i = (uses.get(s.target) ?? 0) > 0 ? j - 1 : j;
  }
  chain(out, uses, exit);
  // A jump to where they run on, at their end, is none
  let at = out.length - 1;
  while (at >= 0 && (out[at].k === "blank" || out[at].k === "comment")) at--;
  const last = out[at];
  if (exit && last?.k === "goto" && last.target === exit) {
    used(exit);
    out.splice(at, 1);
  }
  return out;
}

/** The ifs made to read as they mean, in place: one with nothing to do and an else is the else on the condition's
 * negation; one that does its part and jumps to a label further on has what's between as its else
 * (`if (c) { A; goto K; } B K:` is `if (c) { A } else { B } K:`, and so where K is exit, where they run on), so a
 * chain of them is else if after else if. */
function chain(stmts: Stmt[], uses: Map<string, number>, exit?: string) {
  const real = (list: Stmt[]) => list.filter((s) => s.k !== "blank" && s.k !== "comment");
  for (let i = stmts.length - 1; i >= 0; i--) {
    const s = stmts[i];
    if (s.k !== "if") continue;
    if (s.else && !real(s.then).length) stmts[i] = { k: "if", cond: negate(s.cond), then: s.else };
  }
  for (let i = 0; i < stmts.length; i++) {
    const s = stmts[i];
    if (s.k !== "if" || s.else) continue;
    let at = s.then.length - 1;
    while (at >= 0 && (s.then[at].k === "blank" || s.then[at].k === "comment")) at--;
    const last = s.then[at];
    if (last?.k !== "goto") continue;
    let m = -1;
    for (let j = i + 1; j < stmts.length; j++) { const t = stmts[j]; if (t.k === "label" && t.name === last.target) { m = j; break; } }
    const toExit = m < 0 && last.target === exit;
    if (m < 0 && !toExit) continue;
    if (toExit) m = stmts.length;
    uses.set(last.target, (uses.get(last.target) ?? 1) - 1);
    const otherwise = stmts.slice(i + 1, m);
    chain(otherwise, uses, last.target);
    stmts[i] = { k: "if", cond: s.cond, then: [...s.then.slice(0, at), ...s.then.slice(at + 1)], else: otherwise };
    // (its label stays where something else jumps to it)
    stmts.splice(i + 1, m - i - (!toExit && (uses.get(last.target) ?? 0) > 0 ? 1 : 0));
  }
}

// ---- Movements

/** The command that runs a movement, and its argument that names it. */
const MOVEMENT_COMMAND = "ActorCmdExec";
const MOVEMENT_ARG = 1;

/** A movement's steps from its Move lines: each its action's name, with its count where it isn't 1. */
function stepOf(action: string, count: string, names: Names): string {
  const code = Number(action);
  const name = names.movementNames.get(code) ?? `action_${code}`;
  return count.trim() === "1" ? name : `${name}(${count.trim()})`;
}

/** The data statements turned movements where they're pure ones: a label, its Move lines and MoveEnd. The rest of the
 * data stays as it is. */
function movementStatements(stmts: Stmt[], names: Names): Stmt[] {
  const out: Stmt[] = [];
  for (const s of stmts) {
    if (s.k !== "raw") { out.push(s); continue; }
    let rest: string[] = [];
    // (what's left between movements: blank lines go)
    const flush = () => { if (rest.some((l) => l.trim())) out.push({ k: "raw", lines: rest }); rest = []; };
    for (let i = 0; i < s.lines.length; i++) {
      const label = /^([A-Za-z_]\w*):\s*$/.exec(s.lines[i]);
      const steps: string[] = [];
      let j = i + 1;
      let ended = false;
      if (label && names.movementNames.size) {
        for (; j < s.lines.length; j++) {
          const t = s.lines[j].trim();
          const move = /^Move\s+(\d+)\s*,\s*(\d+)$/.exec(t);
          if (move && names.movementNames.has(Number(move[1]))) steps.push(stepOf(move[1], move[2], names));
          else { ended = t === "MoveEnd"; break; }
        }
      }
      if (label && ended && steps.length) {
        // (the alignment before it goes: a movement is written with its own)
        if (rest.length && ALIGN4.test(rest[rest.length - 1])) rest.pop();
        else if (!rest.length && out.length && isAlign4(out[out.length - 1])) out.pop();
        flush();
        out.push({ k: "movement", name: label[1], steps });
        i = j;
      } else rest.push(s.lines[i]);
    }
    flush();
  }
  return out;
}

/** A pad the dump put to keep the next script on an even address (a zero byte), or the alignment written for one. */
const isPad = (s: Stmt) => s.k === "raw" && s.lines.every((l) => /^\s*(\.byte\s+0x00|\.balign\s+2\s*,\s*0)\s*$/.test(l));

/** The alignment before a movement's data, which compileScript writes with it. */
const ALIGN4 = /^\s*\.balign\s+4\s*,\s*0\s*$/;
const isAlign4 = (s: Stmt) => s.k === "raw" && s.lines.length === 1 && ALIGN4.test(s.lines[0]);

/** Whether nothing runs past statements' end: after a jump or a command after which nothing runs, statements are dead
 * up to a label (which a jump can reach). */
function endsRun(stmts: Stmt[], names: Names): boolean {
  let live = true;
  for (const s of stmts) {
    if (s.k === "label") live = true;
    else if (s.k === "goto" || (s.k === "call" && TERMINATORS.has(names.toMacro.get(s.name) ?? ""))) live = false;
  }
  return !live;
}

/** The movements one command alone runs, put in it as [steps] (so their data goes where the script's ends, which a
 * script that runs on into the next can't have). */
function inlineMovements(stmts: Stmt[], names: Names, uses: Map<string, number>): Stmt[] {
  if (!endsRun(stmts, names)) return stmts;
  const movements = new Map<string, string[]>();
  for (const s of stmts) if (s.k === "movement" && uses.get(s.name) === 1) movements.set(s.name, s.steps);
  const used = new Set<string>();
  const run = names.toLang.get(MOVEMENT_COMMAND);
  const out = stmts.map((s): Stmt => {
    if (s.k !== "call" || s.name !== run) return s;
    const steps = movements.get(s.args[MOVEMENT_ARG]);
    if (!steps) return s;
    used.add(s.args[MOVEMENT_ARG]);
    return { ...s, args: s.args.map((a, n) => (n === MOVEMENT_ARG ? `[${steps.join(", ")}]` : a)) };
  });
  return out.filter((s) => !(s.k === "movement" && used.has(s.name)));
}

/** A movement's Move lines from its steps (name, or name(count)); a message for a step it doesn't know. */
function moveLines(steps: string[], names: Names): string[] {
  const out: string[] = [];
  for (const step of steps) {
    const m = /^([a-z_][a-z0-9_]*)\s*(?:\(\s*([^)]*?)\s*\))?$/.exec(step.trim());
    const code = m ? names.movementCodes.get(m[1]) ?? (/^action_(\d+)$/.exec(m[1]) ? Number(m[1].slice(7)) : undefined) : undefined;
    if (!m || code === undefined) throw new CompileError(`no movement ${step.trim()}: the movement reference (movements.json) has no such name`);
    out.push(`    Move ${code}, ${m[2] || 1}`);
  }
  out.push("    MoveEnd");
  return out;
}

// ---- Menus and switches

/** Each menu statement's setup macro, and its options' and its show's. */
export const MENU_MACROS: Record<string, string> = { menu: "ListMenuAnchorTopRight", menu_top_left: "ListMenuAnchorTopLeft", menu_common: "ListMenuInitCommon" };
export const OPTION_MACRO = "ListMenuAdd";
const SHOW_MACRO = "ListMenuShow";

/** Commands whose handlers run the same code (src/ov036/scrcmd_menu.c), as the one the language writes. */
export const SAME_COMMANDS: Record<string, string> = { ListMenuShow2: SHOW_MACRO };
/** A menu's argument that names the variable its choice goes in. */
const MENU_RESULT = 4;

/** A statement with its parts (an if's, a menu's, a switch's) turned by f. */
function mapBlocks(s: Stmt, f: (stmts: Stmt[]) => Stmt[]): Stmt {
  switch (s.k) {
    case "if": return { ...s, then: f(s.then), else: s.else && f(s.else) };
    case "menu": return { ...s, body: f(s.body) };
    case "switch": return { ...s, cases: s.cases.map((c) => ({ ...c, body: f(c.body) })), else: s.else && f(s.else) };
    default: return s;
  }
}

/** A statement's parts. */
function blocksOf(s: Stmt): Stmt[][] {
  switch (s.k) {
    case "if": return s.else ? [s.then, s.else] : [s.then];
    case "menu": return [s.body];
    case "switch": return [...s.cases.map((c) => c.body), ...(s.else ? [s.else] : [])];
    default: return [];
  }
}

/** The menus among statements: a setup, what's after it up to its show at the same level (no label or jump between),
 * and the show, as one menu statement, with its options as option(). */
function groupMenus(stmts: Stmt[], names: Names): Stmt[] {
  const setups = new Map(Object.entries(MENU_MACROS).map(([lang, macro]) => [names.toLang.get(macro), lang]));
  const shows = new Set([SHOW_MACRO, ...Object.keys(SAME_COMMANDS)].map((m) => names.toLang.get(m)));
  const add = names.toLang.get(OPTION_MACRO);
  const options = (list: Stmt[]): Stmt[] => list.map((s) => (s.k === "call" && s.name === add ? { ...s, name: "option" } : mapBlocks(s, options)));
  const out: Stmt[] = [];
  for (let i = 0; i < stmts.length; i++) {
    const s = stmts[i];
    const menu = s.k === "call" ? setups.get(s.name) : undefined;
    let j = i + 1;
    if (menu && s.k === "call") {
      for (; j < stmts.length; j++) {
        const t = stmts[j];
        if (t.k === "call" && (shows.has(t.name) || setups.has(t.name))) break;
        if (t.k === "label" || t.k === "goto" || t.k === "ifgoto" || t.k === "raw") { j = stmts.length; break; }
      }
      const end = stmts[j];
      if (end?.k === "call" && shows.has(end.name) && !end.args.length) {
        out.push({ k: "menu", name: menu, args: s.args, body: options(stmts.slice(i + 1, j)) });
        i = j;
        continue;
      }
    }
    out.push(s);
  }
  return out;
}

/** An if and its else ifs as a switch, where each compares one variable with a value: three of them at least, or two
 * straight after a menu whose choice it is. */
function asSwitch(s: Extract<Stmt, { k: "if" }>, menuResult?: string): Stmt | null {
  const cases: { value: string; body: Stmt[] }[] = [];
  let on: Expr | null = null;
  let node: Stmt = s;
  let rest: Stmt[] | undefined;
  const real = (list: Stmt[]) => list.filter((t) => t.k !== "blank" && t.k !== "comment");
  for (;;) {
    const c = node.k === "if" ? node.cond : null;
    // (a case that does nothing, as it reads back: if (v != 0) { the next cases, or the else })
    if (node.k === "if" && !node.else && c?.k === "cmp" && c.op === "!=" && c.l.k === "var" && c.r.k === "const" && !isVarText(c.r.text)
        && (!on || sameValue((on as { text: string }).text, c.l.text))) {
      on = c.l;
      cases.push({ value: c.r.text, body: [] });
      const then = real(node.then);
      if (then.length === 1 && then[0].k === "if") { node = then[0]; continue; }
      rest = node.then;
      break;
    }
    const matches = !!c && c.k === "cmp" && c.op === "==" && c.l.k === "var" && c.r.k === "const" && !isVarText(c.r.text)
      && (!on || sameValue((on as { text: string }).text, (c.l as { text: string }).text));
    if (!matches || node.k !== "if" || c?.k !== "cmp") { rest = [node]; break; }
    on = c.l;
    cases.push({ value: (c.r as { text: string }).text, body: node.then });
    if (node.else?.length === 1 && node.else[0].k === "if") { node = node.else[0]; continue; }
    rest = node.else;
    break;
  }
  const afterMenu = on && menuResult !== undefined && sameValue(menuResult.replace(/^var\((.*)\)$/, "$1"), (on as { text: string }).text);
  if (!on || cases.length < (afterMenu ? 2 : 3)) return null;
  return rest ? { k: "switch", on, cases, else: rest } : { k: "switch", on, cases };
}

/** A switch as the if and else ifs it is. */
function switchIfs(s: Extract<Stmt, { k: "switch" }>): Stmt {
  const at = (n: number): Stmt => ({ k: "if", cond: { k: "cmp", op: "==", l: s.on, r: { k: "const", text: s.cases[n].value } }, then: s.cases[n].body,
                                      else: n + 1 < s.cases.length ? [at(n + 1)] : s.else });
  return at(0);
}

/** Each argument's kind of a call, by its name: a shortcut's, a named global's or the command reference's. */
function argKinds(name: string, names: Names): (string | undefined)[] {
  if (MENUS.has(name) || name === "option") return names.commands.get(MENU_MACROS[name] ?? OPTION_MACRO)?.args.map((a) => a.kind) ?? [];
  const shortcut = SHORTCUT_NAMES.get(name);
  if (shortcut) return shortcut.params.map((p) => p.kind);
  const global = names.globals.get(name);
  if (global) return global.inputs.map((i) => i.kind);
  return names.commands.get(names.toMacro.get(name) ?? "")?.args.map((a) => a.kind) ?? [];
}

/** The values of statements turned, by their kinds, as they show (way "show") or as the .s stores them ("store"). */
function mapValues(stmts: Stmt[], names: Names, ctx: ValueContext, way: "show" | "store"): Stmt[] {
  const turn = (text: string, kind: string | undefined): string => {
    const t = text.trim();
    const inVar = /^var\((.*)\)$/.exec(t);
    const out = way === "show" ? showValue(inVar ? inVar[1] : t, inVar ? "var" : kind, ctx) : storeValue(inVar ? inVar[1] : t, inVar ? "var" : kind, ctx);
    if (typeof out !== "string") throw new CompileError(`${t}: ${out.error}`);
    return inVar ? `var(${out})` : out;
  };
  // A command's argument: a variable's the .s wrote as a number, 32784 or 0x8010, shows as one: var(0x8010)
  const turnArg = (text: string, kind: string | undefined): string => {
    const t = text.trim();
    const n = /^\d+$/.test(t) ? Number(t) : /^0x[0-9a-f]+$/i.test(t) ? parseInt(t, 16) : NaN;
    if (way === "show" && kind === "var" && n >= 0x4000 && n <= 0xffff) return `var(0x${n.toString(16).padStart(4, "0")})`;
    return turn(text, kind);
  };
  const expr = (e: Expr): Expr => {
    switch (e.k) {
      case "flag": return { k: "flag", arg: turn(e.arg, "flag") };
      case "var": return { k: "var", text: turn(e.text, "var") };
      case "const": return e;
      case "not": return { k: "not", e: expr(e.e) };
      default: return { ...e, l: expr(e.l), r: expr(e.r) };
    }
  };
  // Its messages' lines of text, for the comments over it in the .s (the text bank's, as the dump wrote them)
  const messageTexts = (s: Stmt): string[] => {
    if (s.k !== "call") return [];
    const out: string[] = [];
    argKinds(s.name, names).forEach((kind, at) => {
      if (kind !== "message") return;
      // (its line as written: a number, or a message's id)
      const written = (s.args[at] ?? "").trim();
      const line = /^\d+$/.test(written) ? Number(written) : ctx.messageLine.get(written);
      if (line !== undefined && ctx.texts?.[line] !== undefined) out.push(ctx.texts[line]);
    });
    return out;
  };
  const isPreview = (s: Stmt) => s.k === "comment" && s.text.startsWith('// "');
  const out: Stmt[] = [];
  stmts.forEach((s, i) => {
    if (way === "show") {
      // (the dump's comment of a message's text over it goes: the sidebar shows the message)
      let next = i + 1;
      while (next < stmts.length && (stmts[next].k === "blank" || isPreview(stmts[next]))) next++;
      if (isPreview(s) && stmts[next] && argKinds((stmts[next] as { name?: string }).name ?? "", names).includes("message")) return;
    } else if (!isPreview(s) && ctx.texts) {
      const said = messageTexts(s);
      if (said.length && !(out.length && isPreview(out[out.length - 1]))) out.push(...said.map((t): Stmt => ({ k: "comment", text: `// "${t}"` })));
    }
    out.push(turnStmt(s));
  });
  // (a part's blank lines at its end go)
  if (way === "show") while (out.length && out[out.length - 1].k === "blank") out.pop();
  return out;

  function turnStmt(s: Stmt): Stmt {
    switch (s.k) {
      case "call": {
        const kinds = argKinds(s.name, names);
        return { ...s, args: s.args.map((a, n) => turnArg(a, kinds[n])) };
      }
      case "assign": return { ...s, target: turn(s.target, "var"), value: turn(s.value, undefined) };
      case "ifgoto": return { ...s, cond: expr(s.cond) };
      case "if": return mapBlocks({ ...s, cond: expr(s.cond) }, (b) => mapValues(b, names, ctx, way));
      case "switch": return mapBlocks({ ...s, on: expr(s.on) }, (b) => mapValues(b, names, ctx, way));
      case "menu": {
        const kinds = argKinds(s.name, names);
        return mapBlocks({ ...s, args: s.args.map((a, n) => turnArg(a, kinds[n])) }, (b) => mapValues(b, names, ctx, way));
      }
      default: return s;
    }
  }
}

/** A file's script block translated: its statements after its label, its values as they show where there's a
 * context (a message by its line, flags and species by number). */
export function decompileBlock(lines: SLine[], start: number, end: number, number: number, names: Names, uses = labelUses(lines),
                               ctx?: ValueContext): Script {
  // (its own label is the script's)
  const flat = inlineMovements(movementStatements(flatStatements(lines, start + 1, end, names), names), names, uses);
  // The pad at its end that keeps the next script on an even address goes: it's written back as an alignment
  // (only straight after the script's end, where it's no data)
  for (;;) {
    let at = flat.length - 1;
    while (at >= 0 && flat[at].k === "blank") at--;
    // (past the comments and blank lines after the end, which the pad is written after)
    let before = at - 1;
    while (before >= 0 && (flat[before].k === "blank" || flat[before].k === "comment")) before--;
    if (before < 0 || !isPad(flat[at]) || !endsRun(flat.slice(0, at), names) || !/^(call|goto)$/.test(flat[before].k)) break;
    flat.splice(at);
  }
  const body = tidy(structure(flat, new Map(uses)), names);
  const parts = splitSubs(body, uses, callUses(lines), names);
  const aliases = aliasValues(fileAliases(lines), ctx);
  const show = (stmts: Stmt[]) => showAliases(ctx ? mapValues(stmts, names, ctx, "show") : stmts, aliases, names);
  const subs = parts.subs.map((sub) => ({ name: sub.name, body: show(sub.body) }));
  return subs.length ? { number, body: show(parts.body), subs } : { number, body: show(parts.body) };
}

/** Statements tidied as they'll read back once saved: raw lines one after another (and the blank lines between them)
 * as one asm block, its empty lines at its end a blank line after it; menus grouped; an if and its else ifs on one
 * variable as a switch; an if with nothing to do and an else as the else on its negation. */
function tidy(stmts: Stmt[], names: Names): Stmt[] {
  const out: Stmt[] = [];
  for (const s of groupMenus(stmts, names)) {
    // (with the blank lines between them)
    let j = out.length - 1;
    while (j >= 0 && out[j].k === "blank") j--;
    const last = out[j];
    if (s.k === "raw" && last?.k === "raw") {
      out.splice(j, out.length - j, { k: "raw", lines: [...last.lines, ...Array<string>(out.length - 1 - j).fill(""), ...s.lines] });
      continue;
    }
    // (a menu before it, whose choice a switch may be on)
    const menu = last?.k === "menu" ? last.args[MENU_RESULT] : undefined;
    const sw = s.k === "if" ? asSwitch(s, menu) : null;
    if (sw) out.push(mapBlocks(sw, (b) => tidy(b, names)));
    else if (s.k === "if" && s.else && s.then.every((t) => t.k === "blank" || t.k === "comment")) out.push(...tidy([{ k: "if", cond: negate(s.cond), then: s.else }], names));
    else out.push(mapBlocks(s, (b) => tidy(b, names)));
  }
  return out.flatMap((s): Stmt[] => {
    if (s.k !== "raw" || s.lines[s.lines.length - 1]?.trim() !== "") return [s];
    const lines = [...s.lines];
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    return lines.length ? [{ k: "raw", lines }, { k: "blank" }] : [{ k: "blank" }];
  });
}

/** Whether statements end their run: their last but data, comments and blanks is a jump or a command after which
 * nothing runs (labels count: one can be jumped to). */
function partEnds(stmts: Stmt[], names: Names): boolean {
  for (let i = stmts.length - 1; i >= 0; i--) {
    const s = stmts[i];
    if (s.k === "blank" || s.k === "comment" || s.k === "raw" || s.k === "movement" || s.k === "alias") continue;
    return s.k === "goto" || (s.k === "call" && TERMINATORS.has(names.toMacro.get(s.name) ?? ""));
  }
  return false;
}

/** A block's statements split into the script and its routines: a sub from each label at the top that only calls
 * name (VMCall), where what comes before it ends, up to the next. */
function splitSubs(body: Stmt[], uses: Map<string, number>, calls: Map<string, number>, names: Names): { body: Stmt[]; subs: Sub[] } {
  const subs: Sub[] = [];
  let part = { name: "", from: 0 };
  const cut = (to: number) => body.slice(part.from, to);
  let main: Stmt[] | null = null;
  body.forEach((s, i) => {
    if (s.k !== "label" || !(calls.get(s.name) ?? 0) || calls.get(s.name) !== uses.get(s.name) || !partEnds(cut(i), names)) return;
    if (main === null) main = cut(i);
    else subs.push({ name: part.name, body: cut(i) });
    part = { name: s.name, from: i + 1 };
  });
  if (main === null) return { body, subs };
  subs.push({ name: part.name, body: cut(body.length) });
  // (the blank lines before a sub are the space between them, and the alignment before it is written with it)
  const trim = (stmts: Stmt[], beforeSub: boolean) => {
    const blanks = () => { while (stmts.length && stmts[stmts.length - 1].k === "blank") stmts.pop(); };
    blanks();
    const last = stmts[stmts.length - 1];
    if (beforeSub && last?.k === "raw" && ALIGN4.test(last.lines[last.lines.length - 1])) {
      const lines = last.lines.slice(0, -1);
      while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
      if (lines.length) stmts[stmts.length - 1] = { k: "raw", lines }; else stmts.pop();
      blanks();
    }
    return stmts;
  };
  return { body: trim(main, true), subs: subs.map((sub, n) => ({ name: sub.name, body: trim(sub.body, n < subs.length - 1) })) };
}

// ---- Aliases

/** An alias's value: a variable's or a flag's, as it shows and as the .s stores it. */
interface AliasValue {
  kind: "var" | "flag";
  shown: string;
  stored: string;
}

function aliasValue(value: string, ctx?: ValueContext): AliasValue | { error: string } {
  const m = /^(var|flag)\(\s*(.+?)\s*\)$/.exec(value.trim());
  const kind = m ? (m[1] as "var" | "flag") : isVarText(value.trim()) ? "var" : null;
  if (!kind) return { error: `${value}: an alias names a variable or a flag: var(0x4060), 0x4060 or flag(510)` };
  const inner = m ? m[2] : value.trim();
  const stored = storeValue(inner, kind, ctx);
  if (typeof stored !== "string") return { error: `${value}: ${stored.error}` };
  return { kind, shown: showValue(stored, kind, ctx), stored };
}

/** A file's aliases' values; one whose value can't be read is left out. */
function aliasValues(aliases: Map<string, string>, ctx?: ValueContext): Map<string, AliasValue> {
  const out = new Map<string, AliasValue>();
  for (const [name, value] of aliases) {
    const v = aliasValue(value, ctx);
    if (!("error" in v)) out.set(name, v);
  }
  return out;
}

/** A value's text compared by its number where it is one (0x4060 is 16480). */
const sameValue = (a: string, b: string) => {
  const n = (t: string) => (/^0x[0-9a-f]+$/i.test(t) ? parseInt(t, 16) : /^\d+$/.test(t) ? Number(t) : t);
  return n(a.trim()) === n(b.trim());
};

/** Statements with the variables and flags that have an alias shown by it. */
function showAliases(stmts: Stmt[], aliases: Map<string, AliasValue>, names: Names): Stmt[] {
  if (!aliases.size) return stmts;
  const find = (text: string, kind: "var" | "flag") => {
    for (const [name, v] of aliases) if (v.kind === kind && sameValue(v.shown, text)) return name;
    return undefined;
  };
  const arg = (text: string, kind?: string) => {
    const t = text.trim();
    const inVar = /^var\((.+)\)$/.exec(t);
    if (inVar) return find(inVar[1], "var") ?? t;
    if (kind === "var" || kind === "flag") return find(t, kind) ?? t;
    return isVarText(t) ? find(t, "var") ?? t : t;
  };
  const expr = (e: Expr): Expr => {
    switch (e.k) {
      case "flag": { const name = find(e.arg, "flag"); return name ? { k: "const", text: name } : e; }
      case "var": { const name = find(e.text, "var"); return name ? { k: "const", text: name } : e; }
      case "const": return e;
      case "not": return { k: "not", e: expr(e.e) };
      default: return { ...e, l: expr(e.l), r: expr(e.r) };
    }
  };
  return stmts.map((s): Stmt => {
    switch (s.k) {
      case "call": {
        const kinds = argKinds(s.name, names);
        return { ...s, args: s.args.map((a, n) => (a.trim().startsWith("[") ? a : arg(a, kinds[n]))) };
      }
      case "assign": return { ...s, target: find(s.target, "var") ?? s.target, value: arg(s.value) };
      case "ifgoto": return { ...s, cond: expr(s.cond) };
      case "if": return mapBlocks({ ...s, cond: expr(s.cond) }, (b) => showAliases(b, aliases, names));
      case "switch": return mapBlocks({ ...s, on: expr(s.on) }, (b) => showAliases(b, aliases, names));
      case "menu": {
        const kinds = argKinds(s.name, names);
        return mapBlocks({ ...s, args: s.args.map((a, n) => arg(a, kinds[n])) }, (b) => showAliases(b, aliases, names));
      }
      default: return s;
    }
  });
}

/** Statements with each alias's name put back as its variable or flag, as they show (for mapValues' store). */
function storeAliases(stmts: Stmt[], aliases: Map<string, AliasValue>, names: Names): Stmt[] {
  if (!aliases.size) return stmts;
  const arg = (text: string) => {
    const v = aliases.get(text.trim());
    if (!v) return text;
    return v.kind === "var" ? `var(${v.shown})` : v.shown;
  };
  const expr = (e: Expr): Expr => {
    switch (e.k) {
      case "const": {
        const v = aliases.get(e.text);
        return !v ? e : v.kind === "var" ? { k: "var", text: v.shown } : { k: "flag", arg: v.shown };
      }
      case "flag": case "var": return e;
      case "not": return { k: "not", e: expr(e.e) };
      default: return { ...e, l: expr(e.l), r: expr(e.r) };
    }
  };
  return stmts.map((s): Stmt => {
    switch (s.k) {
      case "call": {
        return { ...s, args: s.args.map((a) => arg(a)) };
      }
      case "assign": {
        const v = aliases.get(s.target);
        if (v && v.kind !== "var") throw new CompileError(`${s.target} names a flag: set_flag() and clear_flag() set one`);
        const value = aliases.get(s.value.trim());
        if (value && value.kind !== "var") throw new CompileError(`${s.value.trim()} names a flag, which a variable can't be set to`);
        return { ...s, target: v ? v.shown : s.target, value: arg(s.value) };
      }
      case "ifgoto": return { ...s, cond: expr(s.cond) };
      case "if": return mapBlocks({ ...s, cond: expr(s.cond) }, (b) => storeAliases(b, aliases, names));
      case "switch": return mapBlocks({ ...s, on: expr(s.on) }, (b) => storeAliases(b, aliases, names));
      case "menu": return mapBlocks({ ...s, args: s.args.map(arg) }, (b) => storeAliases(b, aliases, names));
      default: return s;
    }
  });
}

/** The aliases a script writes, in its body and its subs. */
function scriptAliases(script: Script): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (stmts: Stmt[]) => {
    for (const s of stmts) {
      if (s.k === "alias") {
        if (out.has(s.name) && out.get(s.name) !== s.value) throw new CompileError(`alias ${s.name} is written twice, as ${out.get(s.name)} and ${s.value}`);
        out.set(s.name, s.value);
      } else blocksOf(s).forEach(walk);
    }
  };
  walk(script.body);
  for (const sub of script.subs ?? []) walk(sub.body);
  return out;
}

// ---- Back to lines

export class CompileError extends Error {}

/** A script's lines, its label first, then its subs'. taken: the labels the file has, which new ones keep clear of;
 * aliases: the file's aliases outside this script. */
export function compileScript(script: Script, label: string, names: Names, taken: Set<string>, ctx?: ValueContext,
                              aliases = new Map<string, string>()): string[] {
  // The aliases: the file's and this script's, which must agree
  const own = scriptAliases(script);
  const all = new Map(aliases);
  for (const [name, value] of own) {
    if (names.toMacro.has(name) || names.globals.has(name) || SHORTCUT_NAMES.has(name)) throw new CompileError(`alias ${name}: a command has that name`);
    const other = all.get(name);
    if (other !== undefined && other.replace(/\s+/g, "") !== value.replace(/\s+/g, "")) {
      throw new CompileError(`alias ${name} is ${other} in another script of this file`);
    }
    all.set(name, value);
  }
  const values = new Map<string, AliasValue>();
  for (const [name, value] of all) {
    const v = aliasValue(value, ctx);
    if ("error" in v) { if (own.has(name)) throw new CompileError(`alias ${name}: ${v.error}`); } else values.set(name, v);
  }
  const subs = script.subs ?? [];
  const store = (stmts: Stmt[]) => { const named = storeAliases(stmts, values, names); return ctx ? mapValues(named, names, ctx, "store") : named; };
  script = { ...script, body: store(script.body), subs: subs.map((sub) => ({ name: sub.name, body: store(sub.body) })) };
  // The labels it can call as routines: the file's, its own and its subs'
  const labels = new Set(taken);
  const addLabels = (stmts: Stmt[]) => { for (const s of stmts) { if (s.k === "label") labels.add(s.name); else blocksOf(s).forEach(addLabels); } };
  addLabels(script.body);
  for (const sub of script.subs!) {
    if (names.toMacro.has(sub.name) || names.globals.has(sub.name) || SHORTCUT_NAMES.has(sub.name)) throw new CompileError(`sub ${sub.name}: a command has that name`);
    if (labels.has(sub.name) || sub.name === label) throw new CompileError(`sub ${sub.name}: the file or the script has a label of that name`);
    labels.add(sub.name);
    addLabels(sub.body);
  }
  const out = [`${label}:`];
  let next = 1;
  const fresh = (kind = "L") => {
    let name: string;
    do name = `${kind}_${label}_${next++}`; while (taken.has(name) || labels.has(name));
    taken.add(name);
    return name;
  };
  const inline: { label: string; steps: string[] }[] = [];
  const pushExpr = (e: Expr) => {
    switch (e.k) {
      case "flag": out.push(`    VMStackPushFlag ${e.arg}`); break;
      case "var": out.push(`    VMStackPush ${e.text}`); break;
      case "const": out.push(`    VMStackPushConst ${e.text}`); break;
      case "cmp": pushExpr(e.l); pushExpr(e.r); out.push(`    VMStackCmp ${OP_NAMES[e.op]}`); break;
      case "arith": pushExpr(e.l); pushExpr(e.r); out.push(`    ${ARITH_MACROS[e.op]}`); break;
      case "and": pushExpr(e.l); pushExpr(e.r); out.push("    VMStackCmp CMP_AND"); break;
      case "or": pushExpr(e.l); pushExpr(e.r); out.push("    VMStackCmp CMP_OR"); break;
      // (not of something that isn't a comparison: it compared with 1, the other way)
      case "not": pushExpr({ k: "cmp", op: "!=", l: e.e, r: { k: "const", text: "1" } }); break;
    }
  };
  /** Jumps to target when cond is false. */
  const jumpUnless = (cond: Expr, target: string) => {
    pushExpr(cond);
    out.push(`    VMJumpIf CMP_STACK, ${target}`);
  };
  const emit = (stmts: Stmt[]) => {
    for (const s of stmts) {
      switch (s.k) {
        case "call": {
          const global = names.globals.get(s.name);
          if (global) {
            if (s.args.length !== global.inputs.length) throw new CompileError(`${s.name} takes ${global.inputs.length} arguments`);
            global.inputs.forEach((input, n) => {
              const value = s.args[n].trim();
              out.push(/^var\(/.test(value) ? `    WorkGet ${input.var}, ${plainArg(value)}` : `    WorkSetConst ${input.var}, ${value}`);
            });
            out.push(`    RTCallGlobal ${global.script}`);
            break;
          }
          const shortcut = SHORTCUT_NAMES.get(s.name);
          if (shortcut) {
            const args = messageArgs(shortcut, s.args.map(plainArg));
            if (typeof args === "string") throw new CompileError(args);
            out.push(`    ${shortcut.macro} ${args.join(", ")}`, ...shortcut.after.map((m) => `    ${m}`));
            break;
          }
          const macro = s.name === "option" ? OPTION_MACRO : names.toMacro.get(s.name);
          if (!macro && labels.has(s.name)) {
            if (s.args.length) throw new CompileError(`${s.name}() is a routine: it takes no arguments`);
            out.push(`    VMCall ${s.name}`);
            break;
          }
          if (!macro) throw new CompileError(`no command ${s.name}`);
          // (a movement in its command: its data after the script, under a new label)
          const args = s.args.map((a) => {
            const t = a.trim();
            if (!t.startsWith("[")) return plainArg(t);
            if (!t.endsWith("]")) throw new CompileError(`${s.name}: a movement's [ ] isn't closed`);
            const name = fresh("Movement");
            inline.push({ label: name, steps: splitTop(t.slice(1, -1).replace(/\/\/[^\n]*/g, "")).filter(Boolean) });
            return name;
          });
          out.push(`    ${macro}${args.length ? ` ${args.join(", ")}` : ""}`);
          break;
        }
        case "assign": {
          const value = s.value.trim();
          const macro = s.op === "=" && /^var\(/.test(value) ? "WorkGet" : ASSIGN_MACROS[s.op];
          out.push(`    ${macro} ${s.target}, ${plainArg(value)}`);
          break;
        }
        case "label": out.push(`${s.name}:`); break;
        case "goto": out.push(`    VMJump ${s.target}`); break;
        case "ifgoto": jumpUnless(negate(s.cond), s.target); break;
        case "raw": out.push(...s.lines); break;
        case "movement": out.push("    .balign 4, 0", `${s.name}:`, ...moveLines(s.steps, names)); break;
        case "comment": out.push(`    ${s.text}`); break;
        case "alias": out.push(`    //@ alias ${s.name} = ${s.value}`); break;
        case "menu":
          out.push(`    ${MENU_MACROS[s.name]} ${s.args.map(plainArg).join(", ")}`);
          emit(s.body);
          out.push(`    ${SHOW_MACRO}`);
          break;
        case "switch": emit([switchIfs(s)]); break;
        case "blank": out.push(""); break;
        case "if": {
          const otherwise = fresh();
          jumpUnless(s.cond, otherwise);
          emit(s.then);
          if (s.else) {
            // (the jump past the else even after a then part that ends, as the game's scripts have it: so it reads
            // back as an else)
            const done = fresh();
            out.push(`    VMJump ${done}`, `${otherwise}:`);
            emit(s.else);
            out.push(`${done}:`);
          } else out.push(`${otherwise}:`);
          break;
        }
      }
    }
  };
  emit(script.body);
  let last = script.body;
  for (const sub of script.subs!) {
    // (what runs before a sub must end, or it would run on into it)
    if (!partEnds(last, names)) throw new CompileError(last === script.body
      ? `The script must end (with end() or a goto) before its sub ${sub.name}`
      : `The sub before ${sub.name} must end, with return() (or a goto)`);
    out.push("    .balign 4, 0", "", `${sub.name}:`);
    emit(sub.body);
    last = sub.body;
  }
  // The movements put in their commands, after the script's end
  if (inline.length) {
    if (!endsRun(last, names)) throw new CompileError("A script with a movement in its command must end (with end() or a goto): its data goes after it");
    for (const { label: name, steps } of inline) out.push("    .balign 4, 0", `${name}:`, ...moveLines(steps, names));
  }
  // (the next script on an even address, as the dump padded it straight after its end; not for a script that runs on
  // into the next)
  const real = last.filter((s) => s.k !== "blank" && s.k !== "comment");
  const final = real[real.length - 1];
  if (endsRun(last, names) && (final?.k === "goto" || final?.k === "call")) out.push("    .balign 2, 0");
  return out;
}

/** A file's text with one script block replaced by lines. */
export function replaceBlock(text: string, start: number, end: number, lines: string[]): string {
  const all = text.split("\n");
  return [...all.slice(0, start), ...lines, ...all.slice(end)].join("\n");
}

export { parseS };
