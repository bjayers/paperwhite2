// The script language's syntax (docs/paperwhite2/design/script-language.md): a script's statements and conditions as
// a tree, printed as text and parsed back.
//
//   script 2 {
//       actors_pause_all();
//       if (flag(EVENT_FLAG_0x01ec) == 1) {
//           se_play(SEQ_SE_MESSAGE);
//       } else if (var(0x8000) >= 2 && flag(513) == 0) {
//           goto L_0177;
//       }
//   L_0177:
//       asm {
//           .byte 0x00
//       }
//   }
//
// A command is its name and its arguments as written; a condition is built from flag(F), variables (var(X), printed
// so; a hex number from 0x4000 or an EVENT_WORK_ name alone reads as one too), values (anything else, or const(X)),
// the comparisons, + - * /, !, && and ||. A flag alone, or after !, is its test: flag(F) is flag(F) == 1, and prints
// so. asm { } keeps lines of the .s as they are.

export type CmpOp = "<" | "==" | ">" | "<=" | ">=" | "!=";
export type Expr =
  | { k: "flag"; arg: string }
  | { k: "var"; text: string }
  | { k: "const"; text: string }
  | { k: "cmp"; op: CmpOp; l: Expr; r: Expr }
  | { k: "arith"; op: "+" | "-" | "*" | "/"; l: Expr; r: Expr }
  | { k: "and" | "or"; l: Expr; r: Expr }
  | { k: "not"; e: Expr };

export type AssignOp = "=" | "+=" | "-=" | "*=" | "/=" | "%=";

export type Stmt =
  | { k: "call"; name: string; args: string[] }
  // A variable set, added to and the rest: var(target) op value
  | { k: "assign"; target: string; op: AssignOp; value: string }
  | { k: "label"; name: string }
  | { k: "goto"; target: string }
  | { k: "ifgoto"; cond: Expr; target: string }
  | { k: "if"; cond: Expr; then: Stmt[]; else?: Stmt[] }
  | { k: "raw"; lines: string[] }
  | { k: "comment"; text: string }
  | { k: "blank" };

export interface Script {
  /** Its number in the file's ScriptEntry table. */
  number: number;
  body: Stmt[];
}

/** Whether a variable or a value's text reads as a variable: a hex number from 0x4000, or a variable's name. */
export function isVarText(text: string): boolean {
  if (/^0x[0-9a-f]+$/i.test(text)) return parseInt(text, 16) >= 0x4000;
  return /^EVENT_WORK_/.test(text);
}

const NEGATE: Record<CmpOp, CmpOp> = { "<": ">=", "==": "!=", ">": "<=", "<=": ">", ">=": "<", "!=": "==" };

/** A condition's negation, pushed into its comparisons (De Morgan for && and ||). */
export function negate(e: Expr): Expr {
  switch (e.k) {
    case "not": return e.e;
    case "cmp": return { ...e, op: NEGATE[e.op] };
    case "and": return { k: "or", l: negate(e.l), r: negate(e.r) };
    case "or": return { k: "and", l: negate(e.l), r: negate(e.r) };
    default: return { k: "not", e };
  }
}

// ---- Printing

const PREC = { or: 1, and: 2, cmp: 3, add: 4, mul: 5, unary: 6, atom: 7 };

function precOf(e: Expr): number {
  switch (e.k) {
    case "or": return PREC.or;
    case "and": return PREC.and;
    case "cmp": return isFlagTest(e) ? PREC.unary : PREC.cmp;
    case "arith": return e.op === "+" || e.op === "-" ? PREC.add : PREC.mul;
    case "not": return PREC.unary;
    default: return PREC.atom;
  }
}

/** A flag compared with 1 or 0, which prints as flag(F) or !flag(F). */
function isFlagTest(e: Expr): boolean {
  return e.k === "cmp" && e.l.k === "flag" && e.r.k === "const" && (e.r.text === "1" || e.r.text === "0") && (e.op === "==" || e.op === "!=");
}

