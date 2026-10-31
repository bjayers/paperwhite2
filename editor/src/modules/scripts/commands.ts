// The field scripts' commands: the macros of include/asm/field_script.inc (tools/script/field_script.py writes it),
// each a command's name and its parameters, read once, for the highlighting and the help at the cursor.

import { api } from "../../api.ts";

export interface Command {
  name: string;
  params: string[];
}

let commands: Promise<Map<string, Command>> | null = null;

export function loadCommands(): Promise<Map<string, Command>> {
  if (!commands) {
    commands = api.scan("include/asm/field_script.inc", "^\\s*\\.macro\\s").then((lines) => {
      const map = new Map<string, Command>();
      for (const { text } of lines) {
        const m = /^\s*\.macro\s+(\w+)\s*(.*)$/.exec(text);
        if (m) map.set(m[1], { name: m[1], params: m[2].split(",").map((p) => p.trim()).filter(Boolean) });
      }
      return map;
    });
    commands.catch(() => { commands = null; });
  }
  return commands;
}

export type TokenKind = "comment" | "label" | "directive" | "command" | "unknown" | "message" | "constant" | "number" | "ref" | "string" | "plain";

export interface Span {
  kind: TokenKind;
  text: string;
}

const LABEL = /^([A-Za-z_]\w*):/;
const WORD = /[A-Za-z_]\w*|0x[0-9A-Fa-f]+|-?\d+|"(?:[^"\\]|\\.)*"|\/\/.*|\S/g;

/** One line's colors: its comment, label, directive, command (unknown ones marked), and the words after it. */
export function highlightLine(line: string, known: Map<string, Command> | null): Span[] {
  const spans: Span[] = [];
  let at = 0;
  const push = (kind: TokenKind, text: string) => text && spans.push({ kind, text });
  const label = LABEL.exec(line);
  if (label) {
    push("label", label[0]);
    at = label[0].length;
  } else if (/^\s*#/.test(line)) {
    push("directive", line);
    return spans;
  }
  let first = true;
  WORD.lastIndex = at;
  let m: RegExpExecArray | null;
  while ((m = WORD.exec(line))) {
    push("plain", line.slice(at, m.index));
    const word = m[0];
    let kind: TokenKind = "plain";
    if (word.startsWith("//")) kind = "comment";
    else if (word.startsWith('"')) kind = "string";
    else if (/^(0x[0-9A-Fa-f]+|-?\d+)$/.test(word)) kind = "number";
    else if (/^[A-Za-z_]/.test(word)) {
      if (first && !label) kind = !known || known.has(word) || word.startsWith(".") ? "command" : "unknown";
      else if (/_Text_/.test(word)) kind = "message";
      else if (/^(L|Script|Movement|Conditions|Data)_\w+$/.test(word)) kind = "ref";
      else if (/^[A-Z][A-Z0-9_]+$/.test(word)) kind = "constant";
      first = false;
    }
    push(kind, word);
    at = m.index + word.length;
  }
  push("plain", line.slice(at));
  return spans;
}

/** The scripts of a file, in its ScriptEntry table's order: each one's number, label and line. */
export interface ScriptEntry {
  index: number;
  label: string;
  /** The label's line, from 1, or null when the file has no such label. */
  line: number | null;
}

export function scriptEntries(text: string): ScriptEntry[] {
  const lines = text.split("\n");
  const labels = new Map<string, number>();
  lines.forEach((l, i) => {
    const m = LABEL.exec(l);
    if (m) labels.set(m[1], i + 1);
  });
  const entries: ScriptEntry[] = [];
  for (const l of lines) {
    const m = /^\s*ScriptEntry\s+(\w+)/.exec(l);
    if (m) entries.push({ index: entries.length + 1, label: m[1], line: labels.get(m[1]) ?? null });
  }
  return entries;
}

/** The lines of one script: from its label to the next script's label (its own labels and movements with it). */
export function scriptRange(text: string, entry: ScriptEntry): { start: number; end: number } | null {
  if (entry.line === null) return null;
  const lines = text.split("\n");
  const starts = new Set(scriptEntries(text).map((e) => e.line).filter((l): l is number => l !== null));
  let end = lines.length;
  for (let i = entry.line; i < lines.length; i++) {
    if (starts.has(i + 1)) { end = i; break; }
  }
  // Leave the blank lines before the next script outside it
  while (end > entry.line && lines[end - 1].trim() === "") end--;
  return { start: entry.line, end };
}

/** The file with one script's lines replaced. */
export function replaceScript(text: string, range: { start: number; end: number }, script: string): string {
  const lines = text.split("\n");
  lines.splice(range.start - 1, range.end - range.start + 1, ...script.split("\n"));
  return lines.join("\n");
}

/** The text bank a script file names, from its #include "text/script/<bank>.h". */
export function textBankOf(text: string): string | null {
  const m = /#include\s+"text\/(script|system)\/(\w+)\.h"/.exec(text);
  return m ? `res/text/${m[1]}/${m[2]}.txt` : null;
}
