// Whether two script files run a script the same: walked together from the script's label, each command, jump and
// condition must pair with the other's (a condition may be the other's negation with its two ways swapped), and the
// labels they name lead to code that pairs too. The labels' names, the conditions' forms (the stack's or a WorkCmp's)
// and what nothing runs don't count. The script language's round trip is checked with it (tests/scriptlang.test.ts).

import { negate, type Expr, type Stmt } from "./lang.ts";
import { flatStatements, TERMINATORS, type Names } from "./translate.ts";
import { parseS } from "./sfile.ts";
import { numberOf, type ValueContext } from "./values.ts";

/** What a value is, for comparing: its number where it has one (a constant's name or the number it stands for, the
 * same), else its text; var(X) is X's. */
let valueCtx: ValueContext | undefined;
function valueKey(text: string): string {
  const t = text.trim().replace(/^var\((.*)\)$/, "$1").trim();
  // (a message's id is its line in the bank)
  const n = numberOf(t, valueCtx) ?? valueCtx?.messageLine.get(t);
  return n === undefined ? t : `#${n}`;
}

interface Program {
  stmts: Stmt[];
  labels: Map<string, number>;
}

function program(text: string, names: Names): Program {
  const lines = parseS(text);
  const stmts = flatStatements(lines, 0, lines.length, names);
  const labels = new Map<string, number>();
  stmts.forEach((s, i) => {
    if (s.k === "label") labels.set(s.name, i);
    if (s.k === "raw") for (const l of s.lines) { const m = /^([A-Za-z_]\w*):/.exec(l); if (m) labels.set(m[1], i); }
  });
  return { stmts, labels };
}

/** A condition in one form: negations pushed into the comparisons, a value alone compared with 1, a flag's test as
 * the flag set or not. */
function canon(e: Expr): string {
  switch (e.k) {
    case "not": {
      const n = negate(e.e);
      if (n.k === "not") return canon({ k: "cmp", op: "!=", l: n.e, r: { k: "const", text: "1" } });
      return canon(n);
    }
    case "and": return `and(${canon(e.l)},${canon(e.r)})`;
    case "or": return `or(${canon(e.l)},${canon(e.r)})`;
    case "cmp":
      if (e.l.k === "flag" && e.r.k === "const" && (e.r.text === "0" || e.r.text === "1") && (e.op === "==" || e.op === "!=")) {
        return `flag(${valueKey(e.l.arg)})=${(e.op === "==") === (e.r.text === "1") ? 1 : 0}`;
      }
      return `${e.op}(${value(e.l)},${value(e.r)})`;
    default: return canon({ k: "cmp", op: "==", l: e, r: { k: "const", text: "1" } });
  }
}

function value(e: Expr): string {
  switch (e.k) {
    case "flag": return `flag(${valueKey(e.arg)})`;
    case "var": return `var(${valueKey(e.text)})`;
    case "const": return `const(${valueKey(e.text)})`;
    case "arith": return `${e.op}(${value(e.l)},${value(e.r)})`;
    default: return `bool(${canon(e)})`;
  }
}

/** Where the next statement that does something is, from at: past labels, comments and blank lines, and through
 * jumps (which only move on); -1 past the end, -2 for a jump to no label or round in a loop of jumps alone. */
function runs(p: Program, at: number): number {
  let jumps = 0;
  for (let i = at; i < p.stmts.length; i++) {
    const s = p.stmts[i];
    if (s.k === "goto") {
      const t = p.labels.get(s.target);
      if (t === undefined || ++jumps > p.stmts.length) return -2;
      i = t - 1;
      continue;
    }
    if (s.k !== "label" && s.k !== "comment" && s.k !== "blank") return i;
  }
  return -1;
}

export interface Difference {
  message: string;
  a: Stmt | null;
  b: Stmt | null;
}

/** The first difference in how the two files run the script at label, or null where they run it the same. With a
 * context, a constant's name and its number are the same value. */
export function scriptDifference(textA: string, textB: string, label: string, names: Names, ctx?: ValueContext): Difference | null {
  valueCtx = ctx;
  const a = program(textA, names);
  const b = program(textB, names);
  const start = [a.labels.get(label), b.labels.get(label)];
  if (start[0] === undefined || start[1] === undefined) return { message: `no label ${label}`, a: null, b: null };
  const seen = new Set<string>();
  const todo: [number, number][] = [[start[0], start[1]]];
  const ends = (s: Stmt) => s.k === "call" && TERMINATORS.has(names.toMacro.get(s.name) ?? "");
  while (todo.length) {
    const [fromA, fromB] = todo.pop()!;
    const i = runs(a, fromA);
    const j = runs(b, fromB);
    const key = `${i}:${j}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (i < 0 || j < 0) {
      if (i !== j) return { message: "one ends where the other runs on", a: i < 0 ? null : a.stmts[i], b: j < 0 ? null : b.stmts[j] };
      continue;
    }
    const sa = a.stmts[i];
    const sb = b.stmts[j];
    const differ = (message: string) => ({ message, a: sa, b: sb });
    const target = (p: Program, name: string) => p.labels.get(name);
    if (sa.k !== sb.k) return differ(`${sa.k} against ${sb.k}`);
    switch (sa.k) {
      case "call": {
        const cb = sb as typeof sa;
        if (sa.name !== cb.name || sa.args.length !== cb.args.length) return differ("different commands");
        for (let n = 0; n < sa.args.length; n++) {
          const ta = target(a, sa.args[n]);
          const tb = target(b, cb.args[n]);
          if (ta !== undefined && tb !== undefined) todo.push([ta, tb]);
          else if (valueKey(sa.args[n]) !== valueKey(cb.args[n])) return differ(`argument ${n + 1}: ${sa.args[n]} against ${cb.args[n]}`);
        }
        if (!ends(sa)) todo.push([i + 1, j + 1]);
        break;
      }
      case "ifgoto": {
        const cb = sb as typeof sa;
        const ta = target(a, sa.target);
        const tb = target(b, cb.target);
        if (ta === undefined || tb === undefined) return differ("a jump to no label");
        if (canon(sa.cond) === canon(cb.cond)) todo.push([ta, tb], [i + 1, j + 1]);
        else if (canon(sa.cond) === canon(negate(cb.cond))) todo.push([ta, j + 1], [i + 1, tb]);
        else return differ(`conditions ${canon(sa.cond)} against ${canon(cb.cond)}`);
        break;
      }
      case "assign": {
        const cb = sb as typeof sa;
        if (valueKey(sa.target) !== valueKey(cb.target) || sa.op !== cb.op || valueKey(sa.value) !== valueKey(cb.value)) return differ("different assignments");
        todo.push([i + 1, j + 1]);
        break;
      }
      case "raw": {
        const ra = sa.lines.map((l) => l.trim()).join("\n");
        const rb = (sb as typeof sa).lines.map((l) => l.trim()).join("\n");
        if (ra !== rb) return differ("different data");
        todo.push([i + 1, j + 1]);
        break;
      }
      default: return differ(`${sa.k} runs`);
    }
  }
  return null;
}
