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

// ---- Fitting a message to the talk window ----------------------------------------------------------------------------

/** How wide a line of the field's talk window is, in pixels: its 30 tiles less the text's 8-pixel margin
 * (TextBox.tsx, ActorMsgWin_CreateAtBottom). */
export const TEXT_WIDTH = 30 * 8 - 8;
/** What the checks need of a font: each letter's advance. */
export interface Advances { glyph(code: number): { advance: number } }

export interface MessageProblem {
  /** The line of the message (1 the first), as the text box's lines are. */
  line: number;
  message: string;
}

const WAIT = "{be01}";

function width(tokens: Token[], font: Advances, words: Record<number, string>): number {
  let w = 0;
  for (const t of tokens) {
    if (t.kind === "char") w += font.glyph(t.code).advance;
    else if (t.kind === "word") for (const c of wordSample(t, words)) w += font.glyph(c.codePointAt(0)!).advance;
  }
  return w;
}

/** What the game would show wrongly: a line wider than the window (cut off at its edge), and a line that scrolls out
 * of the window's two before the player has had to press A while it showed (it flies past unread). Widths only with a
 * font. */
export function checkMessage(text: string, font: Advances | null, words: Record<number, string> = {}): MessageProblem[] {
  const out: MessageProblem[] = [];
  const tokens = parseMessage(text);
  let line = 1;
  let lineTokens: Token[] = [];
  let box: { line: number; seen: boolean }[] = [{ line: 1, seen: false }];
  let cleared = false;
  const endLine = () => {
    if (!font) return;
    const w = width(lineTokens, font, words);
    if (w > TEXT_WIDTH) out.push({ line, message: `Line ${line} runs ${w - TEXT_WIDTH} pixels past the window's edge, which cuts it off.` });
  };
  for (const t of tokens) {
    if (t.kind === "end") break;
    if (t.kind === "newline") {
      endLine();
      line++;
      lineTokens = [];
      if (cleared) { cleared = false; box = [{ line, seen: false }]; continue; }
      if (box.length === 2) {
        const top = box.shift()!;
        if (!top.seen) out.push({ line: top.line, message: `Line ${top.line} scrolls away before the player presses A: end line ${top.line} or ${top.line + 1} with a wait (${WAIT}).` });
      }
      box.push({ line, seen: false });
    } else if (t.kind === "scroll") {
      box.forEach((b) => { b.seen = true; });
    } else if (t.kind === "clear") {
      cleared = true;
      box = [{ line, seen: false }];
    } else {
      if (t.kind === "char" || t.kind === "word") { cleared = false; box[box.length - 1].line = line; }
      lineTokens.push(t);
    }
  }
  endLine();
  return out;
}

/** The message fitted to the window as the game's own messages are: each line too wide broken at its last space that
 * fits, and a wait ({be01}) added at the end of a box's second line wherever a line would scroll away unread. Codes
 * and the line breaks and waits already there are kept; a word wider than the window stays as it is. The message
 * comes back in its own form (real line breaks, or the text files' \n). */
export function fitMessage(text: string, font: Advances, words: Record<number, string> = {}): string {
  const escaped = !text.includes("\n") && text.includes("\\n");
  const measure = (s: string) => width(parseMessage(s), font, words);
  const lines: string[] = [];
  for (const line of (escaped ? toEditable(text) : text).split("\n")) {
    if (measure(line) <= TEXT_WIDTH) { lines.push(line); continue; }
    let current = "";
    for (const word of line.split(" ")) {
      const next = current ? `${current} ${word}` : word;
      if (current && measure(next) > TEXT_WIDTH) { lines.push(current); current = word; }
      else current = next;
    }
    lines.push(current);
  }
  // The window's two lines: a line pushed out must have shown during a wait
  let box: { index: number; seen: boolean }[] = [];
  let cleared = true;
  lines.forEach((line, i) => {
    if (cleared) { box = [{ index: i, seen: false }]; cleared = false; }
    else {
      if (box.length === 2) {
        const top = box.shift()!;
        if (!top.seen) { lines[i - 1] += WAIT; box.forEach((b) => { b.seen = true; }); }
      }
      box.push({ index: i, seen: false });
    }
    if (line.includes(WAIT)) box.forEach((b) => { b.seen = true; });
    if (line.includes("{be00}")) cleared = true;
  });
  const out = lines.join("\n");
  return escaped ? fromEditable(out) : out;
}

/** The follower's dialogue's words (docs/paperwhite2/following-pokemon.md): the word set's buffers 0 to 3. */
export const FOLLOWER_WORDS: Record<number, string> = { 0: "Snivy", 1: "Rosa", 2: "Route 20", 3: "Oran Berry" };

/** The follower's dialogue's message (Frost's codes: [N] a new line, [L] the next line after A, [C] a new page after A,
 * and {nickname}, {player}, {location}, {item}) as the game's codes, as following_dialogue.py packs it. */
export function fromFollowerText(text: string): string {
  return text.replace(/\[N\]/g, "\n").replace(/\[L\]/g, "{be01}\n").replace(/\[C\]/g, "{be00}\n")
    .replace(/\{nickname\}/g, "{0100:0}").replace(/\{player\}/g, "{0100:1}")
    .replace(/\{location\}/g, "{0100:2}").replace(/\{item\}/g, "{0100:3}");
}
