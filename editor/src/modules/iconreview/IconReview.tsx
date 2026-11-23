// The Icon review page (temporary): one icon at a time, its vanilla art above the two re-indexing methods' results
// (IHM and J, each normal and shiny), and a click (or 1, 2, 3) keeps one for it. See model.ts and server/iconReview.ts.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api.ts";
import type { IconChoice, IconReviewDetail, IconReviewEntry, IconReviewState } from "../../../server/iconReview.ts";
import { FILTERS, afterChoosing, candidateColours, choiceOf, filterEntries, pixelsOf, progress, step, type ReviewFilter } from "./model.ts";

/** The box tray's grey, behind every icon as in the PC. */
const BOX = "#a8b8b0";
const ICON_SCALE = 4;
const FRONT_SCALE = 2;

/** Indexed pixels drawn nearest-neighbour: one frame (rows frame*height on) of a width-wide image. */
function Pixels({ hex, colours, width, height, frame = 0, scale }: {
  hex: string; colours: (string | null)[]; width: number; height: number; frame?: number; scale: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const px = useMemo(() => pixelsOf(hex), [hex]);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = BOX;
    ctx.fillRect(0, 0, width * scale, height * scale);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const c = colours[px[(frame * height + y) * width + x]];
        if (!c) continue;
        ctx.fillStyle = c;
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
  }, [px, colours, width, height, frame, scale]);
  return <canvas ref={ref} className="ir-pixels" width={width * scale} height={height * scale} />;
}

function Icon({ hex, colours, frame, caption }: { hex: string; colours: (string | null)[]; frame: number; caption: string }) {
  return (
    <figure className="ir-icon">
      <Pixels hex={hex} colours={colours} width={32} height={32} frame={frame} scale={ICON_SCALE} />
      <figcaption className="muted small">{caption}</figcaption>
    </figure>
  );
}

const CHOICE_LABEL: Record<IconChoice, string> = { ihm: "IHM", j: "J", manual: "by hand" };

function Candidate({ detail, which, frame, chosen, onChoose }: {
  detail: IconReviewDetail; which: "ihm" | "j"; frame: number; chosen: boolean; onChoose: () => void;
}) {
  const normal = useMemo(() => candidateColours(detail, which, "normal"), [detail, which]);
  const shiny = useMemo(() => candidateColours(detail, which, "shiny"), [detail, which]);
  const c = detail[which];
  return (
    <button className={`ir-candidate${chosen ? " chosen" : ""}`} onClick={onChoose}
      title={`Keep ${CHOICE_LABEL[which]} for this icon (key ${which === "ihm" ? 1 : 2})`}>
      <span className="ir-candidate-head"><strong>{CHOICE_LABEL[which]}</strong>
        <span className="muted small">{which === "ihm" ? "1" : "2"}{chosen ? " · kept" : ""}</span></span>
      <span className="ir-pair">
        <Icon hex={c.pixels} colours={normal} frame={frame} caption="normal" />
        <Icon hex={c.pixels} colours={shiny} frame={frame} caption="shiny" />
      </span>
      <span className="muted small ir-candidate-note">
        {c.slots.length} battle colours{c.swaps.length ? `, ${c.swaps.length} twin swap${c.swaps.length > 1 ? "s" : ""}` : ""}
        {which === "j" && c.moves?.length ? `, ${c.moves.length} family move${c.moves.length > 1 ? "s" : ""}` : ""}
      </span>
    </button>
  );
}

function Front({ detail, palette }: { detail: IconReviewDetail; palette: "normal" | "shiny" }) {
  const colours = useMemo(() => [null, ...detail[palette].slice(1)], [detail, palette]);
  if (!detail.front) return <span className="muted small">no battle sprite</span>;
  return (
    <figure className="ir-icon">
      <Pixels hex={detail.front.pixels} colours={colours} width={detail.front.width} height={detail.front.height} scale={FRONT_SCALE} />
      <figcaption className="muted small">{palette}</figcaption>
    </figure>
  );
}

