// The Script Editor's language view (docs/paperwhite2/design/script-language.md): a script of a .s file shown in the
// script language (editor/shared/scriptlang/), and the user's text put back into its block with the save's checks; a
// script restored to the original game's or the last commit's, and a new script added; the language's highlighting
// and the call under the caret, for the sidebar.

import { api } from "../../api.ts";
import { ParseError, parseScript, printScript, type Script } from "../../../shared/scriptlang/lang.ts";
import { parseS, scriptBlocks, type SLine } from "../../../shared/scriptlang/sfile.ts";
import { CompileError, Names, compileScript, decompileBlock, labelUses, replaceBlock, type RefCommand, type RefGlobal } from "../../../shared/scriptlang/translate.ts";
import { scriptDifference } from "../../../shared/scriptlang/equiv.ts";
import { valueContext, type ValueContext } from "../../../shared/scriptlang/values.ts";
import type { Span } from "./commands.ts";

export const REFERENCE = "res/paperwhite2/scripts/commands.json";
export const GLOBALS = "res/paperwhite2/scripts/globals.json";

let reference: Promise<{ commands: RefCommand[]; globals: RefGlobal[] }> | null = null;

/** The command reference and the named globals, read once (again after an edit to either, through reload). */
export function loadReference(reload = false): Promise<{ commands: RefCommand[]; globals: RefGlobal[] }> {
  if (!reference || reload) {
    reference = Promise.all([
      api.file(REFERENCE).then((f) => (JSON.parse(f.text) as { commands: RefCommand[] }).commands, () => [] as RefCommand[]),
      api.file(GLOBALS).then((f) => (JSON.parse(f.text) as { globals: RefGlobal[] }).globals, () => [] as RefGlobal[]),
    ]).then(([commands, globals]) => ({ commands, globals }));
  }
  return reference;
}

/** What the translation needs: the names, and the values' context (the constants and the file's text bank's ids). */
export interface LangEnv {
  names: Names;
  ctx: ValueContext;
}

export function langEnv(macros: Iterable<string>, ref: { commands: RefCommand[]; globals: RefGlobal[] }, constants: ReadonlyMap<string, number>,
                        messages: string[], texts?: string[]): LangEnv {
  return { names: new Names(macros, ref.commands, ref.globals), ctx: valueContext(constants, messages, texts) };
}

/** A script of the file as the language shows it, or null where the file has no such script. */
export function showScript(fileText: string, number: number, env: LangEnv): string | null {
  const lines = parseS(fileText);
  const block = scriptBlocks(lines).find((b) => b.number === number);
  if (!block) return null;
  return printScript(decompileBlock(lines, block.start, block.end, number, env.names, labelUses(lines), env.ctx));
}

export type Applied =
  | { ok: true; text: string; reads: string; same: boolean }
  | { ok: false; error: string; line?: number; detail?: string };

/** The user's script put back into its block: its lines in the file's place, after two checks, either failing writes
 * nothing: (1) the new block, read back into the language and put back again, runs the same (so the script reopens as
 * one that means what was saved); (2) it reads as the user's script (same is FALSE where it doesn't: tidied jumps). */
export function applyScript(fileText: string, number: number, draft: string, env: LangEnv): Applied {
  let script: Script;
  try {
    script = parseScript(draft);
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, error: e.message, line: e.line };
    throw e;
  }
  if (script.number !== number) return { ok: false, error: `This is script ${number}: its first line is script ${number} {` };
  const lines = parseS(fileText);
  const block = scriptBlocks(lines).find((b) => b.number === number);
  if (!block) return { ok: false, error: `The file has no script ${number}` };
  let compiled: string[];
  try {
    compiled = compileScript(script, block.label, env.names, takenLabels(lines, block), env.ctx);
  } catch (e) {
    if (e instanceof CompileError) return { ok: false, error: e.message };
    throw e;
  }
  const text = replaceBlock(fileText, block.start, block.end, compiled);
  // (1) read back and put back again: the same program
  const newLines = parseS(text);
  const newBlock = scriptBlocks(newLines).find((b) => b.number === number)!;
  const readBack = decompileBlock(newLines, newBlock.start, newBlock.end, number, env.names, labelUses(newLines), env.ctx);
  const again = replaceBlock(text, newBlock.start, newBlock.end, compileScript(readBack, newBlock.label, env.names, takenLabels(newLines, newBlock), env.ctx));
  const difference = scriptDifference(text, again, block.label, env.names, env.ctx);
  if (difference) {
    return { ok: false, error: "The script doesn't read back as it was written, so nothing was saved (please report this one)",
             detail: `${difference.message}: ${JSON.stringify(difference.a)} / ${JSON.stringify(difference.b)}` };
  }
  const reads = printScript(readBack);
  return { ok: true, text, reads, same: reads === printScript(script) };
}

/** The labels the file has outside a block, which a new block's labels keep clear of. */
function takenLabels(lines: SLine[], block: { start: number; end: number }): Set<string> {
  const taken = new Set<string>();
  lines.forEach((l, i) => { if (l.kind === "label" && (i < block.start || i >= block.end)) taken.add(l.name); });
  return taken;
}

/** A script's block restored from another version of the file (the original game's or the last commit's): the file
 * with it in place, or a message where that version has no such script. */
