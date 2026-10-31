// A message as the text files write it (docs/data.md, Text) and as the game prints it: characters, line breaks, and
// control codes {TTTT:a,b}. The ones the preview acts on: {be01} waits for A, then the next line scrolls the box;
// {be00} waits for A, then clears it; {ff00:n} colors the letters that follow (0 the window's, 1 red, 2 blue, 255 back
// to the window's); {01xx:n} and {02xx:n} are words and numbers a script fills in (word set buffer n).

export type Token =
  | { kind: "char"; code: number }
  | { kind: "newline" }
  | { kind: "scroll" }
  | { kind: "clear" }
  | { kind: "color"; color: number }
  | { kind: "word"; type: number; index: number }
  | { kind: "code"; type: number; args: number[] }
  | { kind: "end" };

/** Turns a message's text (with \n, or real line breaks as in the JSON files) into its tokens. */
export function parseMessage(text: string): Token[] {
  const tokens: Token[] = [];
  let at = 0;
  if (text.startsWith("\\c")) at = 2; // stored compressed; the same text
  while (at < text.length) {
    const c = text[at];
    if (c === "\\") {
      const next = text[at + 1];
      if (next === "n") { tokens.push({ kind: "newline" }); at += 2; continue; }
      if (next === "x" && text[at + 2] === "{") {
        const close = text.indexOf("}", at);
        const code = parseInt(text.slice(at + 3, close), 16);
        tokens.push(code === 0xffff ? { kind: "end" } : { kind: "char", code });
        at = close + 1;
        continue;
      }
      if (next !== undefined) { tokens.push({ kind: "char", code: next.charCodeAt(0) }); at += 2; continue; }
    }
    if (c === "{") {
      const close = text.indexOf("}", at);
      const match = close > 0 ? /^([0-9a-fA-F]{4})(?::([0-9,\s]*))?$/.exec(text.slice(at + 1, close)) : null;
      if (match) {
        const type = parseInt(match[1], 16);
        const args = match[2] ? match[2].split(",").map((a) => Number(a.trim())) : [];
        if (type === 0xbe01) tokens.push({ kind: "scroll" });
        else if (type === 0xbe00) tokens.push({ kind: "clear" });
        else if (type === 0xff00) tokens.push({ kind: "color", color: args[0] ?? 0 });
        else if (type === 0xffff) tokens.push({ kind: "end" });
        else if (type >> 8 === 0x01 || type >> 8 === 0x02) tokens.push({ kind: "word", type, index: args[0] ?? 0 });
        else tokens.push({ kind: "code", type, args });
        at = close + 1;
        continue;
      }
    }
    if (c === "\n") { tokens.push({ kind: "newline" }); at++; continue; }
    const code = text.codePointAt(at)!;
    tokens.push({ kind: "char", code });
    at += code > 0xffff ? 2 : 1;
  }
  return tokens;
}

/** What a word placeholder shows in the preview: a number for {02xx}, else the buffer's sample word. */
export function wordSample(token: { type: number; index: number }, words: Record<number, string> = {}): string {
  if (words[token.index] !== undefined) return words[token.index];
  return token.type >> 8 === 0x02 ? "123" : `Word${token.index}`;
}

/** The file's form of a message for editing in a text box: \n as a real line break; everything else as written. */
export function toEditable(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\\" && text[i + 1] === "n") { out += "\n"; i++; }
    else if (text[i] === "\\" && text[i + 1] !== undefined) { out += text[i] + text[i + 1]; i++; }
    else out += text[i];
  }
  return out;
}

/** Back to the file's form: a line break is \n again. */
export function fromEditable(text: string): string {
  return text.replace(/\r?\n/g, "\\n");
}
