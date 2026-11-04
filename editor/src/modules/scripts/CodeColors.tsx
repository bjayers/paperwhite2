// The Script Editor's Colors panel: each kind of token's color, bold and italic, and the code editor's background,
// text and line numbers, with ready-made sets and a sample in every kind. A change shows at once in every code editor
// (codeColors.ts), the ones other editors embed too, and is kept in this browser.

import { KEYS, PRESETS, setColors, useColors, type ColorKey, type Look } from "./codeColors.ts";

const PARTS = new Set<ColorKey>(["background", "text", "gutter"]);

/** A color input needs #rrggbb: the look's, or the computed one shown where none is chosen. */
function shownColor(key: ColorKey, look: Look | undefined): string {
  if (look?.color) return look.color;
  const base = KEYS.find((k) => k.key === key)!.base.color;
  if (base) return base;
  const probe = document.querySelector(key === "background" ? ".code-editor" : key === "gutter" ? ".code-gutter" : key === "unknown" ? ".tok-unknown" : ".code-shown");
  const rgb = probe ? getComputedStyle(probe)[key === "background" ? "backgroundColor" : "color"] : "";
  const m = /rgba?\((\d+), (\d+), (\d+)/.exec(rgb);
  return m ? `#${m.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, "0")).join("")}` : "#808080";
}

export function CodeColors({ onClose }: { onClose(): void }) {
  const colors = useColors();
  const change = (key: ColorKey, look: Look | null) => {
    const next = { ...colors };
    if (look && Object.values(look).some((v) => v !== undefined)) next[key] = look; else delete next[key];
    setColors(next);
  };
  return (
    <div className="scr-text-window code-colors">
      <div className="scr-section-head">
        <strong>Code colors</strong> <span className="muted small">for every script editor</span>
        <span className="spacer" />
        <select value="" onChange={(e) => { const p = PRESETS[e.target.value]; e.target.value = ""; if (p) setColors({ ...p }); }} title="Puts in a ready-made set">
          <option value="">Preset…</option>
          {Object.keys(PRESETS).map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <button onClick={onClose}>Close</button>
      </div>
      <div className="code-colors-list">
        {KEYS.map(({ key, label, sample, base }) => {
          const look = colors[key];
          const bold = look?.bold ?? !!base.bold;
          const italic = look?.italic ?? !!base.italic;
          return (
            <div key={key} className="code-colors-row">
              <input type="color" value={shownColor(key, look)} onChange={(e) => change(key, { ...look, color: e.target.value })} title={`${label}: its color`} />
              <span className="code-colors-label">{label}</span>
              {PARTS.has(key) ? <span /> : (
                <span className="code-colors-style">
                  <button className={bold ? "active" : ""} onClick={() => change(key, { ...look, bold: !bold })} title="Bold"><b>B</b></button>
                  <button className={italic ? "active" : ""} onClick={() => change(key, { ...look, italic: !italic })} title="Italic"><i>I</i></button>
                </span>
              )}
              <code className={`code-colors-sample ${PARTS.has(key) ? `part-${key}` : `tok-${key}`}`}>{sample || "\u00a0"}</code>
              <button className="link small" onClick={() => change(key, null)} disabled={!look} title="Back to the default">Reset</button>
            </div>
          );
        })}
      </div>
      <div className="code-editor code-colors-preview">
        <div className="code-gutter">1<br />2<br />3<br />4</div>
        <pre className="code-colors-shown">
          <span className="tok-directive">script</span> <span className="tok-number">3</span> {"{"}{"\n"}
          {"    "}<span className="tok-command">lock_all</span>();  <span className="tok-comment">// "Hello!"</span>{"\n"}
          {"    "}<span className="tok-directive">if</span> (<span className="tok-command">var</span>(<span className="tok-number">0x4060</span>) == <span className="tok-constant">TALKED</span>) <span className="tok-ref">heal_party</span>();{"\n"}
          <span className="tok-label">L_0144:</span> <span className="tok-unknown">no_such_command</span>(<span className="tok-string">"text"</span>);
        </pre>
      </div>
      <div className="scr-section-head">
        <span className="muted small">Kept in this browser. Default is the editor's own colors; Reset all puts every one back.</span>
        <span className="spacer" />
        <button onClick={() => setColors({})} disabled={!Object.keys(colors).length}>Reset all</button>
      </div>
    </div>
  );
}
