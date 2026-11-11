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
  lines[line - 1] = messageLine(m[1], message.replace(/\r?\n/g, "\\n"));
  return lines.join("\n");
}

/** A message's line as text_data.py writes it: "ID = text", and "ID =" with no space for an empty message. */
function messageLine(id: string, text: string): string {
  return text ? `${id} = ${text}` : `${id} =`;
}

// Adding and removing messages. A message's number is its place in the bank. The build makes a header of the IDs'
// numbers (tools/text/text_ids.py), so the scripts and code that name a message by its ID stay right when numbers
// change. But code and data also give messages by number (a range like the Castelia crowds' msg_base in
// res/field/castelia_rush/, a table in a C file, a system bank read by an index such as a species'), which no search
// can find for certain. So the editor only adds a message after the last one and removes only the last one, which
// moves no other message.

/** The ID a new message of the bank gets, as text_data.py's unpacking names an empty message: "<Bank>_Text_Empty",
 * then "_Empty_2" and on, the first one the bank doesn't have. */
export function newMessageId(messages: Message[], bankName: string): string {
  const ids = new Set(messages.map((m) => m.id).filter((id): id is string => id !== null));
  const named = [...ids].find((id) => id.includes("_Text_"));
  const prefix = named ? named.slice(0, named.indexOf("_Text_"))
    : /^\d+$/.test(bankName) ? `Bank${bankName}`
    : bankName.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
  const base = `${prefix}_Text_Empty`;
  if (!ids.has(base)) return base;
  for (let n = 2; ; n++) if (!ids.has(`${base}_${n}`)) return `${base}_${n}`;
}

const isPad = (line: string) => line.startsWith("\\pad{");

/** The file with a new message after the last one (before the \pad{XX} line that may end the file), and its line. */
export function appendMessage(fileText: string, id: string, message = ""): { text: string; line: number } {
  const lines = fileText.split("\n");
  let at = lines.length;
  while (at > 0 && (lines[at - 1] === "" || isPad(lines[at - 1]))) at--;
  lines.splice(at, 0, messageLine(id, message.replace(/\r?\n/g, "\\n")));
  return { text: lines.join("\n"), line: at + 1 };
}

/** The bank's last message, if the editor can remove it: a message line, not a \from line's messages. */
export function lastMessage(messages: Message[]): Message | null {
  const lines = messages.filter((m) => m.id !== null || !isPad(m.text));
  const last = lines[lines.length - 1];
  return last && last.id !== null ? last : null;
}

/** The file without its last message (see lastMessage), or null if it has none the editor can remove. */
export function removeLastMessage(fileText: string): string | null {
  const last = lastMessage(parseBank(fileText));
  if (!last) return null;
  const lines = fileText.split("\n");
  lines.splice(last.line - 1, 1);
  return lines.join("\n");
}

/** A message's number in its bank (as the game and text_ids.py count), or null in a bank with \from lines, each of
 * which stands for many messages. */
export function messageNumber(messages: Message[], line: number): number | null {
  if (messages.some((m) => m.id === null && m.text.startsWith("\\from{"))) return null;
  const index = messages.filter((m) => m.id !== null).findIndex((m) => m.line === line);
  return index < 0 ? null : index;
}

/** The files that can name a message by its ID: the scripts, data, and code that includes its bank's header. */
export const ID_REFERENCE_GLOBS = ["res/**/*.s", "res/**/*.json", "src/**/*.c", "src/**/*.h", "include/**/*.h"];

/** The bank whose header a script includes ("text/script/aspertia_city.h"), and so names its messages. */
export function bankOfInclude(include: string): string | null {
  const m = /^text\/(script|system)\/([\w]+)\.h$/.exec(include);
  return m ? `res/text/${m[1]}/${m[2]}.txt` : null;
}
