// A species' party icon (res/pokemon/<species>/icon.png, its first frame), for any editor that lists Pokémon. The
// PNG's own colors are the preview's; the game takes them from the shared icon palettes, which match.

import { api } from "../../api.ts";

/** "SPECIES_MR_MIME" as its folder, "mr_mime". */
export const speciesFolder = (species: string) => species.replace(/^SPECIES_/, "").toLowerCase();

export function SpeciesIcon({ species, size = 32 }: { species: string; size?: number }) {
  if (!species || species === "SPECIES_NONE") return <span className="species-icon empty" style={{ width: size, height: size }} />;
  return (
    <span className="species-icon" style={{ width: size, height: size }}>
      <img src={api.assetUrl(`res/pokemon/${speciesFolder(species)}/icon.png`)} alt="" style={{ width: size, height: size * 2 }}
           onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
    </span>
  );
}
