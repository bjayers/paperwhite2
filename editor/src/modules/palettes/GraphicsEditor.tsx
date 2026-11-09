// Graphics & Palettes: the Screens page turns art from an image editor into the game's screens, the Sprite sheets page
// imports sheets of OBJ art that the build packs whole, the Palettes page edits every palette of res/, and the Shinies
// page shows every Pokémon's normal and shiny colors side by side.

import { useState } from "react";
import type { ToolProps } from "../types.ts";
import { PaletteEditor } from "./PaletteEditor.tsx";
import { ScreensPage } from "./ScreensPage.tsx";
import { ShiniesPage } from "./ShiniesPage.tsx";
import { SpriteSheetsPage } from "./SpriteSheetsPage.tsx";

type Page = "screens" | "sheets" | "palettes" | "shinies";

export function GraphicsEditor({ constants }: ToolProps) {
  const [page, setPage] = useState<Page>("screens");
  const [requested, setRequested] = useState<{ path: string } | undefined>();
  return (
    <div className="gfx-editor">
      <nav className="gfx-pages view-switch">
        <button className={page === "screens" ? "active" : ""} onClick={() => setPage("screens")}>Screens</button>
        <button className={page === "sheets" ? "active" : ""} onClick={() => setPage("sheets")}>Sprite sheets</button>
        <button className={page === "palettes" ? "active" : ""} onClick={() => setPage("palettes")}>Palettes</button>
        <button className={page === "shinies" ? "active" : ""} onClick={() => setPage("shinies")}>Shinies</button>
      </nav>
      {/* These stay mounted, so a page keeps its work while another is shown */}
      <div className={`gfx-page${page === "screens" ? "" : " hidden"}`}>
        <ScreensPage onOpenPalette={(path) => { setRequested({ path }); setPage("palettes"); }} />
      </div>
      <div className={`gfx-page${page === "sheets" ? "" : " hidden"}`}>
        <SpriteSheetsPage />
      </div>
      <div className={`gfx-page${page === "palettes" ? "" : " hidden"}`}>
        <PaletteEditor requested={requested} />
      </div>
      {page === "shinies" && (
        <div className="gfx-page">
          <ShiniesPage constants={constants} onOpenPalette={(path) => { setRequested({ path }); setPage("palettes"); }} />
        </div>
      )}
    </div>
  );
}
