// The code editor's colors (CodeEditor.tsx): each kind of token's color, bold and italic, and the editor's background,
// text and line numbers, chosen in the Script Editor's Colors panel (CodeColors.tsx). Kept in this browser and set as
// CSS variables on the page's root, so every code editor follows them, the ones other editors embed too.

import { useSyncExternalStore } from "react";
import type { TokenKind } from "./commands.ts";

export interface Look {
  color?: string;
  bold?: boolean;
  italic?: boolean;
}

/** The editor's own parts, beside the tokens. */
export type Part = "background" | "text" | "gutter";
export type ColorKey = Exclude<TokenKind, "plain"> | Part;

/** Each key, its name in the panel, and its look when none is chosen (the stylesheet's; a part's is the theme's). */
export const KEYS: { key: ColorKey; label: string; sample: string; base: Look }[] = [
  { key: "command", label: "Commands", sample: "lock_all", base: { color: "#3d6fd8" } },
  { key: "directive", label: "Keywords and directives", sample: "if", base: { color: "#8b5cb8" } },
  { key: "number", label: "Numbers", sample: "0x4060", base: { color: "#b0306a" } },
  { key: "constant", label: "Constants and aliases", sample: "SEQ_SE_DECIDE1", base: { color: "#1f7a72" } },
  { key: "label", label: "Labels", sample: "L_0144:", base: { color: "#b5651d", bold: true } },
  { key: "ref", label: "Routine and movement names", sample: "heal_party", base: { color: "#b5651d" } },
  { key: "comment", label: "Comments", sample: "// a note", base: { color: "#6a8a5a", italic: true } },
  { key: "string", label: "Strings", sample: "\"text\"", base: { color: "#9a6700" } },
  { key: "message", label: "Message IDs (.s)", sample: "VirbankCity_Text_Hello", base: { color: "#8b5cb8" } },
  { key: "unknown", label: "Unknown commands", sample: "no_such_command", base: {} },
  { key: "text", label: "Other text", sample: "( ) ;", base: {} },
  { key: "gutter", label: "Line numbers", sample: "42", base: {} },
  { key: "background", label: "Background", sample: "", base: {} },
];

export type Colors = Partial<Record<ColorKey, Look>>;

/** Ready-made sets: the stylesheet's, and two well-known editor themes. */
export const PRESETS: Record<string, Colors> = {
  Default: {},
  "VS Code Dark+": {
    background: { color: "#1e1e1e" }, text: { color: "#d4d4d4" }, gutter: { color: "#858585" },
    command: { color: "#dcdcaa" }, directive: { color: "#c586c0" }, number: { color: "#b5cea8" }, constant: { color: "#4fc1ff" },
    label: { color: "#4ec9b0", bold: true }, ref: { color: "#4ec9b0" }, comment: { color: "#6a9955", italic: true },
    string: { color: "#ce9178" }, message: { color: "#9cdcfe" }, unknown: { color: "#f44747" },
  },
  Monokai: {
    background: { color: "#272822" }, text: { color: "#f8f8f2" }, gutter: { color: "#90908a" },
    command: { color: "#a6e22e" }, directive: { color: "#f92672" }, number: { color: "#ae81ff" }, constant: { color: "#66d9ef" },
    label: { color: "#fd971f", bold: true }, ref: { color: "#fd971f" }, comment: { color: "#88846f", italic: true },
    string: { color: "#e6db74" }, message: { color: "#66d9ef" }, unknown: { color: "#f92672" },
  },
};

const STORE = "code-colors";
const listeners = new Set<() => void>();
let current: Colors = read();

function read(): Colors {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) ?? "{}");
    return saved && typeof saved === "object" ? (saved as Colors) : {};
  } catch {
    // Storage can be unavailable or hold something else: the stylesheet's colors.
    return {};
  }
}

/** The chosen colors as the page's CSS variables (a key not chosen keeps the stylesheet's). */
function apply(colors: Colors) {
  const style = document.documentElement.style;
  for (const { key } of KEYS) {
    const look = colors[key];
    const set = (name: string, value: string | undefined) => (value ? style.setProperty(name, value) : style.removeProperty(name));
    set(`--code-${key}`, look?.color);
    set(`--code-${key}-weight`, look?.bold === undefined ? undefined : look.bold ? "600" : "normal");
    set(`--code-${key}-style`, look?.italic === undefined ? undefined : look.italic ? "italic" : "normal");
  }
}

apply(current);
// (another tab's choice)
window.addEventListener("storage", (e) => {
  if (e.key !== STORE) return;
  current = read();
  apply(current);
  listeners.forEach((l) => l());
});

export function setColors(colors: Colors) {
  current = colors;
  apply(colors);
  try {
    localStorage.setItem(STORE, JSON.stringify(colors));
  } catch {
    // Not remembered; they apply until the page reloads.
  }
  listeners.forEach((l) => l());
}

export function useColors(): Colors {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => current);
}
