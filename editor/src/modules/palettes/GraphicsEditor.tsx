// Graphics & Palettes: the Screens page turns art from an image editor into the game's screens, the Sprite sheets page
// imports sheets of OBJ art that the build packs whole, the Item icons page imports an item's bag icon, the Palettes page edits every palette of res/, and the Shinies
// page shows every Pokémon's normal and shiny colors side by side.

import { useState } from "react";
import type { ToolProps } from "../types.ts";
import { ItemIconsPage } from "./ItemIconsPage.tsx";
import { PaletteEditor } from "./PaletteEditor.tsx";
import { ScreensPage } from "./ScreensPage.tsx";
import { ShiniesPage } from "./ShiniesPage.tsx";
import { SpriteSheetsPage } from "./SpriteSheetsPage.tsx";

type Page = "screens" | "sheets" | "items" | "palettes" | "shinies";

export function GraphicsEditor({ constants }: ToolProps) {
  const [page, setPage] = useState<Page>("screens");
  const [requested, setRequested] = useState<{ path: string } | undefined>();
  const [itemsSeen, setItemsSeen] = useState(false);
  return (
    <div className="gfx-editor">
      <nav className="gfx-pages view-switch">
        <button className={page === "screens" ? "active" : ""} onClick={() => setPage("screens")}>Screens</button>
        <button className={page === "sheets" ? "active" : ""} onClick={() => setPage("sheets")}>Sprite sheets</button>
        <button className={page === "items" ? "active" : ""} onClick={() => { setPage("items"); setItemsSeen(true); }}>Item icons</button>
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
      {/* Read when first shown (the list takes the build's Python a moment), then kept */}
      {itemsSeen && (
        <div className={`gfx-page${page === "items" ? "" : " hidden"}`}>
          <ItemIconsPage />
        </div>
      )}
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
