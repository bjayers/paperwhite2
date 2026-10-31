// The game's text banks (docs/data.md, Text): res/text/script/<bank>.txt, the story's (each zone's and each global
// script file's messages), and res/text/system/<bank>.txt, the rest. One message a line, "ID = text"; a line of
// another form (\pad{XX}, \from{...}) isn't a message the editor changes.

import { api } from "../../api.ts";

export const STORY = "res/text/script";
export const MISC = "res/text/system";

export interface Bank {
  path: string;
  /** Its file's name without .txt. */
  name: string;
  kind: "story" | "misc";
}

export interface Message {
  /** The file's line, from 1. */
  line: number;
  id: string | null;
  /** The message as the file writes it, or the whole line for a line that isn't one. */
  text: string;
}

export async function listBanks(): Promise<Bank[]> {
  const [story, misc] = await Promise.all([api.list(`${STORY}/*.txt`), api.list(`${MISC}/*.txt`)]);
  const bank = (path: string, kind: Bank["kind"]): Bank => ({ path, name: path.slice(path.lastIndexOf("/") + 1, -4), kind });
  return [...story.map((p) => bank(p, "story")), ...misc.map((p) => bank(p, "misc"))];
}

// "ID = text", or "ID =" for an empty message
const LINE = /^(\S+) =(?: (.*))?$/;

export function parseBank(text: string): Message[] {
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines.map((l, i) => {
    const m = LINE.exec(l);
    return m ? { line: i + 1, id: m[1], text: m[2] ?? "" } : { line: i + 1, id: null, text: l };
  });
}

/** The file with one message changed, its ID and every other line as they were. */
export function setMessage(fileText: string, line: number, message: string): string {
  const lines = fileText.split("\n");
  const m = LINE.exec(lines[line - 1] ?? "");
  if (!m) return fileText;
  lines[line - 1] = `${m[1]} = ${message.replace(/\r?\n/g, "\\n")}`;
  return lines.join("\n");
}

/** The bank whose header a script includes ("text/script/aspertia_city.h"), and so names its messages. */
export function bankOfInclude(include: string): string | null {
  const m = /^text\/(script|system)\/([\w]+)\.h$/.exec(include);
  return m ? `res/text/${m[1]}/${m[2]}.txt` : null;
}