export function printExpr(e: Expr, outer = 0): string {
  const wrap = (s: string) => (precOf(e) < outer ? `(${s})` : s);
  switch (e.k) {
    case "flag": return `flag(${e.arg})`;
    case "var": return `var(${e.text})`;
    case "const": return isVarText(e.text) ? `const(${e.text})` : e.text;
    case "not": return `!${printExpr(e.e, PREC.unary)}`;
    case "cmp":
      if (isFlagTest(e)) return `${printExpr(e.l)} == ${(e.op === "==") === ((e.r as { text: string }).text === "1") ? 1 : 0}`;
      return wrap(`${printExpr(e.l, PREC.add)} ${e.op} ${printExpr(e.r, PREC.add)}`);
    case "arith": {
      const p = precOf(e);
      return wrap(`${printExpr(e.l, p)} ${e.op} ${printExpr(e.r, p + 1)}`);
    }
    case "and": return wrap(`${printExpr(e.l, PREC.and)} && ${printExpr(e.r, PREC.and + 1)}`);
    case "or": return wrap(`${printExpr(e.l, PREC.or)} || ${printExpr(e.r, PREC.or + 1)}`);
  }
}

const INDENT = "    ";

function printStmts(stmts: Stmt[], depth: number, out: string[]) {
  const pad = INDENT.repeat(depth);
  for (const s of stmts) {
    switch (s.k) {
      case "call": out.push(`${pad}${s.name}(${s.args.join(", ")});`); break;
      case "assign": out.push(`${pad}var(${s.target}) ${s.op} ${s.value};`); break;
      // (a label sits one step out, as in C)
      case "label": out.push(`${INDENT.repeat(Math.max(0, depth - 1))}${s.name}:`); break;
      case "goto": out.push(`${pad}goto ${s.target};`); break;
      case "ifgoto": out.push(`${pad}if (${printExpr(s.cond)}) goto ${s.target};`); break;
      case "comment": out.push(`${pad}${s.text}`); break;
      case "blank": out.push(""); break;
      case "raw":
        out.push(`${pad}asm {`);
        for (const line of s.lines) out.push(line);
        out.push(`${pad}}`);
        break;
      case "if": {
        let node: Stmt = s;
        let head = `${pad}if (${printExpr(s.cond)}) {`;
        for (;;) {
          const n = node as Extract<Stmt, { k: "if" }>;
          out.push(head);
          printStmts(n.then, depth + 1, out);
          // An else that is one if alone prints as else if
          if (n.else?.length === 1 && n.else[0].k === "if") {
            node = n.else[0];
            head = `${pad}} else if (${printExpr((node as Extract<Stmt, { k: "if" }>).cond)}) {`;
            continue;
          }
          if (n.else) {
            out.push(`${pad}} else {`);
            printStmts(n.else, depth + 1, out);
          }
          out.push(`${pad}}`);
          break;
        }
        break;
      }
    }
  }
}

export function printScript(script: Script): string {
  const out = [`script ${script.number} {`];
  printStmts(script.body, 1, out);
  out.push("}");
  return out.join("\n") + "\n";
}

// ---- Parsing

export class ParseError extends Error {
  constructor(message: string, readonly line: number, readonly column: number) {
    super(`line ${line}, column ${column}: ${message}`);
  }
}

class Reader {
  pos = 0;
  constructor(readonly text: string) {}

  where(at = this.pos) {
    const before = this.text.slice(0, at);
    const line = before.split("\n").length;
    return { line, column: at - before.lastIndexOf("\n") };
  }

  fail(message: string, at = this.pos): never {
    const { line, column } = this.where(at);
    throw new ParseError(message, line, column);
  }

  /** Skips spaces and newlines (not comments: they're statements); how many newlines it passed. */
  space(): number {
    let lines = 0;
    while (this.pos < this.text.length && /\s/.test(this.text[this.pos])) {
      if (this.text[this.pos] === "\n") lines++;
      this.pos++;
    }
    return lines;
  }

  /** Skips spaces and comments within an expression or a command's head. */
  gap() {
    for (;;) {
      this.space();
      if (this.text.startsWith("//", this.pos)) {
        const end = this.text.indexOf("\n", this.pos);
        this.pos = end < 0 ? this.text.length : end;
      } else return;
    }
  }

  peek(s: string): boolean {
    return this.text.startsWith(s, this.pos);
  }

  eat(s: string): boolean {
    this.gap();
    if (this.peek(s)) { this.pos += s.length; return true; }
    return false;
  }

  expect(s: string) {
    if (!this.eat(s)) this.fail(`expected "${s}"`);
  }

  word(): string | null {
    this.gap();
    const m = /^[A-Za-z_]\w*/.exec(this.text.slice(this.pos));
    if (!m) return null;
    this.pos += m[0].length;
    return m[0];
  }