export function IconReview() {
  const [state, setState] = useState<IconReviewState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<ReviewFilter>("undecided");
  const [key, setKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<IconReviewDetail | null>(null);
  const [animate, setAnimate] = useState(true);
  const [frame, setFrame] = useState(0);
  const [advance, setAdvance] = useState(true);

  const load = useCallback(() => api.iconReview().then(setState).catch((e: Error) => setMessage(e.message)), []);
  useEffect(() => { load(); }, [load]);
  // While the tool runs, ask again every two seconds
  useEffect(() => {
    if (!state?.generate.running) return;
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [state?.generate.running, load]);
  useEffect(() => {
    if (!animate) return;
    const t = setInterval(() => setFrame((f) => 1 - f), 400);
    return () => clearInterval(t);
  }, [animate]);

  const entries = state?.index?.entries ?? [];
  const choices = state?.choices ?? {};
  const list = useMemo(() => filterEntries(entries, choices, filter), [entries, choices, filter]);
  const counts = useMemo(() => progress(entries, choices), [entries, choices]);
  const entry: IconReviewEntry | undefined = entries.find((e) => e.key === key);

  // The first icon of the list when nothing (or nothing known) is shown
  useEffect(() => {
    if (!entries.length) return;
    if (!key || !entries.some((e) => e.key === key)) setKey(list[0]?.key ?? entries[0].key);
  }, [entries, list, key]);
  useEffect(() => {
    if (!key || !state?.ready) return;
    let live = true;
    api.iconReviewIcon(key).then((d) => live && setDetail(d)).catch((e: Error) => live && setMessage(e.message));
    return () => { live = false; };
  }, [key, state?.ready, state?.index?.generated]);

  const choose = useCallback(async (choice: IconChoice | null) => {
    if (!key) return;
    const next = advance && choice !== null ? afterChoosing(list, key) : key;
    try {
      const { choices: saved } = await api.iconReviewChoose(key, choice);
      setState((s) => (s ? { ...s, choices: saved } : s));
      setMessage(null);
      if (next) setKey(next);
    } catch (e) {
      setMessage((e as Error).message);
    }
  }, [key, list, advance]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "1") choose("ihm");
      else if (e.key === "2") choose("j");
      else if (e.key === "3") choose("manual");
      else if (e.key === "ArrowRight" || e.key === "ArrowDown") setKey((k) => step(list, k, 1));
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") setKey((k) => step(list, k, -1));
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [choose, list]);

  const generate = async () => {
    const { started } = await api.iconReviewGenerate();
    if (!started) setMessage("The tool is already running.");
    load();
  };

  if (!state) return <div className="ir-page"><p className="muted">{message ?? "Reading…"}</p></div>;
  const gen = state.generate;
  const chosen = entry ? choiceOf(entry, choices) : null;
  const at = list.findIndex((e) => e.key === key);
  const filterHint = FILTERS.find((f) => f.id === filter)?.hint;

  return (
    <div className="ir-page">
      <div className="ir-page-head"><strong>Icon review</strong> <span className="ir-temp">temporary</span>
        <span className="muted small">Choose, per party/box icon, between two re-indexings onto its battle palettes (IHM and J).
          Choices go to res/paperwhite2/icon_remap_choices.json; no icon in res/pokemon/ changes yet.</span></div>

      <section className="ir-section">
        <h5>Candidates <span className="muted">{state.ready && state.index
          ? `${state.index.icons} icons, generated ${state.index.generated}; IHM and J differ on ${state.index.differ}`
          : "not generated yet"}</span></h5>
        <div className="ir-actions">
          <button className={state.ready ? "" : "primary"} disabled={gen.running} onClick={generate}
            title="Runs tools/paperwhite2/icon_remap.py generate (about half a minute)">
            {gen.running ? "Generating…" : state.ready ? "Generate again" : "Generate the candidates"}</button>
          <span className="muted small">{gen.running ? "icon_remap.py is running"
            : gen.ok === false ? "The last run failed:" : gen.ok ? gen.output : `writes build/icon_review/ from res/ (ignored, regenerable)`}</span>
        </div>
        {gen.ok === false && <pre className="ir-output">{gen.output}</pre>}
      </section>

      {state.ready && (
        <section className="ir-section">
          <h5>Review <span className="muted">{counts.decided} of {counts.needed} decided · IHM {counts.ihm} · J {counts.j} · by hand {counts.manual}</span></h5>
          <div className="ir-grid">
            <span className="ir-label">Show</span>
            <span className="ir-row">
              <span className="view-switch">
                {FILTERS.map((f) => <button key={f.id} className={filter === f.id ? "active" : ""} onClick={() => setFilter(f.id)}>{f.label}</button>)}
              </span>
              <span className="hint">{list.length} {list.length === 1 ? "icon" : "icons"}: {filterHint}</span>
            </span>
            <span className="ir-label">Icon</span>
            <span className="ir-row">
              <button onClick={() => setKey((k) => step(list, k, -1))} disabled={!list.length} title="The one before (←)">←</button>
              <select value={key ?? ""} onChange={(e) => setKey(e.target.value)}>
                {(list.length && at >= 0 ? list : entry ? [entry, ...list] : list).map((e) => (
                  <option key={e.key} value={e.key}>{e.label} {e.key}{e.suspects.length ? " ⚑" : ""}{choices[e.key] ? ` (${CHOICE_LABEL[choices[e.key]]})` : ""}</option>
                ))}
              </select>
              <button onClick={() => setKey((k) => step(list, k, 1))} disabled={!list.length} title="The next one (→)">→</button>
              <span className="hint">{at >= 0 ? `${at + 1} of ${list.length}` : "not in this list"}; ← → move, 1 IHM, 2 J, 3 by hand</span>
            </span>
            <span className="ir-label">Frames</span>
            <span className="ir-row">
              <label><input type="checkbox" checked={animate} onChange={(e) => setAnimate(e.target.checked)} /> animate</label>
              {!animate && <span className="view-switch">
                {[0, 1].map((f) => <button key={f} className={frame === f ? "active" : ""} onClick={() => setFrame(f)}>frame {f + 1}</button>)}
              </span>}
              <label><input type="checkbox" checked={advance} onChange={(e) => setAdvance(e.target.checked)} /> go to the next icon after choosing</label>
            </span>
          </div>
        </section>
      )}

      {state.ready && entry && detail && detail.key === entry.key && (
        <section className="ir-section">
          <h5>{entry.label} {entry.key} <span className="muted">{entry.kind.replace("_", " ")} ·{" "}
            {entry.differ ? `IHM and J differ on ${entry.differ_frac >= 0.01 ? `${Math.round(100 * entry.differ_frac)}%` : "under 1%"} of its pixels` : "IHM and J are the same"}
            {" · "}{chosen ? `kept: ${CHOICE_LABEL[chosen]}` : "undecided"}</span>
            {entry.suspects.length > 0 && <span className="ir-flag" title="On the suspects list: see Suspects below">⚑ suspect</span>}</h5>
          <div className="ir-actions">
            <button className={chosen === "manual" ? "active" : ""} onClick={() => choose("manual")} title="Neither: fix this icon by hand (3)">Neither, fix by hand <span className="muted">3</span></button>
            {choices[entry.key] && <button onClick={() => choose(null)} title="Clear the choice">Clear the choice</button>}
          </div>
          <div className="ir-stage">
            <div className="ir-reference">
              <div className="ir-vanilla">
                <span className="ir-caption">Vanilla <span className="muted small">(the game today, the same for a shiny)</span></span>
                <Icon hex={detail.vanilla.pixels} colours={[null, ...detail.vanilla.palette.slice(1)]} frame={frame} caption="bank colours" />
              </div>
              <div className="ir-battle">
                <span className="ir-caption">Battle front <span className="muted small">for reference</span></span>
                <span className="ir-pair"><Front detail={detail} palette="normal" /><Front detail={detail} palette="shiny" /></span>
              </div>
            </div>
            <div className="ir-candidates">
              <Candidate detail={detail} which="ihm" frame={frame} chosen={chosen === "ihm"} onChoose={() => choose("ihm")} />
              <Candidate detail={detail} which="j" frame={frame} chosen={chosen === "j"} onChoose={() => choose("j")} />
            </div>
          </div>
          <div className="ir-grid">
            <span className="ir-label">Suspects</span>
            <span className="ir-row">
              {entry.suspects.length
                ? <ul className="ir-suspects">{entry.suspects.map((s, i) => <li key={i}><span className="ir-flag">{s.kind}</span> {s.px} px: {s.why}</li>)}</ul>
                : <span className="hint">none: its shiny behaviour agrees with the battle sprite's (on IHM)</span>}
            </span>
            <span className="ir-label">Files</span>
            <span className="ir-row"><span className="hint">{detail.icon} on {detail.group}/normal.pal and shiny.pal</span></span>
          </div>
        </section>
      )}
      {message && <p className="ir-message">{message}</p>}
    </div>
  );
}
