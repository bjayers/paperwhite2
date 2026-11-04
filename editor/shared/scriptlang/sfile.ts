// A field script file (res/field/scripts/<file>.s, docs/scripts.md) as lines the script language works with: labels,
// commands (a macro of include/asm/field_script.inc and its arguments) and everything else kept as written (blank
// lines, comments, directives, the preprocessor's lines), each with its text, so a block can be written back as it was.
//
// A file's scripts are its ScriptEntry table's labels; a script's block runs from its label to the next script's (or
// the file's end), with the labels, routines and data after it.

export type SLine =
  | { kind: "label"; name: string; text: string }
  | { kind: "cmd"; name: string; args: string[]; text: string }
  | { kind: "other"; text: string };

const LABEL = /^([A-Za-z_]\w*):\s*(\/\/.*)?$/;
const COMMAND = /^\s+([A-Za-z_]\w*)(?:\s+(.*?))?\s*$/;

/** A command's arguments: split at the commas outside parentheses, each trimmed. */
export function splitArgs(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "," && depth === 0) {
      out.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  const last = text.slice(start).trim();
  if (last || out.length) out.push(last);
  return out;
}

export function parseS(text: string): SLine[] {
  return text.split("\n").map((line): SLine => {
    const label = LABEL.exec(line);
    if (label && !label[2]) return { kind: "label", name: label[1], text: line };
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith(".") || trimmed.startsWith("#")) return { kind: "other", text: line };
    const cmd = COMMAND.exec(line);
    // (a command with a comment after it is kept as written)
    if (cmd && !line.includes("//")) return { kind: "cmd", name: cmd[1], args: cmd[2] ? splitArgs(cmd[2]) : [], text: line };
    return { kind: "other", text: line };
  });
}

export interface ScriptBlock {
  /** Its number in the file's ScriptEntry table, from 1, and its label. */
  number: number;
  label: string;
  /** Its lines: [start, end) of the file's. */
  start: number;
  end: number;
}

/** The file's scripts' blocks, in the file's order: each from its label to the next script's label or the file's end. */
export function scriptBlocks(lines: SLine[]): ScriptBlock[] {
  const entries: string[] = [];
  for (const l of lines) {
    const m = /^\s*ScriptEntry\s+(\w+)/.exec(l.text);
    if (m) entries.push(m[1]);
  }
  const numbers = new Map<string, number>();
  entries.forEach((name, i) => { if (!numbers.has(name)) numbers.set(name, i + 1); });
  const starts: { label: string; at: number }[] = [];
  lines.forEach((l, i) => { if (l.kind === "label" && numbers.has(l.name)) starts.push({ label: l.name, at: i }); });
  return starts.map((s, i) => ({ number: numbers.get(s.label)!, label: s.label, start: s.at, end: starts[i + 1]?.at ?? lines.length }));
}
