// How the script language shows a value, by its argument's kind (the command reference's), and how it's stored back
// (docs/paperwhite2/design/script-language.md, numbers for species and flags): a message by its line in the file's text
// bank (its index, from 0, as Frost's line numbers were), a flag and a species by number, a variable by its number
// in hex. Back in the .s each takes the constant's name where there is one (the message's id, EVENT_FLAG_..., SPECIES_,
// EVENT_WORK_...), so the files read as before. Without a context (no constants), values show as they are written.

export interface ValueContext {
  /** Every constant's value, by name (the build's datajson.constants()). */
  constants: ReadonlyMap<string, number>;
  /** The file's text bank's message ids, by line, and their texts as the bank writes them (for the .s's comments). */
  messages: string[];
  texts?: string[];
  /** Each prefix's names by value, made when first asked. */
  byValue: Map<string, Map<number, string>>;
  messageLine: Map<string, number>;
}

export function valueContext(constants: ReadonlyMap<string, number>, messages: string[], texts?: string[]): ValueContext {
  return { constants, messages, texts, byValue: new Map(), messageLine: new Map(messages.map((id, i) => [id, i])) };
}

/** A text bank's messages' texts in order, as messageIds gives their ids. */
export function messageTexts(bankText: string): string[] {
  return [...bankText.matchAll(/^[A-Za-z_]\w* =(?: (.*))?$/gm)].map((m) => m[1] ?? "");
}

/** A text bank's message ids in order, from its .txt (one message a line: id = text, or id = for an empty one). */
export function messageIds(bankText: string): string[] {
  return [...bankText.matchAll(/^([A-Za-z_]\w*) =(?: |$)/gm)].map((m) => m[1]);
}

/** The text bank a script file includes for its messages: the name of res/text/script/<bank>.txt, or null. */
export function scriptBank(fileText: string): string | null {
  return /^#include "text\/script\/(\w+)\.h"/m.exec(fileText)?.[1] ?? null;
}

const PREFIXES: Record<string, string> = { flag: "EVENT_FLAG_", species: "SPECIES_", var: "EVENT_WORK_" };

function nameOf(ctx: ValueContext, prefix: string, value: number): string | undefined {
  let map = ctx.byValue.get(prefix);
  if (!map) {
    map = new Map();
    for (const [name, v] of ctx.constants) if (name.startsWith(prefix) && !map.has(v)) map.set(v, name);
    ctx.byValue.set(prefix, map);
  }
  return map.get(value);
}

/** A value's number: a constant's, a hex or decimal number's; undefined for anything else. */
export function numberOf(text: string, ctx?: ValueContext): number | undefined {
  const t = text.trim();
  if (/^0x[0-9a-f]+$/i.test(t)) return parseInt(t, 16);
  if (/^-?\d+$/.test(t)) return Number(t);
  return ctx?.constants.get(t);
}

/** A value as the language shows it, by its kind. */
export function showValue(text: string, kind: string | undefined, ctx?: ValueContext): string {
  if (!ctx || !kind) return text;
  const t = text.trim();
  switch (kind) {
    case "message": {
      const line = ctx.messageLine.get(t);
      return line === undefined ? t : String(line);
    }
    case "flag":
    case "species": {
      // (a variable's number stays a variable)
      const n = numberOf(t, ctx);
      return n === undefined || (/^0x/i.test(t) && n >= 0x4000) ? t : String(n);
    }
    case "var": {
      if (!t.startsWith(PREFIXES.var)) return t;
      const n = numberOf(t, ctx);
      return n === undefined ? t : `0x${n.toString(16).padStart(4, "0")}`;
    }
    default: return t;
  }
}

/** A value as the .s stores it, by its kind; a message for one that can't be. */
export function storeValue(text: string, kind: string | undefined, ctx?: ValueContext): string | { error: string } {
  if (!ctx || !kind) return text;
  const t = text.trim();
  switch (kind) {
    case "message": {
      // (a number past the bank's lines stays a number: some commands take one there, 65535 for none; the editor
      // warns about one that may be a mistake)
      if (!/^\d+$/.test(t)) return t;
      return ctx.messages[Number(t)] ?? t;
    }
    case "flag":
    case "species":
    case "var": {
      const n = /^\d+$/.test(t) || (kind === "var" && /^0x[0-9a-f]+$/i.test(t)) ? numberOf(t, ctx) : undefined;
      if (n === undefined) return t;
      return nameOf(ctx, PREFIXES[kind], n) ?? t;
    }
    default: return t;
  }
}
