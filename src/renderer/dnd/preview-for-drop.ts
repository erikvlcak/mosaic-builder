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

  if (source.kind === "panel") {
    if (source.panelId === hoverPanelId) return { valid: false };
    const sourcePanel = state.panels.find((p) => p.id === source.panelId);
    if (sourcePanel === undefined) return { valid: false };
    if (sourcePanel.imageId === undefined) return { valid: false };
    const out: DropPreview = {
      valid: true,
      targetImageId: sourcePanel.imageId,
    };
    if (target.imageId !== undefined) {
      out.sourceGhost = { panelId: source.panelId, imageId: target.imageId };
    }
    return out;
  }

  const imageId = source.imageId;
  if (state.panels.some((p) => p.imageId === imageId)) {
    return { valid: false };
  }
  return { valid: true, targetImageId: imageId };
}
