// Unova as the town map draws it: the game's own art (res/graphics/townmap_gra, drawn by the server) under the town
// map's places, each a pill along its route or a circle for a town, cave or landmark, in the art's own pixels (the
// places' positions are the art's). The art fills the top 176 rows of its 256 by 256 screen, below which the town map
// shows its menus, so that is all it draws. The pages give each place its fill and what it says on hover.

import type { ReactNode } from "react";
import { api } from "../../api.ts";
import { TOWN_MAP_ART, type Place } from "./load.ts";

/** The rows of the town map's screen that hold the map art. */
const ART_HEIGHT = 176;

export interface PlaceStyle {
  /** A CSS color or a url(#pattern); undefined draws the place hollow. */
  fill?: string;
  opacity?: number;
  title: string;
  /** Drawn beside the place, in map pixels. */
  label?: string;
}

export function RegionMap({ places, styleOf, art, hover, onHover, onClick, defs }: {
  places: Place[];
  styleOf(place: Place): PlaceStyle | null;
  art: boolean;
  hover?: string | null;
  onHover?(zone: string | null): void;
  onClick?(place: Place): void;
  /** Patterns and gradients the styles refer to. */
  defs?: ReactNode;
}) {
  return (
    <svg className="enc-region" viewBox={`0 0 256 ${ART_HEIGHT}`} role="img" aria-label="Map of Unova" onMouseLeave={() => onHover?.(null)}>
      {defs && <defs>{defs}</defs>}
      <rect x="0" y="0" width="256" height={ART_HEIGHT} className="enc-map-bg" />
      {art && <image href={api.screenUrl(TOWN_MAP_ART.chars, TOWN_MAP_ART.screen, TOWN_MAP_ART.palette)} x="0" y="0" width="256" height="256"
                     preserveAspectRatio="xMinYMin" className="enc-map-art" style={{ imageRendering: "pixelated" }} />}
      {places.map((p) => {
        const style = styleOf(p);
        if (!style) return null;
        const route = p.type === 1 && (p.hit.start.x !== p.hit.end.x || p.hit.start.y !== p.hit.end.y);
        const common = {
          className: `enc-place${style.fill ? "" : " empty"}${hover === p.zone ? " hover" : ""}`,
          style: style.fill ? { fill: style.fill, stroke: style.fill.startsWith("url") ? undefined : style.fill, fillOpacity: style.opacity,
            strokeOpacity: style.opacity } : undefined,
          onMouseEnter: () => onHover?.(p.zone),
          onClick: () => onClick?.(p),
        };
        // A route is a pill from its hit area's start to its end, as wide as the town map draws routes
        const shape = route ? (
          <rect {...common} x={Math.min(p.hit.start.x, p.hit.end.x) - 3} y={Math.min(p.hit.start.y, p.hit.end.y) - 3}
                width={Math.abs(p.hit.end.x - p.hit.start.x) + 6} height={Math.abs(p.hit.end.y - p.hit.start.y) + 6} rx={3}>
            <title>{style.title}</title>
          </rect>
        ) : (
          <circle {...common} cx={p.position.x} cy={p.position.y} r={p.type === 0 ? 4.5 : 3.2}>
            <title>{style.title}</title>
          </circle>
        );
        const lx = route ? Math.max(p.hit.start.x, p.hit.end.x) + 5 : p.position.x + 6;
        const ly = route ? (p.hit.start.y + p.hit.end.y) / 2 + 1.5 : p.position.y + 1.5;
        return (
          <g key={p.zone}>
            {shape}
            {style.label && <text x={lx} y={ly} className="enc-map-label">{style.label}</text>}
          </g>
        );
      })}
    </svg>
  );
}

/** The heatmap's colour schemes: a value from 0 to 1 as a CSS color. */
export const SCHEMES = [
  { id: "accent", label: "Accent", stops: null },
  { id: "bgyr", label: "Blue → green → yellow → red", stops: ["#3b6fd8", "#3fae5a", "#e8c53a", "#d8453b"] },
  { id: "rygb", label: "Red → yellow → green → blue", stops: ["#d8453b", "#e8c53a", "#3fae5a", "#3b6fd8"] },
] as const;
export type SchemeId = (typeof SCHEMES)[number]["id"];

function mix(a: string, b: string, t: number): string {
  const ca = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const cb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${ca.map((v, i) => Math.round(v + (cb[i] - v) * t)).join(",")})`;
}

export function schemeColor(scheme: SchemeId, t: number): { fill: string; opacity: number } {
  const stops = SCHEMES.find((s) => s.id === scheme)!.stops;
  if (!stops) return { fill: "var(--accent)", opacity: 0.25 + 0.75 * t };
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  return { fill: mix(stops[i], stops[i + 1], x - i), opacity: 0.9 };
}

export function schemeGradient(scheme: SchemeId): string {
  const stops = SCHEMES.find((s) => s.id === scheme)!.stops;
  return stops ? `linear-gradient(to right, ${stops.join(", ")})` :
    "linear-gradient(to right, color-mix(in srgb, var(--accent) 25%, transparent), var(--accent))";
}