  /** A keyword, only where it's a whole word. */
  keyword(k: string): boolean {
    this.gap();
    const m = /^[A-Za-z_]\w*/.exec(this.text.slice(this.pos));
    if (m && m[0] === k) { this.pos += k.length; return true; }
    return false;
  }

  /** The text up to the parenthesis that closes one already read, split at its commas outside parentheses. */
  args(): string[] {
    const start = this.pos;
    let depth = 0;
    for (; this.pos < this.text.length; this.pos++) {
      const c = this.text[this.pos];
      if (c === "(") depth++;
      else if (c === ")") {
        if (depth === 0) break;
        depth--;
      } else if (c === "\n") this.fail("a command's arguments end on its line");
    }
    if (this.pos >= this.text.length) this.fail("expected \")\"", start);
    const inner = this.text.slice(start, this.pos);
    this.pos++;
    if (!inner.trim()) return [];
    const out: string[] = [];
    depth = 0;
    let from = 0;
    for (let i = 0; i < inner.length; i++) {
      if (inner[i] === "(") depth++;
      else if (inner[i] === ")") depth--;
      else if (inner[i] === "," && depth === 0) { out.push(inner.slice(from, i).trim()); from = i + 1; }
    }
    out.push(inner.slice(from).trim());
    return out;
  }
}

const CMP_OPS: CmpOp[] = ["==", "!=", "<=", ">=", "<", ">"];

/** A flag alone where a condition is: its test, flag(F) == 1. */
const asTest = (e: Expr): Expr => (e.k === "flag" ? { k: "cmp", op: "==", l: e, r: { k: "const", text: "1" } } : e);

function parseExpr(r: Reader): Expr {
  return asTest(parseOr(r));
}

function parseOr(r: Reader): Expr {
  let l = parseAnd(r);
  while (r.eat("||")) l = { k: "or", l: asTest(l), r: asTest(parseAnd(r)) };
  return l;
}

function parseAnd(r: Reader): Expr {
  let l = parseCmp(r);
  while (r.eat("&&")) l = { k: "and", l: asTest(l), r: asTest(parseCmp(r)) };
  return l;
}

function parseCmp(r: Reader): Expr {
  const l = parseAdd(r);
  r.gap();
  for (const op of CMP_OPS) {
    if (r.peek(op)) {
      r.pos += op.length;
      return { k: "cmp", op, l, r: parseAdd(r) };
    }
  }
  return l;
}

function parseAdd(r: Reader): Expr {
  let l = parseMul(r);
  for (;;) {
    r.gap();
    const c = r.text[r.pos];
    if ((c === "+" || c === "-") && r.text[r.pos + 1] !== "=") { r.pos++; l = { k: "arith", op: c, l, r: parseMul(r) }; } else return l;
  }
}

function parseMul(r: Reader): Expr {
  let l = parseUnary(r);
  for (;;) {
    r.gap();
    const c = r.text[r.pos];
    if ((c === "*" || c === "/") && r.text[r.pos + 1] !== "/" && r.text[r.pos + 1] !== "=") { r.pos++; l = { k: "arith", op: c, l, r: parseUnary(r) }; } else return l;
  }
}

function parseUnary(r: Reader): Expr {
  r.gap();
  if (r.peek("!") && !r.peek("!=")) {
    r.pos++;
    // (pushed into a comparison: !flag(F) is the flag compared with 1 the other way, as it prints)
    return negate(asTest(parseUnary(r)));
  }
  return parseAtom(r);
}

function parseAtom(r: Reader): Expr {
  r.gap();
  if (r.eat("(")) {
    const e = parseExpr(r);
    r.expect(")");
    return e;
  }
  const start = r.pos;
  const m = /^(0x[0-9A-Fa-f]+|-?\d+|[A-Za-z_]\w*)/.exec(r.text.slice(r.pos));
  if (!m) r.fail("expected a condition");
  r.pos += m[0].length;
  const word = m[0];
  if ((word === "flag" || word === "var" || word === "const") && r.eat("(")) {
    const [arg] = r.args();
    if (!arg) r.fail(`${word}() needs its argument`, start);
    // A flag alone is the flag compared with 1
    if (word === "flag") return { k: "flag", arg };
    return { k: word, text: arg };
  }
  return isVarText(word) ? { k: "var", text: word } : { k: "const", text: word };
}

