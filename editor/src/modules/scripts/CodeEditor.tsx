// A code editor for the field scripts: a plain textarea over a highlighted copy of its text, line numbers beside it,
// so typing, selecting, undo in the box and the browser's search all work as in any text box. Each line is
// highlighted once and redrawn only when it changes, which keeps a file of thousands of lines quick. Reusable: any
// editor can show a script with <CodeEditor value={...} onChange={...} />.

import { memo, useEffect, useMemo, useRef } from "react";
import { highlightLine, type Command } from "./commands.ts";

const Line = memo(function Line({ text, known }: { text: string; known: Map<string, Command> | null }) {
  const spans = highlightLine(text, known);
  return (
    <div className="code-line">
      {spans.length ? spans.map((s, i) => (s.kind === "plain" ? s.text : <span key={i} className={`tok-${s.kind}`}>{s.text}</span>)) : "​"}
    </div>
  );
});

export interface Caret {
  /** From 1. */
  line: number;
  column: number;
  /** The word at the caret, and the line's first word (its command). */
  word: string;
  command: string;
}

export function CodeEditor({ value, onChange, commands, firstLine = 1, onCaret, readOnly, goToLine }: {
  value: string;
  onChange(value: string): void;
  commands: Map<string, Command> | null;
  /** The number of the first line, when the text is a part of a file. */
  firstLine?: number;
  onCaret?(caret: Caret): void;
  readOnly?: boolean;
  /** Scrolls to a line (of the shown text, from 1) when it changes. */
  goToLine?: number | null;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  const shown = useRef<HTMLDivElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const lines = useMemo(() => value.split("\n"), [value]);

  const sync = () => {
    if (!area.current) return;
    if (shown.current) { shown.current.scrollTop = area.current.scrollTop; shown.current.scrollLeft = area.current.scrollLeft; }
    if (gutter.current) gutter.current.scrollTop = area.current.scrollTop;
  };

  const caret = () => {
    const el = area.current;
    if (!el || !onCaret) return;
    const before = el.value.slice(0, el.selectionStart);
    const line = before.split("\n").length;
    const lineStart = before.lastIndexOf("\n") + 1;
    const lineText = el.value.slice(lineStart, el.value.indexOf("\n", lineStart) < 0 ? undefined : el.value.indexOf("\n", lineStart));
    const column = el.selectionStart - lineStart;
    const left = /[\w]*$/.exec(lineText.slice(0, column))![0];
    const right = /^[\w]*/.exec(lineText.slice(column))![0];
    onCaret({ line: line + firstLine - 1, column, word: left + right, command: /^\s*(\w+)/.exec(lineText)?.[1] ?? "" });
  };

  useEffect(() => {
    if (!goToLine || !area.current) return;
    const lineHeight = 20;
    area.current.scrollTop = Math.max(0, (goToLine - 4) * lineHeight);
    const offset = lines.slice(0, goToLine - 1).reduce((n, l) => n + l.length + 1, 0);
    area.current.setSelectionRange(offset, offset);
    sync();
    // Only a new line to go to scrolls
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goToLine]);

  return (
    <div className="code-editor">
      <div className="code-gutter" ref={gutter}>
        {lines.map((_, i) => <div key={i}>{i + firstLine}</div>)}
        <div className="code-pad" />
      </div>
      <div className="code-stack">
        <div className="code-shown" ref={shown} aria-hidden>
          {lines.map((l, i) => <Line key={i} text={l} known={commands} />)}
          <div className="code-pad" />
        </div>
        <textarea ref={area} className="code-input" value={value} spellCheck={false} readOnly={readOnly} wrap="off"
                  onChange={(e) => onChange(e.target.value)} onScroll={sync} onKeyUp={caret} onClick={caret}
                  onKeyDown={(e) => {
                    // Tab indents with four spaces, as the scripts are written
                    if (e.key === "Tab" && !e.shiftKey && !readOnly) {
                      e.preventDefault();
                      const el = e.currentTarget;
                      const { selectionStart: s, selectionEnd: t } = el;
                      onChange(el.value.slice(0, s) + "    " + el.value.slice(t));
                      requestAnimationFrame(() => el.setSelectionRange(s + 4, s + 4));
                    }
                  }} />
      </div>
    </div>
  );
}
