// The Icon review page (temporary): one icon at a time, its vanilla art above the re-indexing methods' results (IHM
// and J, each normal and shiny), and a click (or 1, 2) keeps one for it; 3 flags the icon to fix by hand. An icon with
// extra candidates (flagged to fix by hand, or kept on one of them, when they were generated) shows the Flagged mode
// instead: the pick of IHM and J K started from, then G2, H, IH and K, on number keys 1-5 in that order, and 0 for the
// flag; while it is flagged, each candidate's "Keep and unflag" (Shift and its number) keeps it and clears the flag in
// one go. See model.ts and server/iconReview.ts.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api.ts";
import type { IconChoice, IconReviewDetail, IconReviewEntry, IconReviewState } from "../../../server/iconReview.ts";
import { FILTERS, METHOD_LABEL, afterChoosing, candidateColours, candidateOf, choiceOf, filterEntries, flaggedOrder, pixelsOf, progress, step,
  type ReviewFilter } from "./model.ts";

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

const CHOICE_LABEL = METHOD_LABEL;

/** What each method is, for the candidates' tooltips. */
const METHOD_HINT: Record<IconChoice, string> = {
  ihm: "IH with the wrong twins swapped (sections 10-11)",
  j: "IHM with the shiny palette as a second view (section 12)",
  g2: "F kept unless the registered battle sprite clearly disagrees (section 8)",
  h: "registration and colour shares must agree to leave F (section 9)",
  ih: "H's ramps with I's shading, before the twin swap (section 10)",
  k: "your pick corrected for the flagged icons' error classes (section 14)",
};

