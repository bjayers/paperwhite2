// The build's output, live. Lines that name a file under res/ open it; errors and warnings stand out.

import { useEffect, useRef } from "react";
import type { BuildState } from "../../shared/api.ts";

const RES_PATH = /(res\/[\w./-]+\.json)/;

function lineClass(line: string): string {
  if (/\berror\b|FAILED|Traceback|Error:/i.test(line)) return "line error";
  if (/\bwarning\b/i.test(line)) return "line warning";
  return "line";
}

export function BuildPanel({ state, lines, onOpen, onClose }: {
  state: BuildState;
  lines: string[];
  onOpen(path: string): void;
  onClose(): void;
}) {
  // The log follows its newest line by scrolling only itself: scrollIntoView would scroll every box around it too,
  // which in Edge could move the whole page out of view
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [lines.length]);
  const seconds = state.startedAt ? Math.round(((state.finishedAt ?? Date.now()) - state.startedAt) / 1000) : 0;

  return (
    <section className="build-panel">
      <header>
        <strong>Build</strong>
        <code className="muted small">{state.command}</code>
        <span className="spacer" />
        <span className={`build-status ${state.running ? "running" : state.exitCode === 0 ? "ok" : state.exitCode === null ? "" : "failed"}`}>
          {state.running ? `Building… ${seconds}s` : state.exitCode === null ? "Not run yet" :
            state.exitCode === 0 ? `Built in ${seconds}s` : `Failed (exit ${state.exitCode})`}
        </span>
        <button className="icon" title="Hide" onClick={onClose}>×</button>
      </header>
      <div className="log" ref={log}>
        {lines.map((line, i) => {
          const match = RES_PATH.exec(line);
          if (!match) return <div key={i} className={lineClass(line)}>{line || " "}</div>;
          const [before, after] = [line.slice(0, match.index), line.slice(match.index + match[1].length)];
          return (
            <div key={i} className={lineClass(line)}>
              {before}<button className="link" onClick={() => onOpen(match[1])}>{match[1]}</button>{after}
            </div>
          );
        })}
      </div>
    </section>
  );
}