export function restoreScript(fileText: string, number: number, otherText: string): { text: string } | { error: string } {
  const other = parseS(otherText);
  const from = scriptBlocks(other).find((b) => b.number === number);
  if (!from) return { error: `That version of the file has no script ${number}` };
  const lines = parseS(fileText);
  const block = scriptBlocks(lines).find((b) => b.number === number);
  if (!block) return { error: `The file has no script ${number}` };
  const restored = otherText.split("\n").slice(from.start, from.end);
  // (its label as this file names the script)
  restored[0] = `${block.label}:`;
  const text = replaceBlock(fileText, block.start, block.end, restored);
  // A label of it that another script of this file has too would clash
  const seen = new Map<string, number>();
  for (const l of parseS(text)) if (l.kind === "label") seen.set(l.name, (seen.get(l.name) ?? 0) + 1);
  const twice = [...seen].filter(([, n]) => n > 1).map(([name]) => name);
  if (twice.length) return { error: `Restoring it would name ${twice.join(", ")} twice in the file` };
  return { text };
}

/** The file with a new script after its last: its ScriptEntry after the table's last, and its block (an end) at the
 * file's end, before its closing alignment. Its number, and the text. */
export function addScript(fileText: string): { number: number; text: string } {
  const lines = fileText.split("\n");
  const parsed = parseS(fileText);
  const count = scriptBlocks(parsed).length;
  const taken = new Set(parsed.filter((l) => l.kind === "label").map((l) => (l as { name: string }).name));
  let n = count + 1;
  let label = `Script_${n}`;
  while (taken.has(label)) label = `Script_${++n}_new`;
  const lastEntry = lines.map((l) => /^\s*ScriptEntry\s/.test(l)).lastIndexOf(true);
  lines.splice(lastEntry + 1, 0, `    ScriptEntry ${label}`);
  let end = lines.length;
  while (end > 0 && lines[end - 1].trim() === "") end--;
  const closing = /^\s*\.balign\b/.test(lines[end - 1] ?? "") ? end - 1 : end;
  lines.splice(closing, 0, "", `${label}:`, "    VMHalt");
  return { number: count + 1, text: lines.join("\n") };
}

// ---- Highlighting and the caret's call

const KEYWORDS = new Set(["script", "if", "else", "goto", "asm", "sub", "alias"]);
const BUILTINS = new Set(["var", "flag", "const"]);
const TOKEN = /\/\/.*|0x[0-9A-Fa-f]+|-?\d+|[A-Za-z_]\w*|"(?:[^"\\]|\\.)*"|\S/g;

/** A line of the language's colors: comments, keywords, commands (unknown ones marked), labels, numbers, constants. */
export function highlightLang(line: string, known: (name: string) => boolean): Span[] {
  const spans: Span[] = [];
  const label = /^\s*([A-Za-z_]\w*):\s*$/.exec(line);
  if (label) return [{ kind: "label", text: line }];
  let at = 0;
  TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN.exec(line))) {
    if (m.index > at) spans.push({ kind: "plain", text: line.slice(at, m.index) });
    const word = m[0];
    let kind: Span["kind"] = "plain";
    if (word.startsWith("//")) kind = "comment";
    else if (word.startsWith('"')) kind = "string";
    else if (/^(0x[0-9A-Fa-f]+|-?\d+)$/.test(word)) kind = "number";
    else if (KEYWORDS.has(word)) kind = "directive";
    else if (/^[A-Za-z_]/.test(word)) {
      const call = line.slice(m.index + word.length).trimStart().startsWith("(");
      if (call) kind = BUILTINS.has(word) || known(word) ? "command" : "unknown";
      else if (/^(L|Script|Movement|Conditions|Data)_\w+$/.test(word)) kind = "ref";
      else if (/^[A-Z][A-Z0-9_]+$/.test(word)) kind = "constant";
    }
    spans.push({ kind, text: word });
    at = m.index + word.length;
  }
  if (at < line.length) spans.push({ kind: "plain", text: line.slice(at) });
  return spans;
}

/** The call the caret is in on its line: its name, which argument (from 0), and that argument's text and place; the
 * argument is -1 on the name. Null outside any call. */
export interface CaretCall {
  name: string;
  arg: number;
  argText: string;
  /** The argument's place in the line: [start, end). */
  start: number;
  end: number;
}

export function callAt(line: string, column: number): CaretCall | null {
  // Each call's name and its parentheses, innermost holding the caret wins
  let best: CaretCall | null = null;
  const re = /([A-Za-z_]\w*)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    const open = m.index + m[0].length - 1;
    let depth = 0;
    let close = -1;
    for (let i = open; i < line.length; i++) {
      if (line[i] === "(") depth++;
      else if (line[i] === ")" && --depth === 0) { close = i; break; }
    }
    if (close < 0) close = line.length;
    if (column < m.index || column > close) continue;
    if (column <= open) { best = { name: m[1], arg: -1, argText: "", start: m.index, end: open }; continue; }
    // The argument: commas outside inner parentheses
    let arg = 0;
    let start = open + 1;
    let inner = 0;
    for (let i = open + 1; i < close; i++) {
      if (line[i] === "(") inner++;
      else if (line[i] === ")") inner--;
      else if (line[i] === "," && inner === 0) {
        if (i < column) { arg++; start = i + 1; }
      }
    }
    let end = close;
    inner = 0;
    for (let i = start; i < close; i++) {
      if (line[i] === "(") inner++;
      else if (line[i] === ")") inner--;
      else if (line[i] === "," && inner === 0) { end = i; break; }
    }
    best = { name: m[1], arg, argText: line.slice(start, end).trim(), start, end };
  }
  return best;
}