function parseBlock(r: Reader): Stmt[] {
  r.expect("{");
  const body = parseStmts(r, true);
  r.expect("}");
  return body;
}

function parseStmts(r: Reader, inBlock: boolean): Stmt[] {
  const out: Stmt[] = [];
  for (;;) {
    const lines = r.space();
    // (a blank line stays, as a statement)
    if (lines >= 2) out.push({ k: "blank" });
    if (r.pos >= r.text.length) {
      if (inBlock) r.fail("expected \"}\"");
      return out;
    }
    if (r.peek("}")) return out;
    if (r.peek("//")) {
      const end = r.text.indexOf("\n", r.pos);
      out.push({ k: "comment", text: r.text.slice(r.pos, end < 0 ? r.text.length : end).trimEnd() });
      r.pos = end < 0 ? r.text.length : end;
      continue;
    }
    out.push(parseStmt(r));
  }
}

function parseStmt(r: Reader): Stmt {
  const start = r.pos;
  if (r.keyword("if")) {
    r.expect("(");
    const cond = parseExpr(r);
    r.expect(")");
    if (r.keyword("goto")) {
      const target = r.word() ?? r.fail("expected a label");
      r.expect(";");
      return { k: "ifgoto", cond, target };
    }
    const then = parseBlock(r);
    const save = r.pos;
    if (r.keyword("else")) {
      // (else if: the if is the else's one statement)
      const at = r.pos;
      if (r.keyword("if")) {
        r.pos = at;
        return { k: "if", cond, then, else: [parseStmt(r)] };
      }
      return { k: "if", cond, then, else: parseBlock(r) };
    }
    r.pos = save;
    return { k: "if", cond, then };
  }
  if (r.keyword("goto")) {
    const target = r.word() ?? r.fail("expected a label");
    r.expect(";");
    return { k: "goto", target };
  }
  // An assignment: var(X) or a variable's number, then = += -= *= /= %=, then its value up to the ;
  const assign = /^(?:var\(\s*([^)]+?)\s*\)|(0x[0-9A-Fa-f]+|EVENT_WORK_\w+))\s*(\+=|-=|\*=|\/=|%=|=(?!=))/.exec(r.text.slice(r.pos));
  if (assign && (assign[1] || isVarText(assign[2]))) {
    r.pos += assign[0].length;
    const end = r.text.indexOf(";", r.pos);
    const line = r.text.indexOf("\n", r.pos);
    if (end < 0 || (line >= 0 && line < end)) r.fail("an assignment ends with ; on its line");
    const value = r.text.slice(r.pos, end).trim();
    if (!value) r.fail("expected a value");
    r.pos = end + 1;
    return { k: "assign", target: assign[1] ?? assign[2], op: assign[3] as AssignOp, value };
  }
  if (r.keyword("asm")) {
    r.gap();
    if (!r.peek("{")) r.fail("expected \"{\"");
    // Its lines as they are, up to a line that is only }
    const lineEnd = r.text.indexOf("\n", r.pos);
    if (lineEnd < 0) r.fail("an asm block's lines start on the next line");
    const lines: string[] = [];
    let at = lineEnd + 1;
    for (;;) {
      if (at >= r.text.length) r.fail("expected \"}\" to close asm", start);
      const next = r.text.indexOf("\n", at);
      const line = r.text.slice(at, next < 0 ? r.text.length : next);
      if (line.trim() === "}") { r.pos = at + line.indexOf("}") + 1; break; }
      lines.push(line);
      at = next < 0 ? r.text.length : next + 1;
    }
    return { k: "raw", lines };
  }
  const name = r.word();
  if (!name) r.fail("expected a statement");
  if (r.eat(":")) return { k: "label", name };
  if (!r.eat("(")) r.fail(`expected "(" after ${name}`);
  const args = r.args();
  r.expect(";");
  return { k: "call", name, args };
}

/** A script's text parsed: script N { ... }. */
export function parseScript(text: string): Script {
  const r = new Reader(text);
  r.gap();
  if (!r.keyword("script")) r.fail("expected \"script\"");
  r.gap();
  const m = /^\d+/.exec(text.slice(r.pos)) ?? r.fail("expected the script's number");
  r.pos += m[0].length;
  const body = parseBlock(r);
  r.gap();
  if (r.pos < text.length) r.fail("expected nothing after the script's }");
  return { number: Number(m[0]), body };
}
