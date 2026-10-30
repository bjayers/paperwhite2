// A species' habitats on the map of Unova: each place it lives in coloured by its seasons there (pink spring, green
// summer, orange autumn, blue winter; white for all four, diagonal stripes for two or three), labelled with how it's
// met there (methods, rarity, periods, weather). For seeing a species move across the region with the seasons.

import { useMemo, useState } from "react";
import type { EditorState } from "./EncounterEditor.tsx";
import { areasByPlace } from "./lookup.ts";
import { SEASONS, type Season, type SpeciesEncounters } from "./model.ts";
import { RegionMap } from "./RegionMap.tsx";
import { namesArea } from "./resolve.ts";
import { label, slotSummary } from "./ui.tsx";

export const SEASON_COLORS: Record<Season, string> = { spring: "#f29cc3", summer: "#5cc46a", autumn: "#f09a3e", winter: "#5c9ff0" };
const ALL_COLOR = "#ffffff";

const patternId = (seasons: Season[]) => `stripes-${seasons.join("-")}`;

/** Diagonal stripes of the seasons' colours, one pattern per combination of two or three seasons. */
function stripePatterns() {
  const combos: Season[][] = [];
  for (let mask = 1; mask < 15; mask++) {
    const list = SEASONS.filter((_, i) => mask & (1 << i));
    if (list.length >= 2 && list.length <= 3) combos.push(list);
  }
  return combos.map((list) => (
    <pattern key={patternId(list)} id={patternId(list)} width={list.length * 2} height="2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      {list.map((s, i) => <rect key={s} x={i * 2} y="0" width="2" height="2" fill={SEASON_COLORS[s]} />)}
    </pattern>
  ));
}

export function seasonFill(seasons: Season[]): string | undefined {
  if (!seasons.length) return undefined;
  if (seasons.length === 4) return ALL_COLOR;
  if (seasons.length === 1) return SEASON_COLORS[seasons[0]];
  return `url(#${patternId(seasons)})`;
}

export function SpeciesHabitatMap({ state, entry }: { state: EditorState; entry: SpeciesEncounters }) {
  const { loaded, draft } = state;
  const [art, setArt] = useState(true);
  const [labels, setLabels] = useState(true);
  const [hover, setHover] = useState<string | null>(null);
  const byPlace = useMemo(() => areasByPlace(loaded), [loaded]);

  const info = useMemo(() => new Map(loaded.places.map((p) => {
    const areas = byPlace.get(p.zone) ?? [];
    const habitats = entry.habitats.filter((h) => areas.some((a) => namesArea(h, a, draft.groups)));
    const seasons = SEASONS.filter((s) => habitats.some((h) => h.seasons[s]));
    // How it's met there: a coupled habitat's one slot, or each season's of a decoupled one
    const lines = [...new Set(habitats.flatMap((h) => {
      const present = SEASONS.filter((s) => h.seasons[s]);
      return h.coupled ? (present.length ? [slotSummary(state, h.seasons[present[0]]!)] : []) :
        present.map((s) => `${label(s)}: ${slotSummary(state, h.seasons[s]!)}`);
    }))];
    return [p.zone, { seasons, lines }];
  })), [loaded.places, byPlace, entry, draft.groups, state]);

  const name = (zone: string) => label(zone.replace(/^ZONE_/, "").toLowerCase());
  const shown = hover ? info.get(hover) : undefined;

  return (
    <div className="enc-habitat-map">
      <div className="enc-row">
        {SEASONS.map((s) => <span key={s} className="enc-legend"><span className="enc-swatch" style={{ background: SEASON_COLORS[s] }} />{label(s)}</span>)}
        <span className="enc-legend"><span className="enc-swatch" style={{ background: ALL_COLOR }} />All year</span>
        <span className="enc-legend"><span className="enc-swatch stripes" />Some seasons</span>
        <span className="spacer" />
        <label className="enc-check"><input type="checkbox" checked={art} onChange={(e) => setArt(e.target.checked)} />Map art</label>
        <label className="enc-check"><input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} />Labels</label>
      </div>
      <div className="enc-habitat-map-body">
        <RegionMap places={loaded.places} art={art} hover={hover} onHover={setHover} defs={stripePatterns()}
                   onClick={(p) => byPlace.get(p.zone)?.[0] && state.showArea(byPlace.get(p.zone)![0])}
                   styleOf={(p) => {
                     const i = info.get(p.zone)!;
                     if (!i.seasons.length) return art ? null : { title: name(p.zone) };
                     return { fill: seasonFill(i.seasons), opacity: 0.95, title: `${name(p.zone)}\n${i.lines.join("\n")}`,
                       label: labels ? i.lines[0] + (i.lines.length > 1 ? " …" : "") : undefined };
                   }} />
        <div className="enc-map-detail small">
          {shown && shown.seasons.length ? (
            <>
              <strong>{name(hover!)}</strong>
              <p className="muted">{shown.seasons.length === 4 ? "All year" : shown.seasons.map(label).join(", ")}</p>
              {shown.lines.map((l) => <p key={l}>{l}</p>)}
            </>
          ) : <p className="muted">Point at a place to see how it's met there; click it to open its area.</p>}
        </div>
      </div>
    </div>
  );
}
