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

import { negate, type CmpOp, type Expr, type Script, type Stmt } from "./lang.ts";
import { parseS, type SLine } from "./sfile.ts";

/** The language's names for the commands (a macro's name in lowercase with underscores) and back. */
export class Names {
  readonly toLang = new Map<string, string>();
  readonly toMacro = new Map<string, string>();

  constructor(macros: Iterable<string>) {
    for (const m of macros) {
      const name = snake(m);
      // (the first macro keeps a name two would share)
      if (this.toMacro.has(name)) continue;
      this.toLang.set(m, name);
      this.toMacro.set(name, m);
    }
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
  }
  return false;
}

/** The statements of lines [start, end), one by one, before structuring. */
export function flatStatements(lines: SLine[], start: number, end: number, names: Names): Stmt[] {
  const out: Stmt[] = [];
  for (let i = start; i < end; i++) {
    const l = lines[i];
    if (l.kind === "other") {
      const t = l.text.trim();
      if (!t) out.push({ k: "blank" });
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
    if (l.name === "VMJump" && l.args.length === 1) {
      out.push({ k: "goto", target: l.args[0] });
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
    const name = names.toLang.get(l.name);
    if (!name) out.push({ k: "raw", lines: [l.text] });
    else out.push({ k: "call", name, args: l.args });
  }
  return out;
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

/** A file's script block translated: its statements after its label. */
export function decompileBlock(lines: SLine[], start: number, end: number, number: number, names: Names, uses = labelUses(lines)): Script {
  // (its own label is the script's)
  const flat = flatStatements(lines, start + 1, end, names);
  return { number, body: structure(flat, new Map(uses)) };
}

// ---- Back to lines

export class CompileError extends Error {}

/** A script's lines, its label first. taken: the labels the file has, which new ones keep clear of. */
export function compileScript(script: Script, label: string, names: Names, taken: Set<string>): string[] {
  const out = [`${label}:`];
  let next = 1;
  const fresh = () => {
    let name: string;
    do name = `L_${label}_${next++}`; while (taken.has(name));
    taken.add(name);
    return name;
  };
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
  const ends = (stmts: Stmt[]) => {
    const last = stmts[stmts.length - 1];
    return !!last && (last.k === "goto" || (last.k === "call" && TERMINATORS.has(names.toMacro.get(last.name) ?? "")));
  };
  const emit = (stmts: Stmt[]) => {
    for (const s of stmts) {
      switch (s.k) {
        case "call": {
          const macro = names.toMacro.get(s.name);
          if (!macro) throw new CompileError(`no command ${s.name}`);
          out.push(`    ${macro}${s.args.length ? ` ${s.args.join(", ")}` : ""}`);
          break;
        }
        case "label": out.push(`${s.name}:`); break;
        case "goto": out.push(`    VMJump ${s.target}`); break;
        case "ifgoto": jumpUnless(negate(s.cond), s.target); break;
        case "raw": out.push(...s.lines); break;
        case "comment": out.push(`    ${s.text}`); break;
        case "blank": out.push(""); break;
        case "if": {
          const otherwise = fresh();
          jumpUnless(s.cond, otherwise);
          emit(s.then);
          if (s.else) {
            const done = fresh();
            if (!ends(s.then)) out.push(`    VMJump ${done}`);
            out.push(`${otherwise}:`);
            emit(s.else);
            out.push(`${done}:`);
          } else out.push(`${otherwise}:`);
          break;
        }
      }
    }
  };
  emit(script.body);
  return out;
}

/** A file's text with one script block replaced by lines. */
export function replaceBlock(text: string, start: number, end: number, lines: string[]): string {
  const all = text.split("\n");
  return [...all.slice(0, start), ...lines, ...all.slice(end)].join("\n");
}

export { parseS };