function Candidate({ detail, which, frame, chosen, shortcut, mark, onChoose, onUnflag }: {
  detail: IconReviewDetail; which: IconChoice; frame: number; chosen: boolean; shortcut: string; mark?: string;
  onChoose: () => void;
  /** Keeps it and clears the fix-by-hand flag (only while the icon is flagged). */
  onUnflag?: () => void;
}) {
  const normal = useMemo(() => candidateColours(detail, which, "normal"), [detail, which]);
  const shiny = useMemo(() => candidateColours(detail, which, "shiny"), [detail, which]);
  const c = candidateOf(detail, which);
  if (!c) return null;
  const swaps = c.swaps?.length ?? 0;
  return (
    <span className="ir-candidate-card">
      <button className={`ir-candidate${chosen ? " chosen" : ""}`} onClick={onChoose}
        title={`Keep ${CHOICE_LABEL[which]} for this icon (key ${shortcut}): ${METHOD_HINT[which]}`}>
        <span className="ir-candidate-head"><strong>{CHOICE_LABEL[which]}</strong>
          <span className="ir-key">{shortcut}</span>
          {mark && <span className="ir-flag ir-hand">{mark}</span>}
          {chosen && <span className="muted small">kept</span>}</span>
        <span className="ir-pair">
          <Icon hex={c.pixels} colours={normal} frame={frame} caption="normal" />
          <Icon hex={c.pixels} colours={shiny} frame={frame} caption="shiny" />
        </span>
        <span className="muted small ir-candidate-note">
          {c.slots.length} battle colours{swaps ? `, ${swaps} twin swap${swaps > 1 ? "s" : ""}` : ""}
          {which === "j" && c.moves?.length ? `, ${c.moves.length} family move${c.moves.length > 1 ? "s" : ""}` : ""}
          {which === "k" ? (c.changes?.length ? `, ${c.changes.length} change${c.changes.length > 1 ? "s" : ""} to ${CHOICE_LABEL[c.base ?? "ihm"]}` : `, the same as ${CHOICE_LABEL[c.base ?? "ihm"]}`) : ""}
        </span>
      </button>
      {onUnflag && <button className="ir-unflag small" onClick={onUnflag}
        title={`Keep ${CHOICE_LABEL[which]} and clear the fix-by-hand flag (Shift+${shortcut})`}>
        Keep and unflag <span className="ir-key">⇧{shortcut}</span></button>}
    </span>
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
  // The shown icon, kept in the list at its place after an action drops it from the filter, until the user moves on
  const [stay, setStay] = useState<string | null>(null);

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
  const review = useMemo(() => ({ choices: state?.choices ?? {}, fixByHand: state?.fixByHand ?? [], kBase: state?.kBase ?? {} }),
    [state?.choices, state?.fixByHand, state?.kBase]);
  const list = useMemo(() => filterEntries(entries, review, filter, stay), [entries, review, filter, stay]);
  const counts = useMemo(() => progress(entries, review), [entries, review]);
  const entry: IconReviewEntry | undefined = entries.find((e) => e.key === key);
  // The Flagged mode's candidates (an icon with extra candidates generated: flagged, or kept on one of them)
  const order = useMemo(() => (entry && detail && detail.key === entry.key ? flaggedOrder(detail) : []), [entry, detail]);
  const flaggedNow = !!key && review.fixByHand.includes(key);
  useEffect(() => {
    if (stay && key !== stay) setStay(null);
  }, [key, stay]);

  // The first icon of the list when nothing (or nothing known) is shown
  useEffect(() => {
    if (!entries.length) return;
    if (!key || !entries.some((e) => e.key === key)) setKey(list[0]?.key ?? entries[0].key);
  }, [entries, list, key]);
  // A filter that leaves the shown icon out of its list goes to the list's first icon
  useEffect(() => {
    if (list.length && !list.some((e) => e.key === key)) setKey(list[0].key);
    // (only when the filter changes: choosing can drop the shown icon from Undecided, and afterChoosing moves on)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);
  useEffect(() => {
    if (!key || !state?.ready) return;
    let live = true;
    api.iconReviewIcon(key).then((d) => live && setDetail(d)).catch((e: Error) => live && setMessage(e.message));
    return () => { live = false; };
  }, [key, state?.ready, state?.index?.generated]);

  /** unflag: also clears the fix-by-hand flag. Moves on as "go to the next icon after choosing" says; otherwise the icon
   * stays in the list even when it no longer matches the filter. */
  const choose = useCallback(async (choice: IconChoice | null, unflag = false) => {
    if (!key) return;
    const next = advance && choice !== null ? afterChoosing(list, key) : key;
    try {
      const saved = await api.iconReviewChoose(key, choice, unflag);
      setState((s) => (s ? { ...s, ...saved } : s));
      setMessage(null);
      if (next === key) setStay(key);
      else if (next) setKey(next);
    } catch (e) {
      setMessage((e as Error).message);
    }
  }, [key, list, advance]);

  /** Sets or clears the fix-by-hand flag; it never moves to another icon. */
  const toggleFlag = useCallback(async () => {
    if (!key) return;
    try {
      const saved = await api.iconReviewFlag(key, !(state?.fixByHand ?? []).includes(key));
      setState((s) => (s ? { ...s, ...saved } : s));
      setMessage(null);
      setStay(key);
    } catch (e) {
      setMessage((e as Error).message);
    }
  }, [key, state?.fixByHand]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // The Flagged mode: 1-5 the candidates in display order (with Shift, keep and unflag while flagged), 0 the flag;
      // otherwise 1 IHM, 2 J, 3 the flag. Shift+digit by the key's code: e.key is the shifted symbol.
      const digit = /^(?:Digit|Numpad)(\d)$/.exec(e.code)?.[1];
      if (e.shiftKey) {
        const m = digit ? order[Number(digit) - 1] : undefined;
        if (!m || !flaggedNow) return;
        choose(m, true);
        e.preventDefault();
        return;
      }
      const keys: Record<string, () => void> = order.length
        ? Object.fromEntries([["0", toggleFlag], ...order.map((m, i) => [String(i + 1), () => choose(m)])])
        : { 1: () => choose("ihm"), 2: () => choose("j"), 3: toggleFlag };
      if (keys[e.key]) keys[e.key]();
      else if (e.key === "ArrowRight" || e.key === "ArrowDown") setKey((k) => step(list, k, 1));
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") setKey((k) => step(list, k, -1));
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [choose, toggleFlag, list, order, flaggedNow]);

  const generate = async () => {
    const { started } = await api.iconReviewGenerate();
    if (!started) setMessage("The tool is already running.");
    load();
  };

  if (!state) return <div className="ir-page"><p className="muted">{message ?? "Reading…"}</p></div>;
  const gen = state.generate;
  const chosen = entry ? choiceOf(entry, choices) : null;
  const flagged = entry ? review.fixByHand.includes(entry.key) : false;
  const at = list.findIndex((e) => e.key === key);
  const filterHint = FILTERS.find((f) => f.id === filter)?.hint;

  return (
    <div className="ir-page">
      <div className="ir-page-head"><strong>Icon review</strong> <span className="ir-temp">temporary</span>
        <span className="muted small">Choose, per party/box icon, between two re-indexings onto its battle palettes (IHM and J);
          an icon flagged to fix by hand (or kept on one of them) also offers G2, H, IH and K.
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
          <h5>Review <span className="muted">{counts.decided} of {counts.needed} decided · IHM {counts.ihm} · J {counts.j}{counts.other ? ` · other ${counts.other}` : ""} · fix by hand {counts.flagged}</span></h5>
          <div className="ir-grid">
            <span className="ir-label">Show</span>
            <span className="ir-row">
              <span className="view-switch">
                {FILTERS.map((f) => <button key={f.id} className={filter === f.id ? "active" : ""} onClick={() => { setStay(null); setFilter(f.id); }}>{f.label}</button>)}
              </span>
              <span className="hint">{list.length} {list.length === 1 ? "icon" : "icons"}: {filterHint}</span>
            </span>
            <span className="ir-label">Icon</span>
            <span className="ir-row">
              <button onClick={() => setKey((k) => step(list, k, -1))} disabled={!list.length} title="The one before (←)">←</button>
              <select value={key ?? ""} onChange={(e) => setKey(e.target.value)}>
                {(list.length && at >= 0 ? list : entry ? [entry, ...list] : list).map((e) => (
                  <option key={e.key} value={e.key}>{e.label} {e.key}{e.suspects.length ? " (suspect)" : ""}{choices[e.key] ? ` (${CHOICE_LABEL[choices[e.key]]})` : ""}{review.fixByHand.includes(e.key) ? " ✎" : ""}</option>
                ))}
              </select>
              <button onClick={() => setKey((k) => step(list, k, 1))} disabled={!list.length} title="The next one (→)">→</button>
              <span className="hint">{at >= 0 ? `${at + 1} of ${list.length}` : "not in this list"}; ← → move, {order.length
                ? `${order.map((m, i) => `${i + 1} ${CHOICE_LABEL[m]}`).join(", ")}${flagged ? " (Shift: keep and unflag)" : ""}, 0 fix by hand (this icon's extra candidates)`
                : "1 IHM, 2 J, 3 fix by hand (a flag: stays on the icon)"}</span>
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
            {flagged && <span className="ir-flag ir-hand" title="Flagged to fix by hand later">✎ fix by hand</span>}
            {entry.suspects.length > 0 && <span className="ir-flag" title="On the suspects list: see Suspects below">⚑ suspect</span>}</h5>
          <div className="ir-actions">
            <button className={flagged ? "active" : ""} aria-pressed={flagged} onClick={toggleFlag}
              title={`Flag this icon to fix by hand later, on top of whichever candidate you keep (${order.length ? 0 : 3}); it doesn't move on`}>Fix by hand <span className="ir-key">{order.length ? "0" : "3"}</span></button>
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
            {order.length ? (
              <div className="ir-candidates">
                {order.map((m, i) => (
                  <Candidate key={m} detail={detail} which={m} frame={frame} chosen={chosen === m} shortcut={String(i + 1)}
                    mark={i === 0 ? "your pick" : undefined} onChoose={() => choose(m)}
                    onUnflag={flagged ? () => choose(m, true) : undefined} />
                ))}
              </div>
            ) : (
              <div className="ir-candidates">
                <Candidate detail={detail} which="ihm" frame={frame} chosen={chosen === "ihm"} shortcut="1" onChoose={() => choose("ihm")} />
                <Candidate detail={detail} which="j" frame={frame} chosen={chosen === "j"} shortcut="2" onChoose={() => choose("j")} />
              </div>
            )}
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
