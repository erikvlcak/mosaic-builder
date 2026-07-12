import type { FigureState } from "../model/figure-state";
import type { DragPayload } from "./drag-payload";

export type DropPreview =
  | { valid: false }
  | {
      valid: true;
      // The image that would land in the hovered (target) panel.
      targetImageId: string;
      // For panel↔panel swaps where the source panel is currently occupied,
      // the source panel will receive the target's old image. `undefined` for
      // tray drags or swaps where the source was empty.
      sourceGhost?: { panelId: string; imageId: string };
    };

// Mirrors dispatchDrop's accept/reject logic. Kept in lockstep with it via
// shared tests — if the drop would be rejected, no preview is shown.
export function previewForDrop(
  state: FigureState,
  source: DragPayload,
  hoverPanelId: string | null,
): DropPreview {
  if (hoverPanelId === null) return { valid: false };
  const target = state.panels.find((p) => p.id === hoverPanelId);
  if (target === undefined) return { valid: false };

  // Panels are no longer draggable; only tray payloads reach here. (The
  // "panel" variant is retained for wire-format stability but never produced.)
  if (source.kind !== "tray") return { valid: false };

  const imageId = source.imageId;
  const sourcePanel = state.panels.find((p) => p.imageId === imageId);

  // Already placed → rearrange (move onto empty / swap onto occupied).
  if (sourcePanel !== undefined) {
    if (sourcePanel.id === hoverPanelId) return { valid: false }; // onto itself
    const out: DropPreview = { valid: true, targetImageId: imageId };
    if (target.imageId !== undefined) {
      // Swap: the target's current image ghosts back into the source panel.
      out.sourceGhost = { panelId: sourcePanel.id, imageId: target.imageId };
    }
    return out;
  }

  // Not placed yet → place / replace; the dragged image lands in the target.
  return { valid: true, targetImageId: imageId };
}
