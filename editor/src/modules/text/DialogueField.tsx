// One message typed straight into a data file (an Entralink room's NPC dialogue; later the Overworld Editor's NPCs),
// with no text bank to manage: the build compiles it. Its buttons at the top add a wait or a new page where the caret
// is and fit the message to the window (message.ts, fitMessage); under the box, what the game would show wrongly (a
// line too wide, a line that scrolls away unread) and the preview of its window (TextBox.tsx, look). The message is in the
// text files' codes, with real line breaks as the JSON files keep them. Reusable: <DialogueField value onChange />;
// actions puts a row of the page's own controls above the buttons (the Entree page's window style).

import { useMemo, useRef, type ReactNode } from "react";
import { checkMessage, fitMessage } from "./message.ts";
import { TextBox, useMessageFont, type BoxLook } from "./TextBox.tsx";

export interface DialogueInsert {
  label: string;
  /** What it adds at the caret. */
  code: string;
  title: string;
}

/** The codes every message uses. A page with its own words (a player's name) adds its own, with words for the preview. */
export const DIALOGUE_INSERTS: DialogueInsert[] = [
  { label: "Wait", code: "{be01}\n", title: "Waits for A, then the next line scrolls in ({be01} and a line break)" },
  { label: "New page", code: "{be00}\n", title: "Waits for A, then clears the window for the next line ({be00} and a line break)" },
];

const NO_WORDS: Record<number, string> = {};

export function DialogueField({ value, onChange, placeholder, words = NO_WORDS, inserts = DIALOGUE_INSERTS, look, actions }: {
  /** The message; "" for none. */
  value: string;
  onChange(text: string): void;
  placeholder?: string;
  /** Sample words for the word set's buffers, for the preview and the widths. */
  words?: Record<number, string>;
  inserts?: DialogueInsert[];
  /** The window the preview draws (TextBox's look). Every field window is 30 by 4 tiles, so the widths are the same. */
  look?: BoxLook;
  /** More controls at the end of the buttons' row (a style picker). */
  actions?: ReactNode;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  const font = useMessageFont();
  const problems = useMemo(() => checkMessage(value, font, words), [value, font, words]);
  const fitted = useMemo(() => (font && value ? fitMessage(value, font, words) : value), [value, font, words]);

  const insert = (code: string) => {
    const el = box.current;
    const at = el ? el.selectionStart : value.length;
    const end = el ? el.selectionEnd : value.length;
    onChange(value.slice(0, at) + code + value.slice(end));
    requestAnimationFrame(() => {
      if (!box.current) return;
      box.current.focus();
      box.current.setSelectionRange(at + code.length, at + code.length);
    });
  };

  return (
    <div className="dialogue-field">
      {actions && <div className="dialogue-actions">{actions}</div>}
      <div className="dialogue-actions">
        {inserts.map((i) => <button key={i.label} title={i.title} onClick={() => insert(i.code)}>+ {i.label}</button>)}
        <span className="spacer" />
        <button disabled={fitted === value} onClick={() => onChange(fitted)}
                title="Breaks lines too wide for the window at a space, and adds a wait wherever a line would scroll away unread">
          Fit to the window
        </button>
      </div>
      <textarea ref={box} className="dialogue-text" value={value} placeholder={placeholder} spellCheck wrap="off"
                rows={Math.max(2, Math.min(10, value.split("\n").length + 1))} onChange={(e) => onChange(e.target.value)} />
      {problems.length > 0 && (
        <ul className="dialogue-problems">
          {problems.map((p, i) => <li key={i}>{p.message}</li>)}
        </ul>
      )}
      {value && <TextBox text={value} words={words} look={look} />}
    </div>
  );
}
