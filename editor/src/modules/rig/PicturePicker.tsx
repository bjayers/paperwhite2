// A picture picker with thumbnails: each picture of the rig as a button showing its art and number, and "Hidden", the
// blank picture (Game Freak's way of turning a part off for a while: a key showing a picture that draws nothing).

import { Thumb } from "./LayerList.tsx";
import type { RigView } from "./context.ts";
import { isBlank } from "./model.ts";

export function PicturePicker({ view, value, onPick, onHide }: {
  view: RigView; value: number; onPick(picture: number): void; onHide(): void;
}) {
  const { rig } = view;
  const hiddenNow = isBlank(rig.pictures[value]);
  return (
    <div className="rig-picker-grid">
      <button className={`rig-pic hidden-pic${hiddenNow ? " active" : ""}`} onClick={onHide}
              title="Hidden: the part draws nothing from here (a picture with an empty rectangle, as Game Freak's sprites hide a part). Show another picture later to bring it back.">
        <span>Hidden</span><span className="muted">nothing</span>
      </button>
      {rig.pictures.map((p, i) => isBlank(p) ? null : (
        <button key={i} className={`rig-pic${value === i ? " active" : ""}`} onClick={() => onPick(i)}
                title={`Picture ${i}: ${p.rectangles.map((r) => `${r.size[0]}×${r.size[1]}`).join(" + ")}`}>
          <Thumb view={view} picture={i} size={36} />
          <span>{i}</span>
        </button>
      ))}
    </div>
  );
}
