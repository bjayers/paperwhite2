// Graphics & Palettes: the Screens page turns art from an image editor into the game's screens, and the Palettes page
// edits every palette of res/.

import { useState } from "react";
import type { ToolProps } from "../types.ts";
import { PaletteEditor } from "./PaletteEditor.tsx";
import { ScreensPage } from "./ScreensPage.tsx";

type Page = "screens" | "palettes";

export function GraphicsEditor(_props: ToolProps) {
  const [page, setPage] = useState<Page>("screens");
  const [requested, setRequested] = useState<{ path: string } | undefined>();
  return (
    <div className="gfx-editor">
      <nav className="gfx-pages view-switch">
        <button className={page === "screens" ? "active" : ""} onClick={() => setPage("screens")}>Screens</button>
        <button className={page === "palettes" ? "active" : ""} onClick={() => setPage("palettes")}>Palettes</button>
      </nav>
      {/* Both stay mounted, so a page keeps its work while the other is shown */}
      <div className={`gfx-page${page === "screens" ? "" : " hidden"}`}>
        <ScreensPage onOpenPalette={(path) => { setRequested({ path }); setPage("palettes"); }} />
      </div>
      <div className={`gfx-page${page === "palettes" ? "" : " hidden"}`}>
        <PaletteEditor requested={requested} />
      </div>
    </div>
  );
}
